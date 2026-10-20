/**
 * The universal, framework-agnostic session — the lifecycle every capability shares:
 * create (or resume) the service-side session, open the main connection, attach the
 * capability's connections, recover when the session vanished, discard it on `end()`.
 * Per-capability session factories (`session/workflows/*`) compose this with their
 * connections and actions; framework bindings subscribe to its state.
 *
 * Contributor notes (never rendered):
 * - the wire "lifeline" is the public `session` connection — the main connection. When it is
 *   lost (without a workflow-not-found close), every other connection is torn down; the
 *   lifecycle status stays `active` and the next `start()` re-attaches. Every state update runs
 *   through `finalize` (derived flags) and notifies `onStateChange` only when the state object
 *   actually changed.
 * - **The transport hands back envelopes, so the resume chain is not built on exceptions any
 *   more.** `get → create(oldId) → create()` advances by *reading* `errors[0].code`, which is
 *   both clearer and the only way to keep the whole `errors[]` list: a `throw` carries one
 *   value. An expected, handled failure on the way through the chain is never written into
 *   `state.errors` — only the one the session gives up on is.
 * - **This is where wire events become classes.** `api/` speaks the wire; the conversion
 *   (`fromEvent` / `toNotice`) belongs on this side of the boundary.
 */

import { createLifelineClient, type LifelineClient } from '../api/ws/lifeline.js';
import { fromEvent, toNotice } from '../convert/inbound/common/event.js';
import { RESUMABLE_CODE, type SpeechineerError, toSpeechineerError } from '../errors/index.js';
import type { SdkLanguage } from '../errors/manifest.js';
import type { SessionNotice } from '../types/public/common/event.js';
import type { Envelope, SuccessMetaSdk } from '../types/sdk/common/envelope.js';
import type { EventSdk, LevelSdk } from '../types/sdk/common/event.js';
import type { ResolveResponseSdkBase } from '../types/sdk/workflows/base.js';
import {
  type ConnectionKey,
  type ConnectionStatus,
  finalize,
  initialState,
  type SessionState,
  withAllConnectionsClosed,
  withConnection,
  withErrors,
  withFieldValue,
  withFieldValues,
  withRequestId,
  withSessionId,
  withStatus,
  withTranscript,
  withValuesReset,
} from './state.js';
import { createStore, type Store } from './store.js';

/** The notice buckets a successful answer's `meta` can carry, in level order. */
const NOTICE_BUCKETS = [
  ['warning', 'warnings'],
  ['info', 'infos'],
  ['debug', 'debugs'],
] as const satisfies readonly (readonly [Exclude<LevelSdk, 'error'>, keyof SuccessMetaSdk])[];

/**
 * What a per-capability session factory hands to the universal session. Callbacks
 * are read at call time (pass thunks over a mutable options holder so bindings can
 * refresh them).
 *
 * @internal
 */
export interface WorkflowSessionCoreOptions<C extends ResolveResponseSdkBase> {
  /** The connections this capability uses besides `session` — present in the state from the start. */
  connections: readonly Exclude<ConnectionKey, 'session'>[];
  /**
   * The language the SDK renders its **own** messages in, read at call time.
   *
   * Everything the service sends is already translated — the session carries the language — so
   * this is only for the handful of failures raised here: a denied microphone, an unreachable
   * host, a close frame with no sentence in it.
   *
   * A thunk, for the same reason the callbacks are: it is the **session's** language (its own
   * `uiLanguage`, falling back to the client's), and a binding may change it through
   * `setOptions` between a stop and the next `start()`. Captured once, a session that switched
   * to German would keep apologising in English.
   */
  language?: () => SdkLanguage;
  /** Values the session starts with (and returns to after `end()`). */
  initialValues?: Readonly<Record<string, unknown>>;
  /** Build the create request + POST it. A `resumeSessionId` (on recovery) is the resume target. */
  createWorkflowFn: (resumeSessionId?: string) => Promise<Envelope<C>>;
  /** Fetch a live workflow by id. A live-miss answers `WORKFLOW_NOT_FOUND`, which drives resume. */
  getWorkflowFn: (sessionId: string) => Promise<Envelope<C>>;
  /** Build the delete request + POST it. */
  deleteWorkflowFn: (answer: C) => Promise<Envelope<null>>;
  /** Attach the capability's connections once the session exists and the main connection is up. */
  onSessionReady?: (answer: C) => void | Promise<void>;
  /** Detach the connections — before a recovery rebuild, on main-connection loss, on `end()`/`dispose()`. */
  onSessionTeardown?: () => void;
  onSessionStart?: (sessionId: string) => void;
  onError?: (error: SpeechineerError) => void;
  /** One non-terminal notice, already converted. */
  onNotice?: (notice: SessionNotice) => void;
  onStateChange?: (state: SessionState) => void;
}

