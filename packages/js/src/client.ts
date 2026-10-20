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
import { isSpeechineerError, sdkError } from './errors/index.js';
import type { SdkLanguage } from './errors/manifest.js';
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
   * The language people are shown messages in, **as the app asked for it** — `undefined` when it
   * did not.
   *
   * Deliberately not defaulted here. It travels to Speechineer as the session's language, and
   * sending nothing is meaningful: Speechineer then negotiates from the browser's
   * `Accept-Language`, which is a better answer than any guess this SDK could make (the header
   * can say `de-CH,de;q=0.9` while `navigator.language` says `en-US`). A session overrides it
   * with its own `uiLanguage`.
   *
   * The SDK's own handful of messages still need a concrete language even when this is
   * `undefined` — see `negotiateSdkLanguage`, which is the fallback for *those only*.
   */
  readonly uiLanguage?: SdkLanguage;
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
   * `language` is the SESSION's, passed in because the failures raised here — `NO_AUTH`,
   * `NO_ACCOUNT` — are the SDK's own and nothing else will translate them. Without it they
   * rendered in the client's language and a per-session `uiLanguage` was ignored, which broke
   * exactly the case that option exists for: one client, many users, one of them German
   * (FLY-503). Falls back to the client's.
   *
   * @internal
   */
  resolveAuth(account?: Account, language?: SdkLanguage): Promise<string>;
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

  const resolveAuth = async (account?: Account, language?: SdkLanguage): Promise<string> => {
    // The session's language when it passed one, the client's otherwise (FLY-503).
    const uiLanguage = language ?? options.uiLanguage;
    if (options.token !== undefined) {
      let token: string;
      try {
        token = typeof options.token === 'function' ? await options.token() : options.token;
      } catch (e) {
        // A provider that THROWS is the same failure as one that returns nothing: no credential
        // was obtained, so nothing is sent. Until FLY-503 only the second was named — a throw
        // fell through to the generic funnel and arrived as `UNKNOWN`, the catch-all an
        // integrator cannot branch on, while the identical provider returning `''` answered
        // `NO_AUTH`. Every provider we ship throws (the sandbox when its tenant is logged out,
        // the portal's demo and Feedback dialog when theirs is paused), so this was the common
        // path, not the edge.
        //
        // NOT `safely`: a token provider is a dependency, not a notification. There is nothing
        // to carry on with — the session cannot start without a credential — so this has to
        // become a typed failure rather than be absorbed.
        //
        // `cause` carries the original, because a provider that throws its own class relies on
        // `error.cause instanceof MyError` to tell its state apart. One that raises a
        // `SpeechineerError` deliberately passes through untouched.
        if (isSpeechineerError(e)) throw e;
        throw sdkError('NO_AUTH', {
          meta: { detail: e instanceof Error ? e.message : String(e) },
          language: uiLanguage,
          cause: e,
        });
      }
      // NO_AUTH, not AUTH_REQUIRED (FLY-492 / D-41): the two are different failures that
      // used to share a code. This one is the app's own wiring, caught before anything is
      // sent; AUTH_REQUIRED is Speechineer's answer when a credential did travel and was
      // refused. Sharing a code meant a caller could not tell "I forgot to configure the
      // client" from "the key was revoked".
      //
      // **The type is checked, not just the truthiness** (FLY-503). `token: fetchToken()` — the
      // provider CALLED instead of passed — is a one-character mistake and about the most
      // plausible one on this surface. What arrives is a Promise: truthy, so a falsy check waves
      // it through, and it then JSON-serialises to `{}`, so Speechineer receives an empty
      // credential and refuses it. The developer goes debugging a 401 against their token
      // endpoint for a mistake that is in the line where they built the client. Caught here, it
      // is one sentence that names the fix.
      if (typeof token !== 'string' || !token) {
        throw sdkError('NO_AUTH', {
          meta: {
            detail:
              typeof token === 'string'
                ? 'The token provider returned no token.'
                : '`token` must be a token string, or a function returning one — it looks like the function was called instead of passed (`token: getToken()` rather than `token: getToken`).',
          },
          language: uiLanguage,
        });
      }
      return token;
    }
    if (!options.apiKey) {
      throw sdkError('NO_AUTH', { language: uiLanguage });
    }
    const resolvedAccount = account ?? options.account;
    if (!resolvedAccount?.key) {
      throw sdkError('NO_ACCOUNT', { language: uiLanguage });
    }
    return mintUnsignedToken(options.apiKey, resolvedAccount);
  };

  const client: SpeechineerClient = {
    baseUrl,
    // Passed through, NOT defaulted: absent means "Speechineer, negotiate it from the request".
    uiLanguage: options.uiLanguage,
    resolveAuth,
    speechToForm: (sessionOptions) => createSpeechToFormSession(client, sessionOptions),
    textToForm: (sessionOptions) => createTextToFormSession(client, sessionOptions),
  };
  return client;
}
