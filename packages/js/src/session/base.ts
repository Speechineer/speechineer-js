/**
 * The universal, framework-agnostic session — the lifecycle every capability shares:
 * create (or resume) the service-side session, open the main connection, attach the
 * capability's connections, recover when the session vanished, discard it on `end()`.
 * Per-capability session factories (`session/workflows/*`) compose this with their
 * connections and actions; framework bindings subscribe to its state.
 *
 * Contributor note: the wire "lifeline" is the public `session` connection — the main
 * connection. When it is lost (without a workflow-not-found close), every other
 * connection is torn down; the lifecycle status stays `active` and the next `start()`
 * re-attaches. Every state update runs through `finalize` (derived flags) and notifies
 * `onStateChange` only when the state object actually changed.
 */

import { WorkflowNotFoundError } from '../api/workflows/_post.js';
import { createLifelineClient, type LifelineClient } from '../api/ws/lifeline.js';
import { type ErrorPhase, fromCrashSignal, type SpeechineerError, toSpeechineerError } from '../errors.js';
import type { CrashPayload, LifelineSignal } from '../types/sdk/common/lifeline.js';
import type { ResolveResponseSdkBase } from '../types/sdk/workflows/base.js';
import {
  type ConnectionKey,
  type ConnectionStatus,
  finalize,
  initialState,
  type SessionState,
  withAllConnectionsClosed,
  withConnection,
  withError,
  withFieldValue,
  withFieldValues,
  withSessionId,
  withStatus,
  withTranscript,
  withValuesReset,
} from './state.js';
import { createStore, type Store } from './store.js';

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
  /** Values the session starts with (and returns to after `end()`). */
  initialValues?: Readonly<Record<string, unknown>>;
  /** Build the create request + POST it. A `resumeSessionId` (on recovery) is the resume target. */
  createWorkflowFn: (resumeSessionId?: string) => Promise<C>;
  /** Fetch a live workflow by id; rejects with `WorkflowNotFoundError` on a live-miss. */
  getWorkflowFn: (sessionId: string) => Promise<C>;
  /** Build the delete request + POST it. */
  deleteWorkflowFn: (answer: C) => Promise<void>;
  /** Attach the capability's connections once the session exists and the main connection is up. */
  onSessionReady?: (answer: C) => void | Promise<void>;
  /** Detach the connections — before a recovery rebuild, on main-connection loss, on `end()`/`dispose()`. */
  onSessionTeardown?: () => void;
  onSessionStart?: (sessionId: string) => void;
  onError?: (error: SpeechineerError) => void;
  /** Every wire signal (the caller translates it to a `SessionEvent`). */
  onEvent?: (signal: LifelineSignal) => void;
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
  /** Send a control signal over the main connection (e.g. `stop_recording_requested`). */
  sendSignal: (type: string) => void;
  /** Report a connection's status (used by the connection adapters). */
  setConnection: (key: ConnectionKey, status: ConnectionStatus) => void;
  /** Record one recognized value. */
  setFieldValue: (fieldId: string, value: unknown) => void;
  /** Record several recognized values at once. */
  setFieldValues: (values: Readonly<Record<string, unknown>>) => void;
  /** Record the transcript so far. */
  setTranscript: (text: string) => void;
  /** Report a failure that did not come through start/recover (a connection or an action). */
  fail: (error: unknown, phase: ErrorPhase) => SpeechineerError;
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

  const failWith = (phase: ErrorPhase, e: unknown): SpeechineerError => {
    const err = toSpeechineerError(e, phase);
    update((s) => withError(withStatus(s, 'failed'), err));
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
      onSignal: (sig) => opts.onEvent?.(sig),
      onCrash: (crash: LifelineSignal & { payload: CrashPayload }) => {
        // The service stopped the session: a typed, non-recoverable error. The close
        // that follows tears the connections down; the lifecycle is left to it.
        const err = fromCrashSignal(crash);
        update((s) => withError(s, err));
        opts.onError?.(err);
      },
      onWorkflowNotFound: () => recover(),
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
    update((s) => withStatus(withError(withSessionId(s, c.session_id), null), 'active'));
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
        update((s) => withStatus(withError(s, null), 'active'));
        // This branch now awaits a network round trip, so end()/dispose() can land while it
        // is in flight — the same race the create path below already guards.
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
      update((s) => withStatus(withError(s, null), 'starting'));
      const gen = generation;
      const created = await opts.createWorkflowFn();
      if (gen !== generation) {
        // end()/dispose() happened meanwhile — do not adopt the orphan.
        void opts.deleteWorkflowFn(created).catch(() => {});
        return;
      }
      await activate(created);
    } catch (e) {
      failWith('start', e);
    } finally {
      starting = false;
    }
  };

  // get → create-on-404 → fresh-on-404 (create owns resume). Non-404 errors propagate.
  const resumeOrCreate = async (oldSessionId: string): Promise<C> => {
    try {
      return await opts.getWorkflowFn(oldSessionId);
    } catch (e) {
      if (!(e instanceof WorkflowNotFoundError)) throw e;
    }
    try {
      return await opts.createWorkflowFn(oldSessionId);
    } catch (e) {
      if (!(e instanceof WorkflowNotFoundError)) throw e;
    }
    return opts.createWorkflowFn();
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
        failWith('recover', e);
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
    if (c) {
      try {
        await opts.deleteWorkflowFn(c);
      } catch (e) {
        console.warn('[speechineer] Failed to delete the session on end():', e);
      }
    }
    update((s) => withValuesReset(withStatus(withSessionId(s, null), 'idle'), opts.initialValues));
  };

  const dispose = (): void => {
    generation += 1;
    teardownConnections();
    closeMainConnection();
  };

  const sendSignal = (type: string): void => {
    lifeline?.sendSignal({ type, session_id: answer?.session_id ?? '' });
  };

  const fail = (error: unknown, phase: ErrorPhase): SpeechineerError => {
    const err = toSpeechineerError(error, phase);
    update((s) => withError(s, err));
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
