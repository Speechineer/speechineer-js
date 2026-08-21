/**
 * Dev-facing callback fragments. `SessionCallbacks` are UNIVERSAL (every session has a
 * connection and a lifecycle). `FormValueCallbacks` / `TranscriptCallbacks` are added by the
 * capabilities that produce values / spoken text. Everything a callback reports is ALSO in
 * the session state (`values`, `transcript`, `error`, …) — callbacks exist for imperative
 * integrations (form libraries, logging), not as the only way to read results.
 */

import type { SpeechineerError } from '../../../errors.js';
import type { SessionState } from '../../../session/state.js';
import type { SessionEvent } from './event.js';

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
   * Every status event Speechineer emits for this session — progress, warnings,
   * and failures alike. Use it for logging or a live status display.
   */
  onEvent?: (event: SessionEvent) => void;
  /**
   * Something failed in a way you should handle: a rejected request, a denied
   * microphone permission, a lost connection, or a failure Speechineer reported
   * while the session ran. Read `error.code` to branch and `error.recoverable`
   * to decide whether to offer a retry.
   */
  onError?: (error: SpeechineerError) => void;
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
