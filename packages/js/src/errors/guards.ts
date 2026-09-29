/**
 * The questions the SDK asks about an error.
 *
 * Contributor notes (not rendered):
 * - `isSessionNotFound` names its code with `satisfies keyof typeof SDK_ERRORS`, so renaming a
 *   manifest key breaks the build here instead of silently turning the guard into something
 *   that is never true.
 * - `isTerminalSignal` and `isTerminalCloseCode` are deliberately NOT here. They narrow a wire
 *   envelope and a close code, not an error, and they live beside the types they narrow
 *   (`types/sdk/common/lifeline.ts`, `types/sdk/common/problem.ts`).
 */

import type { SpeechineerError } from './base.js';
import type { SDK_ERRORS } from './manifest.js';

/**
 * Has this already been converted?
 *
 * Checks the brand rather than the prototype chain, so it holds across two copies of this
 * package in one bundle — the same reason `SpeechineerError` overrides `Symbol.hasInstance`.
 *
 * @internal
 */
export function isSpeechineerError(e: unknown): e is SpeechineerError {
  return typeof e === 'object' && e !== null && '__speechineer' in e;
}

/**
 * Is this the one failure a resume can fix — an id that names no session?
 *
 * **The narrowing matters** (FLY-492 / D2): a 404 also answers a form that does not exist, a
 * version that was never published, and a workspace the credentials cannot see. Treating every
 * 404 as "the session expired" made the SDK retry a permanent misconfiguration three times and
 * then report it as `NOT_FOUND`, hiding the code that said what was actually wrong.
 *
 * @internal
 */
export function isSessionNotFound(e: unknown): boolean {
  return isSpeechineerError(e) && e.code === ('SESSION_NOT_FOUND' satisfies keyof typeof SDK_ERRORS);
}
