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
 * One status event from a running session, delivered to `onEvent`. Events are
 * informational — progress, warnings, and failures alike — and are useful for logging
 * or a live status display. Failures also reach you as a typed `SpeechineerError`
 * through `onError`, so you rarely need to branch on events yourself.
 *
 * @group Events and errors
 */
export interface SessionEvent {
  /** What happened, as a stable identifier you can branch on. */
  type: string;
  /** How important this event is — filter your logging with it. */
  level: EventLevel;
  /** Which part of the session reported it. */
  source: string;
  /** Details that belong to this event type; the shape depends on `type`. */
  payload: Record<string, unknown>;
  /** The session this event belongs to. */
  sessionId: string;
  /** ISO-8601 UTC timestamp of emission. */
  timestamp: string;
}
