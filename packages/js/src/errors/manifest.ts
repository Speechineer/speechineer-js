/**
 * The SDK's error manifest: every code it can name itself, with the category it belongs to.
 *
 * Contributor notes (not rendered): the mirror of the service's `ErrorCode` enum — ONE place
 * where a code declares its type, so nothing downstream invents a pairing. Every consumer
 * reads it: `sdkError` raises from it, `fromCloseFrame` answers from it, and
 * `SpeechineerErrorCode` is derived from its keys.
 *
 * Mostly disjoint from the service's vocabulary — the `NO_*` codes never travel. The two
 * exceptions are deliberate: `NOT_FOUND` and `SESSION_ENDED` name what a connection said when
 * it closed carrying a code and no room for a message.
 */

import { fromProblem } from '../convert/inbound/common/problem.js';
import type { SpeechineerError } from './base.js';

/** @internal */
export const SDK_ERRORS = {
  NO_AUTH: { type: 'client', message: 'No credentials — pass `apiKey` or `token` to createClient().' },
  NO_ACCOUNT: { type: 'client', message: 'An `account` is required with `apiKey`.' },
  NO_CLIENT: { type: 'client', message: 'No Speechineer client is available.' },
  NO_SESSION: { type: 'client', message: 'No active session — call start() first.' },
  MICROPHONE_DENIED: { type: 'client', message: 'Microphone access was denied.' },
  MICROPHONE_UNAVAILABLE: { type: 'client', message: 'No usable microphone was found.' },
  AUDIO_UNSUPPORTED: { type: 'client', message: 'This browser cannot record audio in the required format.' },
  NETWORK: { type: 'client', message: 'Could not reach Speechineer.' },
  UNKNOWN: { type: 'client', message: 'Something went wrong.' },
  // Not 'client': these describe what Speechineer said, in the cases where it could not say it
  // in words — a connection closed carrying a code and no room for a message body.
  //
  // ⚠ These two keys are the SERVICE's codes, spelled exactly as it sends them over HTTP. That
  // is the point: the same situation must reach a caller under the same code however it
  // arrived, so a `switch (e.code)` never needs a second arm for the connection path.
  SESSION_NOT_FOUND: { type: 'not_found', message: 'The session no longer exists.' },
  SESSION_ENDED: { type: 'gone', message: 'This session has ended. Start a new one.' },
  REQUEST_FAILED: { type: 'service', message: 'The request was rejected.' },
} as const;

/**
 * A stable identifier for what went wrong.
 *
 * The union lists what this version knows about but stays open on purpose: Speechineer can
 * name a new failure without every app upgrading first, so the type must not claim the list
 * is closed.
 *
 * @group Events and errors
 */
export type SpeechineerErrorCode = keyof typeof SDK_ERRORS | (string & {});

/**
 * Build one of the SDK's own failures.
 *
 * @internal
 */
export function sdkError(
  code: keyof typeof SDK_ERRORS,
  options: { message?: string; cause?: unknown } = {},
): SpeechineerError {
  const declared = SDK_ERRORS[code];
  return fromProblem(
    { code, type: declared.type, message: options.message ?? declared.message },
    { cause: options.cause },
  );
}
