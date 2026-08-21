/**
 * The observable state of a session — what every capability, in every framework,
 * reports about itself. One immutable object: the lifecycle, the identifier once the
 * session exists, the last error, one entry per connection the session uses, the
 * latest value of every field, the transcript so far, and the derived flags a UI
 * renders from (`isListening`, `isConnecting`, `isEnding`).
 *
 * Contributor note (never rendered): the `session` connection is the wire lifeline —
 * that name stays internal; publicly it is "the session connection". The flags are
 * recomputed by `finalize` on every update so that every state object is consistent.
 */

import type { SpeechineerError } from '../errors.js';

/**
 * Where the session is in its life.
 *
 * - `idle` — nothing started yet (or the session was ended).
 * - `starting` — the session is being created and its connection opened.
 * - `active` — the session exists; `isListening` and `connections` tell you what it is doing.
 * - `recovering` — the session vanished on the server and is being resumed.
 * - `ending` — `end()` is discarding the session.
 * - `failed` — starting or recovering threw; see `error`. `start()` may be called again.
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
  /** The last error, or `null`. Cleared when the next `start()` succeeds. */
  readonly error: SpeechineerError | null;
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
 * The state before anything happens: `idle`, no id, no error, every declared
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
    error: null,
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

/** @internal */
export function withError(state: SessionState, error: SpeechineerError | null): SessionState {
  return state.error === error ? state : { ...state, error };
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
