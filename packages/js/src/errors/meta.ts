/**
 * The shapes `SpeechineerError.meta` takes, per failure.
 *
 * Contributor notes (not rendered): `meta` is typed `Record<string, unknown>` on the error so
 * an unknown failure still arrives intact. These interfaces are the documented shapes a
 * caller may cast to once they have branched on `code` or on the class.
 */

/**
 * The `meta` a {@link SpeechineerQuotaError} carries: the allowance that bound, and how much
 * of it was used.
 *
 * The amounts are decimal **strings**, not numbers — usage is metered in fractional units and
 * a JSON number would round them.
 *
 * @group Events and errors
 */
export interface QuotaMeta {
  /** The ceiling that bound. */
  limit: string;
  /** How much of it had been used. */
  used: string;
  /** What was left. */
  remaining: string;
  /** Which allowance bound — for example an account's monthly budget. */
  layer: string;
}
