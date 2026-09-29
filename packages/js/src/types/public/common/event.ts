/**
 * Dev-facing camelCase event type. `convert/inbound/common/signal.ts` maps the wire
 * `LifelineSignal` to `SessionEvent` before it reaches `onEvent`. `EventLevel` is the plain
 * value union reused from the wire.
 */

import type { LogVerbosity } from '../../sdk/common/lifeline.js';

/**
 * How important an event is — from `debug` chatter to `critical` failures. Filter
 * your logging on it.
 *
 * @group Events and errors
 */
export type EventLevel = LogVerbosity;

/**
 * One status event from a running session, delivered to `onEvent`.
 *
 * Events are **progress**, useful for logging or a live status display: a connection
 * re-establishing itself, a recording gesture, a connection Speechineer refused. Anything
 * that *ends* the session is not an event at all — it reaches you as a typed
 * `SpeechineerError` through `onError` and `state.error`, so you never have to inspect an
 * event to find out whether the session is still alive.
 *
 * @group Events and errors
 */
export interface SessionEvent {
  /** What happened, as a stable identifier you can branch on. */
  event: string;
  /** How important this event is — filter your logging with it. */
  level: EventLevel;
  /** Which part of the session reported it. */
  source: string;
  /** Details belonging to this event; the shape depends on `event`. */
  data: Record<string, unknown>;
  /** The session this event belongs to. */
  sessionId: string;
  /** ISO-8601 UTC timestamp of emission. */
  timestamp: string;
}
