/**
 * Inbound close-frame conversion: a connection that closed carrying only a code → the failure
 * it stands for.
 *
 * The fallback path, not the normal one. A session that ends while someone is listening
 * reports the failure as a message first, with its real code, category and data; this is what
 * is left when nobody was listening — a connection opened *after* the session ended, or a
 * data connection whose control-channel copy never arrived.
 *
 * A close frame cannot carry an envelope (RFC 6455 caps its whole payload at 125 bytes), so
 * the service's own `code` is simply not on this path. Rather than mint a plausible-looking
 * one from the close code — a second vocabulary beside the manifest — this answers with the
 * two codes the manifest already declares for exactly these situations. The frame's `reason`
 * carries the failure's real text, truncated, so the specific information is not lost; and
 * because `state.error` keeps the FIRST error, a session that did report properly keeps that
 * report rather than this summary.
 */

import { SDK_ERRORS } from '../../../errors/manifest.js';
import { closeCodeFor, isTerminalCloseCode, type ProblemSdk } from '../../../types/sdk/common/problem.js';

/**
 * The failure a close code stands for, or `null` when the close was not a failure at all —
 * a clean `1000`, or the network dropping at `1006`.
 */
export function fromCloseFrame(code: number, reason: string): ProblemSdk | null {
  if (!isTerminalCloseCode(code)) return null;
  // The one distinction a close code alone supports: an id that names nothing (so the resume
  // chain should try a fresh create) versus a session that existed and is over.
  const declared = code === closeCodeFor('not_found') ? 'SESSION_NOT_FOUND' : 'SESSION_ENDED';
  const { type, message } = SDK_ERRORS[declared];
  return { code: declared, type, message: reason || message };
}
