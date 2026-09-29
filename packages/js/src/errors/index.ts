/**
 * The error surface, in one import.
 *
 * Everything the SDK throws or reports — a rejected request, a microphone problem, a session
 * Speechineer stopped — is a `SpeechineerError` carrying the code, category and data the
 * service sent, with nothing invented on top.
 */

export { SpeechineerError, type SpeechineerErrorOptions } from './base.js';
export {
  SpeechineerAccessError,
  SpeechineerAuthError,
  SpeechineerClientError,
  SpeechineerConflictError,
  SpeechineerNotFoundError,
  SpeechineerQuotaError,
  SpeechineerRateLimitError,
  SpeechineerRuntimeError,
  SpeechineerServiceError,
  SpeechineerSessionEndedError,
  SpeechineerTimeoutError,
  SpeechineerUnavailableError,
  SpeechineerUpstreamError,
  SpeechineerValidationError,
} from './categories.js';
export { isSessionNotFound, isSpeechineerError } from './guards.js';
export { SDK_ERRORS, type SpeechineerErrorCode, sdkError } from './manifest.js';
export { toSpeechineerError } from './normalize.js';
export type { QuotaMeta } from './meta.js';
