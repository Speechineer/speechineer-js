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
} from './categories.js';
export { isSessionNotFound, isSpeechineerError, RESUMABLE_CODE } from './guards.js';
export {
  DEFAULT_SDK_LANGUAGE,
  SDK_ERROR_CODES,
  SDK_ERRORS,
  SDK_LANGUAGES,
  type SdkLanguage,
  type SpeechineerErrorCode,
  sdkError,
} from './manifest.js';
export type { QuotaMeta } from './meta.js';
export { toSpeechineerError } from './normalize.js';
