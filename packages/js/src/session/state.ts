/**
 * The observable state of a session — what every capability, in every framework,
 * reports about itself. One immutable object: the lifecycle, the identifier once the
 * session exists, the failures reported so far, one entry per connection the session uses, the
 * latest value of every field, the transcript so far, and the derived flags a UI
 * renders from (`isListening`, `isConnecting`, `isEnding`).
 *
 * Contributor notes (never rendered):
 * - the `session` connection is the wire lifeline — that name stays internal; publicly it is
 *   "the session connection". The flags are recomputed by `finalize` on every update so that
 *   every state object is consistent.
 * - **`errors` is a list and there is no `error` alias.** A failure answer carries `errors[]`,
 *   cause-ordered with the root cause first, and nothing may be dropped — so the state holds the
 *   list rather than its first element. An alias would have made the singular the one everybody
 *   reads and the list the one nobody does.
 * - **`requestId` lives here, not on the error.** It belongs to the answer's `meta`, which is
 *   delivery metadata about the call — the same reason `session_id` is not one of an event's
 *   fields. Strip-mining it onto one error of several was what this replaced.
 */

import type { SpeechineerError } from '../errors/index.js';

/**
 * Where the session is in its life.
 *
 * - `idle` — nothing started yet (or the session was ended).
 * - `starting` — the session is being created and its connection opened.
 * - `active` — the session exists; `isListening` and `connections` tell you what it is doing.
 * - `recovering` — the session vanished on the server and is being resumed.
 * - `ending` — `end()` is discarding the session.
 * - `failed` — the session is not usable: starting or recovering did not succeed, **or** a
 *   running session ended because something failed (a crash, a spent allowance). See `errors`;
 *   `errors[0].code` says which. `start()` may be called again.
 *
 * @group Session state
 */
export type SessionStatus = 'idle' | 'starting' | 'active' | 'recovering' | 'ending' | 'failed';

/**
 * Whether one connection of the session is open. `closing` is reported by the
 * microphone connection between `stop()` and the moment capture has fully wound down.
 *
 * @group Session state
 */
export type ConnectionStatus = 'closed' | 'connecting' | 'open' | 'closing';

/**
 * The connections a session may have. `session` is the main connection every
 * session has — when it is lost, every other connection is closed as well.
 * `audio` carries the microphone, `results` the recognized values, `transcript`
 * the spoken text. A session only lists the connections its capability uses.
 *
 * @group Session state
 */
export type ConnectionKey = 'session' | 'audio' | 'results' | 'transcript';

/**
 * The state of one connection.
 *
 * @group Session state
 */
export interface ConnectionState {
  readonly status: ConnectionStatus;
}

/**
 * The connections of a session: `session` always, the others only when the
 * capability uses them.
 *
 * @group Session state
 */
export type SessionConnections = { readonly session: ConnectionState } & Readonly<
  Partial<Record<Exclude<ConnectionKey, 'session'>, ConnectionState>>
>;

/**
 * Everything a session reports about itself. Read it with `getState()`, receive it
 * through `subscribe` / `onStateChange`, or — in React and Angular — take it from the
 * hook / inject result. Render your UI from it. The object is immutable — every change
 * produces a new one — so it is safe to compare by reference.
 *
 * @group Session state
 */
export interface SessionState {
  /** Where the session is in its life — see {@link SessionStatus}. */
  readonly status: SessionStatus;
  /** The id of the running session, or `null` before it exists. */
  readonly sessionId: string | null;
  /**
   * Everything that has failed, root cause first — empty when nothing has.
   *
   * A single request can report several problems at once (a rejected form names every offending
   * field), and a session that ends reports the one failure that ended it. Read `errors[0]` for
   * the cause to show; the rest is the context it arrived with.
   *
   * Cleared when the next `start()` succeeds.
   */
  readonly errors: readonly SpeechineerError[];
  /**
   * The id of the most recent answer, or `null`. Quote it when reporting a problem: the same id
   * follows the request through every part of Speechineer that handled it.
   */
  readonly requestId: string | null;
  /** The status of each connection: `session` always, the others when the capability uses them. */
  readonly connections: SessionConnections;
  /**
   * The latest recognized value of every field, keyed by the field id you gave it.
   * Starts with `initialValues` (if any) and grows as values are recognized; a
   * refined value replaces the earlier one.
   */
  readonly values: Readonly<Record<string, unknown>>;
  /** The spoken text so far (the full accumulated transcript), or `''` when the session does not stream it. */
  readonly transcript: string;
  /** The microphone is on and audio is being sent. */
  readonly isListening: boolean;
  /** The session or one of its connections is being established. */
  readonly isConnecting: boolean;
  /** The session is being finished (`end()`), or the microphone is winding down after `stop()`. */
  readonly isEnding: boolean;
}

