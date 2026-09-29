/**
 * `SpeechineerError` — the one error type, holding everything the service sent and nothing
 * invented on top.
 *
 * Contributor notes (not rendered): `Symbol.hasInstance` compares a brand + the category
 * instead of walking the prototype chain, so `instanceof` keeps working when two copies of
 * this package end up in one bundle — a transitive dependency pinning a different version.
 * AWS's v3 SDK solves the same problem the same way.
 */

import type { ErrorDetailSdk } from '../types/sdk/common/problem.js';

/** @internal */
export interface SpeechineerErrorOptions {
  type: string;
  code: string;
  message: string;
  field?: string | null;
  meta?: Record<string, unknown> | null;
  details?: readonly ErrorDetailSdk[];
  requestId?: string | null;
  cause?: unknown;
}

/**
 * Something Speechineer could not do.
 *
 * Branch on `code` — it is stable — or catch a subclass to handle a whole category at once
 * (`SpeechineerQuotaError` covers every way an allowance can run out). `message` is written
 * for a developer, not an end user: show your own copy to the people using your app.
 *
 * `meta` carries the data belonging to this particular failure — the numbers behind a spent
 * allowance, for instance — and `details` breaks an aggregated failure into one atom per
 * cause, which is how a rejected form reports every offending field at once.
 *
 * @group Events and errors
 */
export class SpeechineerError extends Error {
  /**
   * The category this class matches. `undefined` on the base, which therefore matches any
   * Speechineer error.
   *
   * @internal
   */
  static readonly type?: string;

  /** The category. Prefer catching the matching subclass over comparing this yourself. */
  readonly type: string;
  /** A stable identifier for what went wrong. Branch on this, not on `message`. */
  readonly code: string;
  /** The field this failure is about, when it is about one. */
  readonly field: string | null;
  /** Data belonging to this failure — the shape depends on `code`. */
  readonly meta: Record<string, unknown> | null;
  /** One atom per cause, when a single failure has several. */
  readonly details: readonly ErrorDetailSdk[];
  /** Quote this when reporting a problem — it identifies the exact request. */
  readonly requestId: string | null;
  /** @internal brand for cross-bundle `instanceof` */
  readonly __speechineer = true as const;
  /** The underlying failure, when there was one. */
  readonly cause?: unknown;

  constructor(options: SpeechineerErrorOptions) {
    // Assigned rather than passed to `super`: the ES2022 `Error(message, { cause })` overload
    // is not in this package's lib target, and the property is what consumers read anyway.
    super(options.message);
    if (options.cause !== undefined) this.cause = options.cause;
    this.name = new.target.name;
    this.type = options.type;
    this.code = options.code;
    this.field = options.field ?? null;
    this.meta = options.meta ?? null;
    this.details = options.details ?? [];
    this.requestId = options.requestId ?? null;
  }

  /** @internal */
  static [Symbol.hasInstance](value: unknown): boolean {
    if (typeof value !== 'object' || value === null || !('__speechineer' in value)) return false;
    const want = (this as typeof SpeechineerError).type;
    return want === undefined || (value as SpeechineerError).type === want;
  }
}
