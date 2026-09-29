/**
 * The failure atom — mirrors the Speechineer API's `Problem` schema field for field.
 *
 * One shape on both paths: an HTTP failure envelope carries it as `error`, and so does a
 * terminal session signal. That is what lets the SDK parse one object however the failure
 * arrived, and project it into one error class (`convert/inbound/common/problem.ts`).
 *
 * Internal — the developer never sees this. They get a `SpeechineerError` built from it.
 */

/**
 * The category vocabulary, mirrored from the service, in the service's own order.
 *
 * An array with the union derived from it, rather than a hand-written union: the categories
 * then exist at runtime, so the tables keyed by them can be swept for completeness instead of
 * being three lists kept in step by hand — the union, the statuses below, and the classes in
 * `convert/inbound/common/problem.ts`. A category added to this array fails to compile until
 * the statuses cover it, and fails the suite until it has a class.
 *
 * @internal
 */
export const PROBLEM_TYPES = [
  'client',
  'auth',
  'quota',
  'access',
  'not_found',
  'gone',
  'conflict',
  'validation',
  'rate_limit',
  'runtime',
  'service',
  'upstream',
  'unavailable',
  'timeout',
] as const;

/**
 * One category of failure. Not an enum: `Problem.type` is typed `string` on the wire on
 * purpose, so a newer service naming a category this build has never heard of arrives intact
 * instead of failing to parse.
 */
export type ProblemType = (typeof PROBLEM_TYPES)[number];

/**
 * The HTTP status each category answers with — mirrored from the service, where the rule is
 * that a failure declares its `code` and its `type`, and the status *follows*.
 *
 * Kept here rather than as loose constants because the close codes below are derived from it:
 * hand-listing them is what let this SDK's old `4501`-`4505` table rot into dead code while
 * the one the service actually used (`4406`) was missing from it.
 */
export const STATUS_BY_TYPE: Record<ProblemType, number> = {
  client: 500,
  auth: 401,
  quota: 402,
  access: 403,
  not_found: 404,
  gone: 410,
  conflict: 409,
  validation: 422,
  rate_limit: 429,
  runtime: 500,
  service: 500,
  upstream: 502,
  unavailable: 503,
  timeout: 504,
};

/** The one range RFC 6455 leaves to applications, so no standard code can collide with it. */
const CLOSE_CODE_BASE = 4000;

/**
 * The close code a category ends a connection with — the same `4000 + status` projection the
 * service derives, so neither side keeps a table the other can drift from.
 */
export function closeCodeFor(type: ProblemType): number {
  return CLOSE_CODE_BASE + STATUS_BY_TYPE[type];
}

/**
 * Does this close code mean the session is over?
 *
 * **One rule, not a list**: every `4xxx` close is terminal. `1000` is a clean end and `1006`
 * is the network dropping — neither is the session ending.
 */
export function isTerminalCloseCode(code: number): boolean {
  return code >= CLOSE_CODE_BASE && code <= 4999;
}

// There is deliberately no inverse of `closeCodeFor`. Recovering a category from a close code
// would let the SDK mint `code`/`type` pairs nothing declares — a second vocabulary beside the
// manifest in `errors/local.ts`, which is the drift this contract exists to end. What a bare
// close frame can honestly say is in `convert/inbound/common/close-frame.ts`, and it says it
// with codes the manifest declares.

/** One atom of an aggregated breakdown — a per-field validation cause, or what ended a session. */
export interface ErrorDetailSdk {
  code: string;
  message: string;
  field?: string | null;
  meta?: Record<string, unknown> | null;
}

/** The failure object both paths carry. */
export interface ProblemSdk {
  code: string;
  message: string;
  type?: string | null;
  field?: string | null;
  meta?: Record<string, unknown> | null;
  details?: ErrorDetailSdk[];
}
