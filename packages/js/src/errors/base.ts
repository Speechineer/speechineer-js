/**
 * `SpeechineerError` — the one error type, holding everything the service sent and nothing
 * invented on top.
 *
 * Contributor notes (not rendered):
 * - **An error IS an event.** It satisfies `SpeechineerEvent` with `level: 'error'`, the same
 *   interface every warning / info / debug satisfies, mirroring the service where
 *   `SpeechineerError` derives from the `Event` root. It extends `Error` rather than a shared
 *   base only because it must carry a stack and TypeScript has single inheritance.
 * - `Symbol.hasInstance` compares a brand + the category instead of walking the prototype chain,
 *   so `instanceof` keeps working when two copies of this package end up in one bundle — a
 *   transitive dependency pinning a different version. AWS's v3 SDK solves this the same way.
 * - **Two sentences, two readers.** The service renders `user_message` into the session's
 *   language for the person on the screen, and `dev_message` in English for whoever is
 *   integrating. `Error.message` mirrors `dev_message`, because that is who reads a stack trace.
 *   The operator's log line — the text the service's own `raise` carried — never travels.
 * - **`field`, `details` and `requestId` are gone.** An aggregated failure is now the envelope's
 *   cause-ordered `errors[]`, so a per-error breakdown had two homes, and a top-level `field`
 *   could only ever describe one of them; what a failure is *about* rides its typed `meta`.
 *   `request_id` belongs to the envelope's `meta`, not to the declaration — it is delivery
 *   metadata, the same reason `session_id` is not an event field — and it reaches the caller as
 *   `state.requestId` instead of being strip-mined onto one error.
 */

import type { SpeechineerEvent } from '../types/public/common/event.js';

/** @internal */
export interface SpeechineerErrorOptions {
  type: string;
  code: string;
  /** For the integrator. Becomes `Error.message`. */
  devMessage: string;
  /** For the person on the screen. Falls back to `devMessage` when the service sent none. */
  userMessage?: string | null;
  meta?: Record<string, unknown> | null;
  cause?: unknown;
}

/**
 * Something Speechineer could not do. The session is over.
 *
 * Branch on `code` — it is stable — or catch a subclass to handle a whole category at once
 * (`SpeechineerQuotaError` covers every way an allowance can run out).
 *
 * **Two messages, for two readers.** `userMessage` is written for the person using your app and
 * arrives already translated into the session's language — show that one. `message` (and
 * `devMessage`, the same text) is written for you: it says what to do about the failure, and
 * belongs in your logs rather than on screen.
 *
 * It is also a {@link SpeechineerEvent} with `level: 'error'`, which is why `onEvent` can
 * receive failures and notices alike.
 *
 * @group Events and errors
 */
export class SpeechineerError extends Error implements SpeechineerEvent {
  /**
   * The category this class matches. `undefined` on the base, which therefore matches any
   * Speechineer error.
   *
   * @internal
   */
  static readonly type?: string;

  /** Always `'error'`: a failure is the terminal level, by definition. */
  readonly level = 'error' as const;
  /** The category. Prefer catching the matching subclass over comparing this yourself. */
  readonly type: string;
  /** A stable identifier for what went wrong. Branch on this, not on a message. */
  readonly code: string;
  /** For the person using your app, in the session's language. Show this one. */
  readonly userMessage: string;
  /** For you: what went wrong and what to do about it. Same text as `message`. */
  readonly devMessage: string;
  /** Data belonging to this failure — the shape depends on `code`. */
  readonly meta: Record<string, unknown> | null;
  /** @internal brand for cross-bundle `instanceof` */
  readonly __speechineer = true as const;
  /** The underlying failure, when there was one. */
  readonly cause?: unknown;

  // The three inherited `Error` members are redeclared for one reason: the generated API
  // reference lists a class's whole surface, so without a description here every one of the
  // 17 subclasses renders three blank cells — 51 of them, which the public-docs rule counts as
  // a documentation bug. Declaring them on the base documents them everywhere at once.

  /** The class name — `"SpeechineerQuotaError"` and so on. Prefer `code` or a `catch` by class. */
  declare readonly name: string;
  /** The developer sentence, in English — the same text as `devMessage`. */
  declare readonly message: string;
  /** Where the failure was raised, when the browser provides it. */
  declare readonly stack?: string;

  constructor(options: SpeechineerErrorOptions) {
    // Assigned rather than passed to `super`: the ES2022 `Error(message, { cause })` overload
    // is not in this package's lib target, and the property is what consumers read anyway.
    super(options.devMessage);
    if (options.cause !== undefined) this.cause = options.cause;
    this.name = new.target.name;
    this.type = options.type;
    this.code = options.code;
    this.devMessage = options.devMessage;
    // Never null: a caller showing `userMessage` in their UI should not have to branch on
    // whether the service had a translation for this particular code.
    this.userMessage = options.userMessage || options.devMessage;
    this.meta = options.meta ?? null;
  }

  /** @internal */
  static [Symbol.hasInstance](value: unknown): boolean {
    if (typeof value !== 'object' || value === null || !('__speechineer' in value)) return false;
    // `this` is the whole mechanism here: it is the constructor `instanceof` was called on, so
    // `want` is 'quota' for SpeechineerQuotaError and `undefined` for the base. Naming the base
    // class instead — which this rule's autofix does, and did once — makes `want` always
    // `undefined`, and then EVERY branded value matches EVERY subclass: `instanceof
    // SpeechineerAuthError` comes back true for a spent allowance. The two negative-instanceof
    // tests in `errors.test.ts` are what catch it.
    // biome-ignore lint/complexity/noThisInStatic: see above — the dynamic `this` is required.
    const want = (this as typeof SpeechineerError).type;
    return want === undefined || (value as SpeechineerError).type === want;
  }
}
