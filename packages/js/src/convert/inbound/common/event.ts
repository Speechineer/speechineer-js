/**
 * Inbound event conversion: one wire event (the five fields) → the error class a developer
 * catches, or the notice type a callback receives.
 *
 * Contributor notes (not rendered):
 * - This replaces the old `problem.ts` + `signal.ts` pair. They existed because a failure and a
 *   progress signal were genuinely different shapes on the wire (`{code, message, type, …}` vs
 *   `{event, verbosity, source, data, …}`). They are now the same five fields at different
 *   levels, so one file converts both and the **level decides which shape they become** — a
 *   class for `error` (it has to be throwable), a plain object otherwise (nothing to throw).
 * - `type` is what picks the constructor; the wire carries no classes. The same object arrives
 *   on both transports — an HTTP failure's `errors[]` element and a frame's `error` half — so
 *   both end up here and a caller handles one thing either way.
 * - **Neither sentence ever falls back to the other.** Falling back to the developer sentence is
 *   how developer prose reaches a UI; falling back the other way tells an integrator nothing.
 *   Both fall back to the `code`, which is honest and renders as something rather than `""`. A
 *   well-formed service event cannot hit either path: the protocol refuses at class creation to
 *   declare an event without a `dev_message` and a default-language `user_message`.
 */

import { SpeechineerError } from '../../../errors/base.js';
import {
  SpeechineerAccessError,
  SpeechineerAuthError,
  SpeechineerClientError,
  SpeechineerConflictError,
  SpeechineerMethodError,
  SpeechineerNotAcceptableError,
  SpeechineerNotFoundError,
  SpeechineerQuotaError,
  SpeechineerRateLimitError,
  SpeechineerRuntimeError,
  SpeechineerServiceError,
  SpeechineerTimeoutError,
  SpeechineerTooLargeError,
  SpeechineerUnavailableError,
  SpeechineerUnsupportedMediaError,
  SpeechineerUpstreamError,
  SpeechineerValidationError,
} from '../../../errors/categories.js';
import type { SessionNotice } from '../../../types/public/common/event.js';
import type { EventSdk, LevelSdk } from '../../../types/sdk/common/event.js';

/**
 * Every failure category, mapped to the class that represents it.
 *
 * No `gone` row: the category is gone from the contract, so a late caller now arrives carrying
 * the failure that actually ended the session and lands on that failure's own class.
 */
const BY_TYPE: Record<string, typeof SpeechineerError> = {
  client: SpeechineerClientError,
  auth: SpeechineerAuthError,
  quota: SpeechineerQuotaError,
  access: SpeechineerAccessError,
  not_found: SpeechineerNotFoundError,
  conflict: SpeechineerConflictError,
  validation: SpeechineerValidationError,
  method: SpeechineerMethodError,
  not_acceptable: SpeechineerNotAcceptableError,
  too_large: SpeechineerTooLargeError,
  unsupported_media: SpeechineerUnsupportedMediaError,
  rate_limit: SpeechineerRateLimitError,
  runtime: SpeechineerRuntimeError,
  service: SpeechineerServiceError,
  upstream: SpeechineerUpstreamError,
  unavailable: SpeechineerUnavailableError,
  timeout: SpeechineerTimeoutError,
};

/** The two sentences, each independent of the other. See the note at the top of the file. */
function sentences(event: EventSdk): { devMessage: string; userMessage: string } {
  return {
    devMessage: event.dev_message || event.code,
    userMessage: event.user_message || event.code,
  };
}

/**
 * Build the error a failure projects into, carrying everything across unchanged.
 *
 * A category this build has never heard of falls back to the base class rather than throwing: a
 * newer service must never be able to break an older app's error handling.
 */
export function fromEvent(event: EventSdk, options: { cause?: unknown } = {}): SpeechineerError {
  const Ctor = BY_TYPE[event.type ?? ''] ?? SpeechineerError;
  return new Ctor({
    // An absent category stays absent. Defaulting it to `service` would make
    // `instanceof SpeechineerServiceError` true for a failure nobody categorised — a wrong
    // positive, which is worse than no answer. `''` matches no category class, so only the base
    // one does, and the base is exactly the claim "something Speechineer could not do".
    type: event.type ?? '',
    code: event.code,
    ...sentences(event),
    meta: event.meta ?? null,
    cause: options.cause,
  });
}

/**
 * Build the notice a non-terminal event projects into.
 *
 * Takes the level separately because it is the frame's field, not the event's — the same reason
 * the level is not one of the five.
 */
export function toNotice(level: Exclude<LevelSdk, 'error'>, event: EventSdk): SessionNotice {
  return {
    level,
    type: event.type ?? '',
    code: event.code,
    ...sentences(event),
    meta: event.meta ?? null,
  };
}
