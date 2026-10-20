/**
 * The frame — one message on the main connection, in **both** directions. Mirrors
 * `speechineer_protocol.transport.websocket`.
 *
 * Contributor notes (not rendered):
 * - **Shape:** `{ level, [level]: EventSdk, meta }`. The event is filed under the field its own
 *   level names, so `{level:"warning", warning:{…}}` and `{level:"error", error:{…}}`. The old
 *   `{event, verbosity, source, error?, data?, session_id, timestamp}` is gone — not renamed,
 *   gone: the level *is* the terminality and the event carries its own `code`, so the separate
 *   `event` name and the `error`-is-present test both became second answers to questions the
 *   level already answers.
 * - **One reader serves both directions.** `eventOf` mirrors the service's `event_of`
 *   byte-for-byte, including the field-matches-level rule, because the service reads the frames
 *   this SDK sends with exactly that function. A frame it would refuse is a frame that silently
 *   does nothing.
 * - **`eventOf` returns `null`, it never throws.** An unknown or malformed frame from a newer
 *   producer must not break a consumer that was happily reading the ones before it. Not breaking
 *   is not the same as staying silent, though: the *service* now reports what it drops as a
 *   declared warning, and so should anything here that drops a frame.
 */

import { type EventSdk, isLevel, type LevelSdk } from './event.js';

/**
 * The frame's own meta — about the delivery, not about the event.
 *
 * `source` is **graded**: the service marks it debug-level, so it is absent unless the session
 * is running at `debug` visibility. Anything that treats it as required will read `undefined` on
 * a normal session.
 */
export interface FrameMetaSdk {
  session_id: string;
  /** ISO-8601 UTC timestamp of emission. */
  timestamp: string;
  /** Which part of the session reported it — present only at `debug` visibility. */
  source?: string | null;
}

/**
 * One frame. The event lives under the key its `level` names, which is why this is an index
 * signature rather than five optional fields: `eventOf` is the only sanctioned way to read it.
 */
export interface FrameSdk {
  level: LevelSdk;
  meta?: FrameMetaSdk;
  [level: string]: unknown;
}

/**
 * The level and the event carried by a frame, or `null` if it is not a frame at all.
 *
 * Mirrors the service's `event_of`. The field-matches-level rule is enforced here, so a frame
 * that disagrees with itself is refused rather than read under the wrong level.
 */
export function eventOf(message: unknown): { level: LevelSdk; event: EventSdk } | null {
  if (typeof message !== 'object' || message === null) return null;
  const frame = message as Record<string, unknown>;
  if (!isLevel(frame.level)) return null;
  const event = frame[frame.level];
  if (typeof event !== 'object' || event === null || Array.isArray(event)) return null;
  return { level: frame.level, event: event as EventSdk };
}

/**
 * Is this frame the session ending?
 *
 * **The level is the terminality, nothing else.** The old test — "an `error` key is present" —
 * happened to keep working across the contract change because that key name did not move, which
 * is precisely why it was worth replacing: it agreed with the level by luck, not by rule.
 */
export function isTerminalLevel(level: LevelSdk): boolean {
  return level === 'error';
}
