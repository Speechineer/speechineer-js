/**
 * Dev-facing client configuration: how the SDK reaches Speechineer and how it identifies
 * the caller. `client.ts` resolves these into the single wire `auth` **JWT string** the
 * create request carries (minted for an unsigned API key, or taken from your token
 * provider for a signed one).
 */

/**
 * The end user a session is for. Usage and per-account limits are tracked against
 * it, so avoid one shared value for everybody.
 *
 * @group Authentication
 */
export interface Account {
  /** A stable id for the end user — your own user id works well. */
  key: string;
  /**
   * An optional readable label for that account, shown in your workspace instead of
   * the raw id (for example a team or desk name).
   */
  pseudonym?: string;
}

/**
 * Returns a token your server signed for the current user — called every time a
 * session is created or resumed, so a fresh, short-lived token is always used.
 *
 * @group Authentication
 */
export type TokenProvider = () => string | Promise<string>;

/**
 * How the SDK reaches Speechineer and on whose behalf. Pass it once to
 * `createClient` (or to the React provider / Angular `provideSpeechineer`).
 *
 * Fill in **one** of the two credential styles:
 *
 * - `apiKey` (+ `account`) — for an Unsigned API key. The SDK builds the token for
 *   you. Convenient for development, but the key is readable in your frontend.
 * - `token` — for a Signed API key. Your server signs a short-lived token per user
 *   and you hand it over (a string, or a function that fetches one); the SDK
 *   forwards it untouched, because signing requires a private key that must never
 *   reach the browser. Use this in production.
 *
 * @group Setup
 */
export interface ClientOptions {
  /**
   * The Speechineer API root, without a trailing slash. Defaults to the production
   * API — set it only to target another environment.
   */
  baseUrl?: string;
  /**
   * The API key of the workspace this app belongs to. Unsigned mode only — with a
   * signed token the key travels inside the token.
   */
  apiKey?: string;
  /**
   * A token your server signed, or a function that returns one. Takes precedence
   * over `apiKey`, and is the only option a Signed API key accepts. With a function
   * the SDK asks for a fresh token on every session start, so expiry is never your
   * problem.
   */
  token?: string | TokenProvider;
  /**
   * The end user sessions are for, unless a session says otherwise. Required with
   * `apiKey`; ignored with `token` (the token carries the account).
   */
  account?: Account;
}
