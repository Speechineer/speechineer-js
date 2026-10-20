/**
 * The dev-facing event vocabulary — camelCase, and the one shape everything Speechineer reports
 * shares.
 *
 * Contributor notes (not rendered): this mirrors the service's `Event` root. There, the declaring
 * class **is** the event: a failure is an `Event` that also happens to be raisable, and every
 * warning / info / debug is an `Event` that is not. All four levels serialise to the same five
 * fields, so the SDK models that with one interface rather than two unrelated types.
 *
 * `SpeechineerError` cannot *extend* a shared base — it has to extend `Error` to carry a stack,
 * and TypeScript has single inheritance — so the shared root is an **interface** that both the
 * error class and the notice type satisfy. That is what makes `onEvent` typeable: it receives
 * everything, errors included, and `level === 'error'` narrows to the terminal case.
 *
 * **The root is the whole event, and nothing else is bolted on.** `session_id`, `timestamp` and
 * `source` are NOT event fields — on the service side they live in `FrameMeta`, the frame's own
 * meta, which is about the delivery rather than about what happened. They stay in the transport
 * layer (`types/sdk/common/lifeline.ts`); flattening them onto a notice here would invent a shape
 * the wire does not have, and they would be absent half the time anyway — a notice that rode back
 * in an HTTP answer's `meta.warnings` has no frame to carry them.
 */

import type { LevelSdk } from '../../sdk/common/event.js';

/**
 * How severe something is — and, for `error`, that the session is over.
 *
 * There is no `critical`: nothing ever emitted one, and it named a severity no handler treated
 * differently from `error`.
 *
 * @group Events and errors
 */
export type EventLevel = LevelSdk;

/**
 * Anything Speechineer reports, at any level — a failure, a warning, a progress note.
 *
 * This is what `onEvent` receives, so it is the one shape worth learning. **`level` is the
 * terminality**: `'error'` means the session is over and nothing else does, so you never have to
 * inspect a code to find out whether you can keep going.
 *
 * @group Events and errors
 */
export interface SpeechineerEvent {
  /** `'error'` means the session ended. The other three are advisory. */
  level: EventLevel;
  /** The category — handle a whole family at once without enumerating codes. */
  type: string;
  /** A stable identifier for what happened. Branch on this, not on a message. */
  code: string;
  /** For the person using your app, in the session's language. Show this one. */
  userMessage: string;
  /** For you: what happened and what to do about it. Belongs in your logs. */
  devMessage: string;
  /** Data belonging to this particular event — the shape depends on `code`. */
  meta: Record<string, unknown> | null;
}

/**
 * One thing that happened while the session kept running — delivered to `onWarning`, `onInfo`
 * or `onDebug`, and to `onEvent` along with everything else.
 *
 * Notices are advisory by definition: a connection re-establishing itself, a setting the service
 * could not honour as asked, a stage of the work finishing. Anything that *ends* the session is
 * not a notice — it arrives as a `SpeechineerError` through `onError` and `state.errors`.
 *
 * Identical to {@link SpeechineerEvent} but for the narrower `level`; it adds no fields, because
 * the event is the whole report.
 *
 * @group Events and errors
 */
export interface SessionNotice extends SpeechineerEvent {
  /** Never `'error'` — a notice that ended the session would be a contradiction. */
  level: Exclude<EventLevel, 'error'>;
}