/** @internal */
export interface WorkflowSessionCore {
  getState: () => SessionState;
  subscribe: (listener: (state: SessionState) => void) => () => void;
  /** Create (or re-attach to) the session, open the main connection, attach the connections. */
  start: () => Promise<void>;
  /** Detach the connections, close the main connection, DELETE the service-side session. */
  end: () => Promise<void>;
  /** Detach + close everything without deleting the session (unmount / page teardown). */
  dispose: () => void;
  /** Send a control frame over the main connection (e.g. the request to stop recording). */
  sendSignal: (code: string) => void;
  /** Report a connection's status (used by the connection adapters). */
  setConnection: (key: ConnectionKey, status: ConnectionStatus) => void;
  /** Record one recognized value. */
  setFieldValue: (fieldId: string, value: unknown) => void;
  /** Record several recognized values at once. */
  setFieldValues: (values: Readonly<Record<string, unknown>>) => void;
  /** Record the transcript so far. */
  setTranscript: (text: string) => void;
  /** Report a failure that did not come through start/recover (a connection or an action). */
  fail: (error: unknown) => SpeechineerError;
  /** The store, for bindings that need it directly. */
  store: Store<SessionState>;
}

/** @internal */
export function createWorkflowSession<C extends ResolveResponseSdkBase>(
  opts: WorkflowSessionCoreOptions<C>,
): WorkflowSessionCore {
  const store = createStore<SessionState>(initialState(opts.connections, opts.initialValues));
  let answer: C | null = null;
  let lifeline: LifelineClient | null = null;
  let notFoundHandled = false;
  let starting = false;
  // Bumped by end()/dispose(): an in-flight create/recover that resolves afterwards
  // must not resurrect the session.
  let generation = 0;

  const update = (fn: (s: SessionState) => SessionState): void => {
    const before = store.getState();
    store.setState((s) => finalize(fn(s)));
    const after = store.getState();
    if (after !== before) opts.onStateChange?.(after);
  };

  const setConnection = (key: ConnectionKey, status: ConnectionStatus): void =>
    update((s) => withConnection(s, key, status));

  const teardownConnections = (): void => {
    opts.onSessionTeardown?.();
    update((s) => withAllConnectionsClosed(s));
  };

  /** One notice, from either transport, to the callback. */
  const notice = (level: Exclude<LevelSdk, 'error'>, event: EventSdk): void => opts.onNotice?.(toNotice(level, event));

  /**
   * Record the whole failure list and report every element.
   *
   * Returns `errors[0]` — cause-ordered, so it is the informative one and the one a thrown
   * value should be.
   */
  const recordFailure = (errors: readonly EventSdk[], requestId?: string | null): SpeechineerError => {
    const converted = errors.map((e) => fromEvent(e));
    update((s) => withRequestId(withStatus(withErrors(s, converted), 'failed'), requestId));
    for (const error of converted) opts.onError?.(error);
    return converted[0] ?? toSpeechineerError(undefined);
  };

  /** A success's `meta`: keep the request id, fan the advisory notices out per element. */
  const recordSuccess = (meta: SuccessMetaSdk | undefined): void => {
    update((s) => withRequestId(s, meta?.request_id));
    if (!meta) return;
    for (const [level, bucket] of NOTICE_BUCKETS) {
      for (const event of (meta[bucket] as EventSdk[] | undefined) ?? []) notice(level, event);
    }
  };

  /** The payload, or a throw carrying `errors[0]` once the whole list is recorded. */
  const unwrap = (envelope: Envelope<C>): C => {
    if (!envelope.ok) throw recordFailure(envelope.errors, envelope.meta?.request_id);
    recordSuccess(envelope.meta);
    return envelope.data;
  };

  /** Is this failure the one a resume can fix — an id that names no session? */
  const isResumable = (envelope: Envelope<C>): boolean => !envelope.ok && envelope.errors[0]?.code === RESUMABLE_CODE;

  /**
   * Record a failure that has not been recorded yet.
   *
   * The identity check is load-bearing. `unwrap` already recorded the envelope's **whole** list
   * and reported every element, and then threw `errors[0]`; a blanket record here would report
   * that one twice *and* replace the list with just it. So anything already in the state passes
   * straight through.
   */
  const failWith = (e: unknown): SpeechineerError => {
    const err = toSpeechineerError(e, opts.language?.());
    if (store.getState().errors.includes(err)) {
      update((s) => withStatus(s, 'failed'));
      return err;
    }
    update((s) => withErrors(withStatus(s, 'failed'), [err]));
    opts.onError?.(err);
    return err;
  };

  const setupLifeline = (c: C): void => {
    if (lifeline?.wsRef.current?.readyState === WebSocket.OPEN) return;
    const client = createLifelineClient(c.connection.lifeline_ws_url, {
      onConnected: () => setConnection('session', 'open'),
      onDisconnected: () => {
        setConnection('session', 'closed');
        // The main connection is gone: unless a recovery is already rebuilding the
        // session, every other connection goes with it. The lifecycle stays `active` —
        // the session may still exist; the next start() re-attaches.
        if (!notFoundHandled) teardownConnections();
      },
      onNotice: notice,
      onTerminal: (event) => {
        // The session is over — whether it crashed or ran out of allowance, and whether that
        // arrived as a frame or as the close frame of a connection opened too late. The close
        // that follows tears the connections down.
        //
        // **And the status says so.** This used to record the failure and leave the lifecycle
        // alone, so a dead session still read `active` and `status` could not be trusted on its
        // own — a caller had to check `errors.length` as well, which nothing told them. `failed`
        // already means exactly this ("see `errors`; `start()` may be called again"), and it is
        // what §4.9 asks for when it says a failed creation should behave "exactly as a crashed
        // workflow does": one terminal status that both arrive at. Which of the two it was stays
        // legible in `errors[0].code`.
        const error = fromEvent(event);
        update((s) => withErrors(withStatus(s, 'failed'), [error]));
        opts.onError?.(error);
      },
      onWorkflowNotFound: () => recover(),
      // The thunk, not a value: a close frame can arrive long after the session was created,
      // and its fallback sentences should be in the language the session is running in *now*.
      language: opts.language,
    });
    lifeline = client;
    setConnection('session', 'connecting');
    client.connect();
  };

  // Adopt a freshly created/fetched answer: store it, announce it, attach the main
  // connection + the connections. Main connection first — failure / not-found detection
  // must cover the connections.
  const activate = async (c: C): Promise<void> => {
    answer = c;
    update((s) => withStatus(withErrors(withSessionId(s, c.session_id), []), 'active'));
    opts.onSessionStart?.(c.session_id);
    setupLifeline(c);
    await opts.onSessionReady?.(c);
  };

  const start = async (): Promise<void> => {
    if (starting) return;
    starting = true;
    try {
      const existing = answer;
      if (existing) {
        // Reconnect after a stop, a lost main connection, or a failed attach (e.g. a denied
        // microphone). The service is re-seeded FIRST, through the same chain used on an
        // involuntary loss: `get` while the session is still live, `create` with the old id
        // once it has been archived, a fresh `create` when it is gone entirely. All three
        // carry the `state` scope, so whatever the app holds now — values a user typed into
        // the form while it was stopped — reaches the service before the next extraction,
        // and it does so whether or not the session survived the pause.
        //
        // Sending a blank payload is not destructive: the service keeps what it already
        // extracted unless the client actually carries a value. Re-attaching without this
        // call was silent, so anything entered between a stop and the next start was lost.
        notFoundHandled = false;
        update((s) => withStatus(withErrors(s, []), 'active'));
        // This branch awaits a network round trip, so end()/dispose() can land while it is in
        // flight — the same race the create path below already guards.
        const gen = generation;
        const refreshed = await resumeOrCreate(existing.session_id);
        if (gen !== generation) {
          // Cancelled meanwhile: do not resurrect the session, and do not leave a new one
          // orphaned. An unchanged id was already deleted by the end() that cancelled us.
          if (refreshed.session_id !== existing.session_id) {
            void opts.deleteWorkflowFn(refreshed).catch(() => {});
          }
          return;
        }
        if (refreshed.session_id === existing.session_id) {
          // The same live session, now re-seeded: re-attach WITHOUT announcing a new start —
          // `activate` would fire `onSessionStart`, and this is not a new session.
          answer = refreshed;
          setupLifeline(refreshed);
          await opts.onSessionReady?.(refreshed);
        } else {
          // A different id came back, so this genuinely is a new session — announce it. (A
          // resume normally returns the SAME id, since the service reuses the session; a new
          // one means it was gone entirely and a fresh session was created.)
          await activate(refreshed);
        }
        return;
      }
      update((s) => withStatus(withErrors(s, []), 'starting'));
      const gen = generation;
      const created = unwrap(await opts.createWorkflowFn());
      if (gen !== generation) {
        // end()/dispose() happened meanwhile — do not adopt the orphan.
        void opts.deleteWorkflowFn(created).catch(() => {});
        return;
      }
      await activate(created);
    } catch (e) {
      // Reported AND thrown. It still reaches `state.errors` and `onError` — a UI bound to the
      // state needs no try/catch — but `await start()` rejects instead of resolving on a
      // session that never started, which is what `await` means everywhere else in JS. The
      // docs claimed this already; swallowing it meant an app that awaited `start()` and then
      // called an action got a second, more confusing failure instead of the real one.
      throw failWith(e);
    } finally {
      starting = false;
    }
  };

  /**
   * `get` while the session is live, `create` with the old id once it is archived, a fresh
   * `create` when it is gone entirely.
   *
   * Only `WORKFLOW_NOT_FOUND` advances the chain. The narrowing is the point: a 404 also
   * answers a form that does not exist or a version that was never published, and retrying
   * those as "the session expired" is what used to report a permanent misconfiguration three
   * times over and then hide the code that said what was wrong.
   */
  const resumeOrCreate = async (oldSessionId: string): Promise<C> => {
    const live = await opts.getWorkflowFn(oldSessionId);
    if (live.ok || !isResumable(live)) return unwrap(live);
    const archived = await opts.createWorkflowFn(oldSessionId);
    if (archived.ok || !isResumable(archived)) return unwrap(archived);
    return unwrap(await opts.createWorkflowFn());
  };

  const recover = (): void => {
    if (notFoundHandled) return;
    notFoundHandled = true;
    void (async () => {
      try {
        teardownConnections();
        lifeline?.disconnect();
        lifeline = null;
        const oldSessionId = answer?.session_id ?? '';
        answer = null;
        update((s) => withStatus(withConnection(s, 'session', 'closed'), 'recovering'));
        const gen = generation;
        const recovered = await resumeOrCreate(oldSessionId);
        if (gen !== generation) return; // end()/dispose() won
        await activate(recovered);
        // New session is live — allow the next involuntary loss to recover too.
        notFoundHandled = false;
      } catch (e) {
        failWith(e);
      }
    })();
  };

  const closeMainConnection = (): void => {
    lifeline?.disconnect();
    lifeline = null;
    update((s) => withConnection(s, 'session', 'closed'));
  };

  const end = async (): Promise<void> => {
    generation += 1;
    update((s) => withStatus(s, 'ending'));
    teardownConnections();
    closeMainConnection();
    const c = answer;
    answer = null;
    notFoundHandled = false;
    // Held, not swallowed, and held in a way that cannot skip the teardown below: the
    // connections are already down and the app has to reach `idle` whatever the server said.
    // `await end()` still rejects afterwards, because "the session may still be running on the
    // server" is something the caller has to be able to learn — it used to be a `console.warn`
    // nobody could catch. An awaited call that throws (rather than answering an envelope) has to
    // be caught here too, or the `idle` update below never runs.
    let failure: unknown;
    if (c) {
      try {
        const discarded = await opts.deleteWorkflowFn(c);
        if (!discarded.ok) failure = fromEvent(discarded.errors[0]);
      } catch (e) {
        failure = e;
      }
    }
    update((s) => withValuesReset(withStatus(withSessionId(s, null), 'idle'), opts.initialValues));
    // `fail`, not `failWith`: the session really did end, so the status stays `idle`. Only the
    // server-side delete is in doubt, and that is what the error reports.
    if (failure !== undefined) throw fail(failure);
  };

  const dispose = (): void => {
    generation += 1;
    teardownConnections();
    closeMainConnection();
  };

  /**
   * Send one client-originated control frame.
   *
   * Client frames are `info`-level by contract: they are requests, not failures, and the
   * service's `CLIENT_SIGNALS` map is keyed by the declaration's UPPER_SNAKE `code`.
   */
  const sendSignal = (code: string): void => {
    lifeline?.sendFrame('info', { code });
  };

  const fail = (error: unknown): SpeechineerError => {
    const err = toSpeechineerError(error, opts.language?.());
    update((s) => withErrors(s, [err]));
    opts.onError?.(err);
    return err;
  };

  return {
    getState: store.getState,
    subscribe: store.subscribe,
    start,
    end,
    dispose,
    sendSignal,
    setConnection,
    setFieldValue: (fieldId, value) => update((s) => withFieldValue(s, fieldId, value)),
    setFieldValues: (values) => update((s) => withFieldValues(s, values)),
    setTranscript: (text) => update((s) => withTranscript(s, text)),
    fail,
    store,
  };
}