const CLOSED: ConnectionState = { status: 'closed' };
const NO_VALUES: Readonly<Record<string, unknown>> = Object.freeze({});
const NO_ERRORS: readonly SpeechineerError[] = Object.freeze([]);

/** Recompute the derived flags; returns the same reference when nothing changed. @internal */
export function finalize(state: SessionState): SessionState {
  const isListening = state.connections.audio?.status === 'open';
  const isConnecting =
    state.status === 'starting' ||
    state.status === 'recovering' ||
    Object.values(state.connections).some((c) => c?.status === 'connecting');
  const isEnding = state.status === 'ending' || state.connections.audio?.status === 'closing';
  if (state.isListening === isListening && state.isConnecting === isConnecting && state.isEnding === isEnding) {
    return state;
  }
  return { ...state, isListening, isConnecting, isEnding };
}

/**
 * The state before anything happens: `idle`, no id, no errors, every declared
 * connection `closed`, `values` = the initial values, empty transcript.
 *
 * @internal
 */
export function initialState(
  connectionKeys: readonly Exclude<ConnectionKey, 'session'>[],
  initialValues?: Readonly<Record<string, unknown>>,
): SessionState {
  const extra: Partial<Record<Exclude<ConnectionKey, 'session'>, ConnectionState>> = {};
  for (const key of connectionKeys) extra[key] = CLOSED;
  return finalize({
    status: 'idle',
    sessionId: null,
    errors: NO_ERRORS,
    requestId: null,
    connections: { session: CLOSED, ...extra },
    values: initialValues ? { ...initialValues } : NO_VALUES,
    transcript: '',
    isListening: false,
    isConnecting: false,
    isEnding: false,
  });
}

/** @internal */
export function withStatus(state: SessionState, status: SessionStatus): SessionState {
  return state.status === status ? state : { ...state, status };
}

/** @internal */
export function withSessionId(state: SessionState, sessionId: string | null): SessionState {
  return state.sessionId === sessionId ? state : { ...state, sessionId };
}

/**
 * Replace the failure list. Pass `[]` to clear it.
 *
 * @internal
 */
export function withErrors(state: SessionState, errors: readonly SpeechineerError[]): SessionState {
  const next = errors.length === 0 ? NO_ERRORS : errors;
  if (state.errors === next) return state;
  if (state.errors.length === 0 && next.length === 0) return state;
  return { ...state, errors: next };
}

/** @internal */
export function withRequestId(state: SessionState, requestId: string | null | undefined): SessionState {
  const next = requestId ?? null;
  // An answer without a request id does not erase the one already known: the last id that
  // actually identified a call is more useful to quote than `null`.
  if (next === null || state.requestId === next) return state;
  return { ...state, requestId: next };
}

/** @internal */
export function withConnection(state: SessionState, key: ConnectionKey, status: ConnectionStatus): SessionState {
  const current = state.connections[key];
  if (current?.status === status) return state;
  return { ...state, connections: { ...state.connections, [key]: { status } } };
}

/** All connections other than `session` → `closed` (used when the main connection is lost). @internal */
export function withAllConnectionsClosed(state: SessionState): SessionState {
  let next = state;
  for (const key of Object.keys(state.connections) as ConnectionKey[]) next = withConnection(next, key, 'closed');
  return next;
}

/** One recognized value; the same value again leaves the state untouched. @internal */
export function withFieldValue(state: SessionState, fieldId: string, value: unknown): SessionState {
  if (fieldId in state.values && Object.is(state.values[fieldId], value)) return state;
  return { ...state, values: { ...state.values, [fieldId]: value } };
}

/** Several recognized values at once (an action result). @internal */
export function withFieldValues(state: SessionState, values: Readonly<Record<string, unknown>>): SessionState {
  let next = state;
  for (const [fieldId, value] of Object.entries(values)) next = withFieldValue(next, fieldId, value);
  return next;
}

/** @internal */
export function withTranscript(state: SessionState, transcript: string): SessionState {
  return state.transcript === transcript ? state : { ...state, transcript };
}

/** Back to the initial values and an empty transcript (after `end()`). @internal */
export function withValuesReset(state: SessionState, initialValues?: Readonly<Record<string, unknown>>): SessionState {
  return { ...state, values: initialValues ? { ...initialValues } : NO_VALUES, transcript: '' };
}
