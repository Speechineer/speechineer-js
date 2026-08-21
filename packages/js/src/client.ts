/**
 * The client — the one object that holds how the SDK reaches Speechineer (`baseUrl`) and on
 * whose behalf (`apiKey` + `account`, or a signed `token`). Sessions are created from it:
 * `client.speechToForm(options)`, `client.textToForm(options)`. The React provider and the
 * Angular `provideSpeechineer` hand the same client to their bindings.
 *
 * Contributor note: `resolveAuth` is called on EVERY create / resume, so a token provider
 * can return a fresh token each time; minted unsigned tokens carry a 300 s TTL.
 */

import { DEFAULT_BASE_URL } from './constants.js';
import { mintUnsignedToken } from './convert/outbound/common/auth.js';
import { SpeechineerError } from './errors.js';
import { createSpeechToFormSession } from './session/workflows/speech-to-form.js';
import { createTextToFormSession } from './session/workflows/text-to-form.js';
import type { Account, ClientOptions } from './types/public/common/auth.js';
import type { SpeechToFormOptions, SpeechToFormSession } from './types/public/workflows/speech-to-form.js';
import type { TextToFormOptions, TextToFormSession } from './types/public/workflows/text-to-form.js';

/**
 * Your connection to Speechineer. Create one with {@link createClient} and keep it for
 * the lifetime of your app; every session starts from it.
 *
 * @group Setup
 */
export interface SpeechineerClient {
  /** The API root this client talks to (no trailing slash). */
  readonly baseUrl: string;
  /**
   * Fill a form by voice. Returns the session; call `start()` on it when the user is
   * ready to speak. In React and Angular use `useSpeechToForm` / `injectSpeechToForm`
   * instead — they take the same options and manage the session for you.
   */
  speechToForm(options: SpeechToFormOptions): SpeechToFormSession;
  /**
   * Extract field values from text — no microphone involved. Returns the session;
   * call `extract(text)` as often as you like. In React and Angular use
   * `useTextToForm` / `injectTextToForm`.
   */
  textToForm(options: TextToFormOptions): TextToFormSession;
  /**
   * Produce the credential string a session sends when it is created or resumed.
   *
   * @internal
   */
  resolveAuth(account?: Account): Promise<string>;
}

function normalizeBaseUrl(baseUrl: string | undefined): string {
  return (baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
}

/**
 * Create the client once, at app startup, and create every session from it.
 *
 * @example
 * ```ts
 * import { createClient } from "@speechineer/js";
 *
 * // Development — an unsigned workspace key + who the end user is:
 * const speechineer = createClient({ apiKey: "spnr_live_…", account: { key: user.id } });
 *
 * // Production — your server signs a short-lived token per user:
 * const speechineer = createClient({ token: () => fetch("/api/speechineer-token").then((r) => r.text()) });
 * ```
 *
 * @group Setup
 */
export function createClient(options: ClientOptions = {}): SpeechineerClient {
  const baseUrl = normalizeBaseUrl(options.baseUrl);

  const resolveAuth = async (account?: Account): Promise<string> => {
    if (options.token !== undefined) {
      const token = typeof options.token === 'function' ? await options.token() : options.token;
      if (!token) {
        throw new SpeechineerError('The token provider returned no token.', {
          code: 'AUTH_REQUIRED',
          phase: 'start',
          recoverable: true,
        });
      }
      return token;
    }
    if (!options.apiKey) {
      throw new SpeechineerError('Pass `apiKey` (with `account`) or `token` to createClient().', {
        code: 'AUTH_REQUIRED',
        phase: 'start',
        recoverable: false,
      });
    }
    const resolvedAccount = account ?? options.account;
    if (!resolvedAccount?.key) {
      throw new SpeechineerError(
        'An `account` (the end user this session is for) is required with `apiKey` — on the client or on the session.',
        { code: 'ACCOUNT_REQUIRED', phase: 'start', recoverable: false },
      );
    }
    return mintUnsignedToken(options.apiKey, resolvedAccount);
  };

  const client: SpeechineerClient = {
    baseUrl,
    resolveAuth,
    speechToForm: (sessionOptions) => createSpeechToFormSession(client, sessionOptions),
    textToForm: (sessionOptions) => createTextToFormSession(client, sessionOptions),
  };
  return client;
}
