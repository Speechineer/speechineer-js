/**
 * One class per category — identity only: no fields, no constructors, no methods.
 *
 * Contributor notes (not rendered): the class IS the category, so `instanceof` and `.type`
 * can never disagree. Adding a category means adding a class here and a row in
 * `convert/inbound/common/event.ts`; nothing else in the SDK branches on the list.
 *
 * `gone` has no class any more, and `SpeechineerSessionEndedError` went with it. It existed for
 * one service class — a wrapper that answered a late caller `410` and carried the real cause one
 * level down, where you had to know to look for it. A late caller is now answered with the
 * failure that actually ended the session, so a spent allowance arrives as
 * `SpeechineerQuotaError` and a broken extraction as `SpeechineerRuntimeError`, each with its own
 * code and numbers.
 */

import { SpeechineerError } from './base.js';

/**
 * Your app's own mistake, caught before anything was sent — missing credentials, an action
 * before `start()`, or a microphone the browser would not give up.
 *
 * @group Events and errors
 */
export class SpeechineerClientError extends SpeechineerError {
  static readonly type = 'client';
}

/**
 * The credentials were missing, malformed, expired, or rejected.
 *
 * @group Events and errors
 */
export class SpeechineerAuthError extends SpeechineerError {
  static readonly type = 'auth';
}

/**
 * A usage allowance is spent. `meta` carries the ceiling that bound and how much of it was
 * used — see {@link QuotaMeta}.
 *
 * @group Events and errors
 */
export class SpeechineerQuotaError extends SpeechineerError {
  static readonly type = 'quota';
}

/**
 * The credentials are valid but not allowed to do this.
 *
 * @group Events and errors
 */
export class SpeechineerAccessError extends SpeechineerError {
  static readonly type = 'access';
}

/**
 * Something named in the request does not exist — a form, a version, or a session whose id
 * answers to nothing because it was never created or has long since ended and been swept.
 *
 * @group Events and errors
 */
export class SpeechineerNotFoundError extends SpeechineerError {
  static readonly type = 'not_found';
}

/**
 * The request conflicts with the current state — for example an action whose prerequisite has
 * not happened yet.
 *
 * @group Events and errors
 */
export class SpeechineerConflictError extends SpeechineerError {
  static readonly type = 'conflict';
}

/**
 * The request was not acceptable. When several things are wrong at once you get one error per
 * cause in `state.errors`, so a rejected form tells you everything in one round trip.
 *
 * @group Events and errors
 */
export class SpeechineerValidationError extends SpeechineerError {
  static readonly type = 'validation';
}

/**
 * The path is right but the HTTP method is not one it accepts. A mistake in how the request
 * was built, not in what it asked for.
 *
 * @group Events and errors
 */
export class SpeechineerMethodError extends SpeechineerError {
  static readonly type = 'method';
}

/**
 * Nothing that can be returned matches the `Accept` header the request sent.
 *
 * @group Events and errors
 */
export class SpeechineerNotAcceptableError extends SpeechineerError {
  static readonly type = 'not_acceptable';
}

/**
 * The request body is larger than the endpoint will read. Send less, or send it in parts.
 *
 * @group Events and errors
 */
export class SpeechineerTooLargeError extends SpeechineerError {
  static readonly type = 'too_large';
}

/**
 * The body's content type is not one the endpoint reads. The body itself may be perfectly
 * well-formed — it is the type that is not supported.
 *
 * @group Events and errors
 */
export class SpeechineerUnsupportedMediaError extends SpeechineerError {
  static readonly type = 'unsupported_media';
}

/**
 * Too many requests. Slow down and retry.
 *
 * @group Events and errors
 */
export class SpeechineerRateLimitError extends SpeechineerError {
  static readonly type = 'rate_limit';
}

/**
 * A running session stopped because something failed — transcription or field extraction
 * could not be restarted. The session is over; offer the user a fresh start.
 *
 * @group Events and errors
 */
export class SpeechineerRuntimeError extends SpeechineerError {
  static readonly type = 'runtime';
}

/**
 * Speechineer could not handle the request, for a reason that is not your app's doing.
 * Retrying the same request may work.
 *
 * @group Events and errors
 */
export class SpeechineerServiceError extends SpeechineerError {
  static readonly type = 'service';
}

/**
 * A service Speechineer depends on answered with something unusable. Retrying the same
 * request the same way is unlikely to help.
 *
 * @group Events and errors
 */
export class SpeechineerUpstreamError extends SpeechineerError {
  static readonly type = 'upstream';
}

/**
 * Speechineer is temporarily unreachable. Nothing is wrong with your request — retry later.
 *
 * @group Events and errors
 */
export class SpeechineerUnavailableError extends SpeechineerError {
  static readonly type = 'unavailable';
}

/**
 * The request took too long to complete. Retrying is reasonable.
 *
 * @group Events and errors
 */
export class SpeechineerTimeoutError extends SpeechineerError {
  static readonly type = 'timeout';
}
