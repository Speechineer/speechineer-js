/**
 * @speechineer/js — Speechineer for JavaScript, framework-free: the client, the two
 * capabilities it creates sessions for (speech-to-form, text-to-form), the form vocabulary
 * (`FormField`, `FieldSpec`, `FormDefinition`), and the state every session reports. The
 * React and Angular packages build on exactly this surface and re-export it.
 *
 * Internal layers (api/, convert/, tools/, the session core) are NOT re-exported.
 */

export type { SpeechineerClient } from './client.js';
export { createClient } from './client.js';
export { DEFAULT_BASE_URL } from './constants.js';
// @internal — the framework packages raise the SDK's own failures through the same manifest,
// so `NO_CLIENT` is declared in one place rather than re-typed in each binding.
export {
  DEFAULT_SDK_LANGUAGE,
  type QuotaMeta,
  SDK_ERROR_CODES,
  SDK_LANGUAGES,
  type SdkLanguage,
  SpeechineerAccessError,
  SpeechineerAuthError,
  SpeechineerClientError,
  SpeechineerConflictError,
  SpeechineerError,
  type SpeechineerErrorCode,
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
  sdkError,
} from './errors/index.js';
export * from './features/index.js';
export * from './session/index.js';
export * from './types/index.js';
