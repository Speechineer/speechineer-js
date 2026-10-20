/**
 * The event — the five wire fields every declaration serialises to, and the four type
 * vocabularies that categorise them. Mirrors `speechineer_protocol.transport.{event,types,level}`.
 *
 * Contributor notes (not rendered):
 * - **The declaring class IS the event** on the service side: `code`, `type`, both message
 *   templates and the nested `meta` are declared together, and one `as_wire()` serialises it.
 *   So there is no longer a separate "problem" shape for failures and "signal" shape for
 *   notices — an error, a warning, an info and a debug are the same five fields under different
 *   levels. This file replaces the old `problem.ts`.
 * - **Two sentences, not one.** `user_message` is for the person on the screen (translated by
 *   the service, per session language); `dev_message` is for the integrator (English, no
 *   architecture). The operator's log line never travels. A single `message` field is what this
 *   contract removed, so nothing here has one.
 * - **One vocabulary per level.** Only `ErrorType` carries a status, because only a failure can
 *   end a response or a connection. Giving a warning a status would mint values nothing can
 *   emit or check.
 * - Arrays with unions derived from them, rather than hand-written unions: the vocabularies then
 *   exist at runtime, so the conformance test can sweep them against `protocol/manifest.json`
 *   instead of trusting three hand-kept lists to agree.
 */

/** The four levels, coarsest last. `error` is terminal; that is the whole meaning of the level. */
export const EVENT_LEVELS = ['debug', 'info', 'warning', 'error'] as const;

/**
 * How severe an event is, and — for `error` — that the session is over.
 *
 * There is no `critical`: nothing ever emitted one, and a fifth level would have needed a fifth
 * frame field and a fifth notice bucket for a severity no handler distinguished from `error`.
 */
export type LevelSdk = (typeof EVENT_LEVELS)[number];

/** Rank, for "is this at least as severe as" comparisons. Mirrors the service's ordering. */
const LEVEL_RANK: Record<LevelSdk, number> = { debug: 0, info: 1, warning: 2, error: 3 };

/** Is `level` a level this build knows? Narrowing guard for a value straight off the wire. */
export function isLevel(value: unknown): value is LevelSdk {
  return typeof value === 'string' && value in LEVEL_RANK;
}

/**
 * The failure categories, in the service's own order, each with the status it answers with.
 *
 * `gone` is **not** here: it existed for exactly one class — a wrapper that answered a late
 * caller with `410` and carried the real cause one level down. A late caller is now answered
 * with the failure that actually ended the session, so nothing produces `gone` any more.
 *
 * `client` stays, and never travels: it marks a failure the caller's own SDK raised before
 * anything was sent (no microphone, no credentials, host unreachable).
 */
export const STATUS_BY_ERROR_TYPE = {
  client: 500,
  auth: 401,
  quota: 402,
  access: 403,
  not_found: 404,
  method: 405,
  not_acceptable: 406,
  conflict: 409,
  too_large: 413,
  unsupported_media: 415,
  validation: 422,
  rate_limit: 429,
  runtime: 500,
  service: 500,
  upstream: 502,
  unavailable: 503,
  timeout: 504,
} as const satisfies Record<string, number>;

/** One category of failure. */
export type ErrorTypeSdk = keyof typeof STATUS_BY_ERROR_TYPE;

/** The categories of something that went wrong **without** ending the session. */
export const WARNING_TYPES = ['recovery', 'precondition', 'unsupported', 'config', 'deprecation'] as const;

/** One category of warning. */
export type WarningTypeSdk = (typeof WARNING_TYPES)[number];

/** The categories of a progress report worth telling the caller about. */
export const INFO_TYPES = ['lifecycle'] as const;

/** One category of info. */
export type InfoTypeSdk = (typeof INFO_TYPES)[number];

/** The categories of a trace-level report — reaches only a caller who asked for `debug`. */
export const DEBUG_TYPES = ['progress', 'usage', 'internal'] as const;

/** One category of debug event. */
export type DebugTypeSdk = (typeof DEBUG_TYPES)[number];

/**
 * Which vocabulary a level's `type` must come from. The conformance test reads this, so a level
 * without a vocabulary fails the suite rather than shipping an event nothing can categorise.
 */
export const TYPES_FOR_LEVEL: Record<LevelSdk, readonly string[]> = {
  debug: DEBUG_TYPES,
  info: INFO_TYPES,
  warning: WARNING_TYPES,
  error: Object.keys(STATUS_BY_ERROR_TYPE),
};

/** The one range RFC 6455 leaves to applications, so no standard code can collide with it. */
const CLOSE_CODE_BASE = 4000;

/**
 * The close code a session ends with on this category — the same `4000 + status` projection the
 * service derives, so neither side keeps a table the other can drift from.
 */
export function closeCodeFor(type: ErrorTypeSdk): number {
  return CLOSE_CODE_BASE + STATUS_BY_ERROR_TYPE[type];
}

/**
 * Does this close code mean the session is over?
 *
 * **One rule, not a list**: every `4xxx` close is terminal. `1000` is a clean end and `1006` is
 * the network dropping — neither is the session ending.
 *
 * ⚠ Only the **main connection's** close code is a session verdict. A data connection closing
 * with a `4xxx` means that one connection was refused, not that the session is over; the
 * refusal travels as a `warning` on the main connection instead.
 */
export function isTerminalCloseCode(code: number): boolean {
  return code >= CLOSE_CODE_BASE && code <= 4999;
}

// There is deliberately no inverse of `closeCodeFor`. Recovering a category from a close code
// would let the SDK mint `code`/`type` pairs nothing declares — a second vocabulary beside the
// manifest. What a bare close frame can honestly say is in `convert/inbound/common/close-frame.ts`,
// and since the service now puts the **code** in the close reason, it rarely has to guess.

/**
 * One event, as it travels: the five fields `as_wire()` emits, at any level.
 *
 * `type` is typed `string` rather than the union on purpose — a newer service naming a category
 * this build has never heard of must arrive intact instead of failing to parse. Same for `code`.
 */
export interface EventSdk {
  /** Stable machine-readable identifier (UPPER_SNAKE). The thing a caller branches on. */
  code: string;
  /** The category — one of the vocabularies above, for the event's level. */
  type?: string | null;
  /** For the person on the screen, already translated into the session's language. */
  user_message?: string | null;
  /** For the integrator: English, says what to do about it, never describes the internals. */
  dev_message?: string | null;
  /** The event's own typed payload. Which keys appear is graded by the session's verbosity. */
  meta?: Record<string, unknown> | null;
}
