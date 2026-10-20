/**
 * Anything thrown on the SDK's paths → a `SpeechineerError`.
 *
 * Contributor notes (not rendered): the one funnel, so no call site has to know what shape a
 * browser rejection or a bare `throw` arrives in. The underlying text rides `meta.detail` rather
 * than replacing a sentence — the declarations in `manifest.ts` own their wording and
 * interpolate this.
 */

import type { SpeechineerError } from './base.js';
import { isSpeechineerError } from './guards.js';
import { type SdkLanguage, sdkError } from './manifest.js';

/** Browser `getUserMedia` rejection names that mean "no permission". */
const DENIED_NAMES = new Set(['NotAllowedError', 'SecurityError', 'PermissionDeniedError']);
/** Browser `getUserMedia` rejection names that mean "no usable device". */
const UNAVAILABLE_NAMES = new Set(['NotFoundError', 'NotReadableError', 'OverconstrainedError', 'AbortError']);

/**
 * Convert anything thrown on the SDK's paths into a `SpeechineerError`.
 *
 * Already-converted errors pass through untouched, so a failure keeps the category
 * Speechineer gave it however many frames it propagates through — the reason this no longer
 * takes a `phase` to stamp on the way past.
 *
 * @internal
 */
export function toSpeechineerError(e: unknown, language?: SdkLanguage): SpeechineerError {
  // Cross-bundle safe: `instanceof` on the base compares the brand, not the prototype chain.
  if (isSpeechineerError(e)) return e;
  if (e instanceof Error) {
    if (DENIED_NAMES.has(e.name)) return sdkError('MICROPHONE_DENIED', { language, cause: e });
    if (UNAVAILABLE_NAMES.has(e.name)) {
      return sdkError('MICROPHONE_UNAVAILABLE', { language, cause: e });
    }
    if (e.message.startsWith('Audio config required')) {
      return sdkError('AUDIO_UNSUPPORTED', { meta: { detail: e.message }, language, cause: e });
    }
    return sdkError('UNKNOWN', { meta: { detail: e.message }, language, cause: e });
  }
  return sdkError('UNKNOWN', { meta: { detail: String(e) }, language, cause: e });
}
