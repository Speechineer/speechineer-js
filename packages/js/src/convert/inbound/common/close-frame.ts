/**
 * Inbound close-frame conversion: a connection that closed carrying only identifiers → the
 * failure it reported.
 *
 * The fallback path, not the normal one. A session that ends while someone is listening reports
 * the failure as a message first, with its real code, category, translated sentences and typed
 * data; this is what is left when nobody was listening — a connection opened *after* the session
 * ended, or a data connection whose control-channel copy never arrived.
 *
 * Contributor notes (not rendered):
 * - **The reason carries `"<type>:<code>"`.** A close frame cannot carry an envelope (RFC 6455
 *   caps the whole payload at 125 bytes), so the service puts both machine-readable halves there
 *   instead of a truncated sentence. So this file neither invents `SESSION_ENDED` /
 *   `SESSION_NOT_FOUND` placeholders nor infers the category from the number: it reads what was
 *   sent. A caller branching on `code` — or catching a category class — gets the same answer
 *   however the failure arrived, which is also what lets the resume chain trigger off a close
 *   frame and not only off an HTTP answer.
 * - **Why the type had to be on the wire:** the close code is `4000 + status`, and three
 *   categories share `500`, so inverting the number can only guess. A guess that says `service`
 *   for a runtime failure is worse than silence, because `instanceof` then matches the wrong
 *   family.
 * - **The identifiers are the service's; both sentences are ours.** There is no room for a
 *   sentence in a close frame, so quoting one as the service's words would be a fabrication.
 *   They come from `UNKNOWN`, whose user sentence claims nothing about the session's fate —
 *   deliberately, because a close code does not establish that and this same converter answers
 *   for a connection that was merely refused. The close code and code ride `meta`, so the
 *   developer sentence still names both.
 * - **`meta` is the one field genuinely unavailable here** — a spent allowance's numbers never
 *   fit in 123 bytes. That is the strongest reason this must never displace a report that did
 *   arrive, which is what the caller's first-wins rule is for.
 * - Tolerant of a reason with no `:` — read as a bare code with the category left unknown, which
 *   is exactly the single-value form this replaced.
 */

import { renderTemplate, SDK_ERRORS, type SdkLanguage, sdkUserMessage } from '../../../errors/manifest.js';
import { type EventSdk, isTerminalCloseCode } from '../../../types/sdk/common/event.js';

/**
 * The failure a close code stands for, or `null` when the close was not a failure at all — a
 * clean `1000`, or the network dropping at `1006`.
 */
export function fromCloseFrame(closeCode: number, reason: string, language?: SdkLanguage): EventSdk | null {
  if (!isTerminalCloseCode(closeCode)) return null;
  const declared = reason.trim();
  // Split on the FIRST colon only: a type never contains one, so anything after it belongs to
  // the code. No colon at all means the whole reason is the code.
  const split = declared.indexOf(':');
  const type = declared && split !== -1 ? declared.slice(0, split) : null;
  const code = declared ? (split === -1 ? declared : declared.slice(split + 1)) : 'UNKNOWN';
  const meta = {
    close_code: closeCode,
    // A datum, not a sentence: the wording of the report lives on the `UNKNOWN` declaration and
    // interpolates this.
    detail: declared
      ? `The connection closed with ${closeCode} (${code}).`
      : `The connection closed with ${closeCode} and no reason.`,
  };
  return {
    code,
    type: type ?? (declared ? null : SDK_ERRORS.UNKNOWN.type),
    message: renderTemplate(SDK_ERRORS.UNKNOWN.message, meta),
    user_message: sdkUserMessage('UNKNOWN', language, meta),
    meta,
  };
}
