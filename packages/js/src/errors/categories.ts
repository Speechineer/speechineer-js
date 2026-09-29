/**
 * One class per category — identity only: no fields, no constructors, no methods.
 *
 * Contributor notes (not rendered): the class IS the category, so `instanceof` and `.type`
 * can never disagree. Adding a category means adding a class here and a row in
 * `convert/inbound/common/problem.ts`; nothing else in the SDK branches on the list.
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
 * Something named in the request does not exist — a form, a version, or a session that has
 * expired. Distinct from {@link SpeechineerSessionEndedError}, which means it *did* exist.
 *
 * @group Events and errors
 */
export class SpeechineerNotFoundError extends SpeechineerError {
  static readonly type = 'not_found';
}

/**
 * The session existed and is over. `details[0]` carries what ended it — a failure, or a spent
 * allowance. Start a new session; this one cannot be resumed.
 *
 * @group Events and errors
 */
export class SpeechineerSessionEndedError extends SpeechineerError {
  static readonly type = 'gone';
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
 * The request was not acceptable. `details` lists one atom per offending field, so a rejected
 * form tells you everything that is wrong in one round trip.
 *
 * @group Events and errors
 */
export class SpeechineerValidationError extends SpeechineerError {
  static readonly type = 'validation';
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
