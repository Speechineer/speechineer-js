/**
 * Dev-facing callback fragments. `SessionCallbacks` are UNIVERSAL (every session has a
 * connection and a lifecycle). `FormValueCallbacks` / `TranscriptCallbacks` are added by the
 * capabilities that produce values / spoken text. Everything a callback reports is ALSO in
 * the session state (`values`, `transcript`, `errors`, …) — callbacks exist for imperative
 * integrations (form libraries, logging), not as the only way to read results.
 *
 * Contributor notes (not rendered): there is one hook per level plus `onEvent` for all of them,
 * which is only typeable because a failure and a notice share the `SpeechineerEvent` root. Each
 * fires **per element**: a frame carries one event, and a successful answer's
 * `meta.warnings` / `infos` / `debugs` carry a list, so one answer can fire `onWarning` several
 * times. That is deliberate — the alternative is handing the caller an array and making every
 * integration loop.
 */

import type { SpeechineerError } from '../../../errors/index.js';
import type { SessionState } from '../../../session/state.js';
import type { SessionNotice, SpeechineerEvent } from './event.js';

/**
 * The callbacks every session accepts. All of them are optional: a session runs
 * without any, and you add the ones your integration reacts to. Everything they
 * report is also visible in the session state, so a UI that renders from the
 * state needs none of them.
 *
 * @group Callbacks
 */
export interface SessionCallbacks {
  /**
   * Fires once, as soon as the session exists and work can begin. Receives the
   * session id — keep it if you want to correlate it with your own logs.
   */
  onSessionStart?: (sessionId: string) => void;
  /**
   * The session state changed — its lifecycle, its id, a value, the transcript,
   * an error, or the status of one of its connections. Receives the whole new
   * state; render from it.
   */
  onStateChange?: (state: SessionState) => void;
  /**
   * **Everything** Speechineer reports for this session, at every level, failures included.
   *
   * One stream for logging or a live status display. `event.level` tells you what you have:
   * `'error'` means the session is over, and the other three are advisory. If you only want one
   * level, take the matching hook below instead.
   */
  onEvent?: (event: SpeechineerEvent) => void;
  /**
   * Something failed in a way you should handle: a rejected request, a denied
   * microphone permission, a lost connection, or a failure Speechineer reported
   * while the session ran. Branch on `error.code` for the exact cause, or on the
   * error's class (`SpeechineerQuotaError`, `SpeechineerRuntimeError`, …) to
   * handle a whole family at once.
   *
   * Fires once per failure, so one rejected request reporting several problems calls this
   * several times — the same list you can read as `errors` in the session state.
   */
  onError?: (error: SpeechineerError) => void;
  /**
   * Something did not go as asked, but the session carried on — a setting Speechineer could not
   * honour, a connection it refused, a component that had to retry. Worth surfacing or logging;
   * never fatal.
   */
  onWarning?: (notice: SessionNotice) => void;
  /** A step worth reporting — a phase of the work starting or finishing. */
  onInfo?: (notice: SessionNotice) => void;
  /**
   * Trace-level detail, for diagnosing an integration.
   *
   * Only arrives if the session is running at `debug`; otherwise Speechineer never sends it, so
   * this stays silent rather than being filtered here.
   */
  onDebug?: (notice: SessionNotice) => void;
}

/**
 * Field-value callbacks, added by every capability that fills a form. Optional —
 * the latest value of every field is always available as `values` in the
 * session state; use the callback to push values into a form library
 * imperatively.
 *
 * @group Callbacks
 */
export interface FormValueCallbacks {
  /**
   * One recognized field value. Called repeatedly while the user speaks, and
   * more than once for the same `fieldId` when a value is refined — always
   * apply the latest.
   *
   * `fieldId` is the id you gave the field; `value` is passed through as
   * received, so cast or validate it the way your form expects.
   */
  onFieldValue?: (fieldId: string, value: unknown) => void;
}

/**
 * Transcript callbacks, added by every capability that returns the spoken text.
 * Optional — the transcript so far is always available as `transcript` in the
 * session state.
 *
 * @group Callbacks
 */
export interface TranscriptCallbacks {
  /**
   * The transcript so far — the full accumulated text, not just the newest
   * words, so you can render it directly without stitching updates together.
   */
  onTranscript?: (text: string) => void;
}
