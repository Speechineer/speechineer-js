/**
 * Anything thrown on the SDK's paths → a `SpeechineerError`.
 *
 * Contributor notes (not rendered): the one funnel, so no call site has to know what shape a
 * browser rejection or a bare `throw` arrives in.
 */

import type { SpeechineerError } from './base.js';
import { isSpeechineerError } from './guards.js';
import { sdkError } from './manifest.js';

/** Browser `getUserMedia` rejection names that mean "no permission". */
const DENIED_NAMES = new Set(['NotAllowedError', 'SecurityError', 'PermissionDeniedError']);
/** Browser `getUserMedia` rejection names that mean "no usable device". */
const UNAVAILABLE_NAMES = new Set([
  'NotFoundError',
  'NotReadableError',
  'OverconstrainedError',
  'AbortError',
]);

/**
 * Convert anything thrown on the SDK's paths into a `SpeechineerError`.
 *
 * Already-converted errors pass through untouched, so a failure keeps the category
 * Speechineer gave it however many frames it propagates through — the reason this no longer
 * takes a `phase` to stamp on the way past.
 *
 * @internal
 */
export function toSpeechineerError(e: unknown): SpeechineerError {
  // Cross-bundle safe: `instanceof` on the base compares the brand, not the prototype chain.
  if (isSpeechineerError(e)) return e;
  if (e instanceof Error) {
    if (DENIED_NAMES.has(e.name)) return sdkError('MICROPHONE_DENIED', { cause: e });
    if (UNAVAILABLE_NAMES.has(e.name)) return sdkError('MICROPHONE_UNAVAILABLE', { cause: e });
    if (e.message.startsWith('Audio config required')) {
      return sdkError('AUDIO_UNSUPPORTED', { message: e.message, cause: e });
    }
    return sdkError('UNKNOWN', { message: e.message, cause: e });
  }
  return sdkError('UNKNOWN', { message: String(e), cause: e });
}
