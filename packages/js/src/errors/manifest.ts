/**
 * The SDK's error manifest: every code it can name **itself**, with its category and both of its
 * sentences.
 *
 * Contributor notes (not rendered):
 * - **These never touch a backend.** Every entry is `client`-type — a failure raised inside this
 *   package before anything was sent, or an observation about a connection — plus
 *   `REQUEST_FAILED` for an answer that is not an envelope at all (a gateway replying on the
 *   service's behalf). The service's own ~167 codes are declared once, in the protocol package,
 *   and arrive on the wire; `conformance.test.ts` keeps this list from growing a second copy of
 *   any of them.
 * - **Same field pattern as a service declaration**: a fixed `devMessage` and a `userMessage` per
 *   language, mirroring the protocol's `dev_message` + `user_message: {en, de}`.
 * - **The sentences are TEMPLATES and are never overridden per instance.** That is the
 *   protocol's rule and it is worth keeping: there, both messages are `ClassVar`s and
 *   `dev_text()` is `dev_message.format(**meta)`, so the wording lives in exactly one place and
 *   the *variable* parts are data. A per-call `message` override — which this file used to
 *   accept — moves the wording to the call site, where two raise sites drift apart and nothing
 *   can review them together. Runtime detail goes in `meta` and is interpolated.
 * - The machinery around the pattern is deliberately NOT mirrored — no class per code, no typed
 *   `Meta` — because that exists to stop one code being declared twice across two services and
 *   four levels, and to feed a manifest export. Neither applies to a dozen local entries.
 * - **Why two sentences here too.** These are the failures a UI renders most often: a denied
 *   microphone, a missing credential. One string would have to be either developer prose shown
 *   to a user, or user prose that tells the integrator nothing. The old single `message` was the
 *   former.
 * - **Every code here is public contract** — it lands in `SpeechineerErrorCode` and integrators
 *   branch on it — so one is added only when something genuinely cannot be reported with an
 *   existing one. `UNKNOWN` is the catch-all and carries the specifics in `{detail}`.
 * - **The two placeholders are gone.** `SESSION_NOT_FOUND` and `SESSION_ENDED` used to be
 *   declared here so a bare close frame could be given *some* code. The service now puts its
 *   real `type:code` in the close reason, so inventing one is both unnecessary and the exact
 *   drift this contract removes — the SDK named `SESSION_NOT_FOUND` for releases after the
 *   service had renamed it, and the resume chain quietly stopped working.
 */

import { fromEvent } from '../convert/inbound/common/event.js';
import type { EventSdk } from '../types/sdk/common/event.js';
import type { SpeechineerError } from './base.js';

/** The languages the SDK can render its *own* sentences in. The service translates its own. */
export const SDK_LANGUAGES = ['en', 'de'] as const;

/** A language the SDK can speak. */
export type SdkLanguage = (typeof SDK_LANGUAGES)[number];

/** The language used when nothing else answers — the same fallback the service ends on. */
export const DEFAULT_SDK_LANGUAGE: SdkLanguage = 'en';

/**
 * The language to use when the app named none: the browser's, if we speak it.
 *
 * **This exists so the two halves of a session agree.** Speechineer negotiates its own
 * `user_message`s from `Accept-Language` when a session carries no `ui_language`, so a hard
 * `'en'` default here would put German service text and English SDK text in the same session —
 * for an app that simply never set the option.
 *
 * Mirrors the service's rule rather than inventing one: take the bare tag (`de-CH` → `de`), and
 * answer the default for anything we do not speak. Guarded for a non-browser host (SSR, tests),
 * where there is no navigator to ask.
 *
 * @internal
 */
export function negotiateSdkLanguage(): SdkLanguage {
  const tag = typeof navigator === 'undefined' ? '' : (navigator.language ?? '');
  const bare = tag.trim().toLowerCase().split('-')[0];
  return (SDK_LANGUAGES as readonly string[]).includes(bare) ? (bare as SdkLanguage) : DEFAULT_SDK_LANGUAGE;
}

/** @internal */
export const SDK_ERRORS = {
  NO_AUTH: {
    type: 'client',
    devMessage: 'No credentials — pass `apiKey` or `token` to createClient(). {detail}',
    userMessage: {
      en: 'This app is not set up correctly.',
      de: 'Diese Anwendung ist nicht korrekt eingerichtet.',
    },
  },
  NO_ACCOUNT: {
    type: 'client',
    devMessage:
      'An `account` (the end user this session is for) is required with `apiKey` — on the client or on the session. {detail}',
    userMessage: {
      en: 'This app is not set up correctly.',
      de: 'Diese Anwendung ist nicht korrekt eingerichtet.',
    },
  },
  NO_CLIENT: {
    type: 'client',
    // The `{detail}` tail is how each framework binding names its own remedy (a provider, a
    // provide call) without owning the sentence — the same split as `NO_AUTH` above.
    devMessage: 'No Speechineer client is available. {detail}',
    userMessage: {
      en: 'This app is not set up correctly.',
      de: 'Diese Anwendung ist nicht korrekt eingerichtet.',
    },
  },
  // The safety net behind `requireSessionId`, not a calling-order rule. "Call start() first"
  // was the old sentence and it asked for something unnecessary (FLY-503): `extract()` opens
  // the session itself, and `stop()` / `end()` before a start are quiet no-ops — so no public
  // path reaches this. It stays declared because the guard is real; the sentence now says what
  // seeing it would actually mean.
  NO_SESSION: {
    type: 'client',
    devMessage: 'An action needed a running session and the session reported none.',
    userMessage: {
      en: 'Nothing is being recorded right now.',
      de: 'Es wird gerade nichts aufgenommen.',
    },
  },
  MICROPHONE_DENIED: {
    type: 'client',
    devMessage:
      'Microphone access was denied. Call start() from a user gesture and check the browser’s permission prompt.',
    userMessage: {
      en: 'Microphone access was denied. Allow it in the browser to continue.',
      de: 'Der Zugriff auf das Mikrofon wurde verweigert. Er muss im Browser erlaubt werden.',
    },
  },
  MICROPHONE_UNAVAILABLE: {
    type: 'client',
    devMessage: 'No usable microphone was found.',
    userMessage: {
      en: 'No microphone was found.',
      de: 'Es wurde kein Mikrofon gefunden.',
    },
  },
  AUDIO_UNSUPPORTED: {
    type: 'client',
    devMessage: 'This browser cannot record audio in the required format. {detail}',
    userMessage: {
      en: 'This browser cannot record audio.',
      de: 'Dieser Browser kann kein Audio aufnehmen.',
    },
  },
  NETWORK: {
    type: 'client',
    devMessage: 'Could not reach Speechineer. {detail}',
    userMessage: {
      en: 'Speechineer could not be reached.',
      de: 'Speechineer konnte nicht erreicht werden.',
    },
  },
  /**
   * The catch-all: something this build cannot name. Used by `toSpeechineerError` for any
   * unrecognised throw, and by the close-frame converter when a connection closed carrying no
   * reason at all.
   *
   * Its user sentence says nothing about the session's fate on purpose — a close code alone does
   * not establish that, and the same converter answers for a connection that was merely refused.
   */
  UNKNOWN: {
    type: 'client',
    devMessage: 'Something went wrong. {detail}',
    userMessage: {
      en: 'Something went wrong.',
      de: 'Etwas ist schiefgelaufen.',
    },
  },
  // Not 'client': this one describes what Speechineer answered, in the case where it could not
  // say it in the contract's own shape — the body was not an envelope, so there is no code in it
  // to report. The raw body rides `meta` and is interpolated into the developer sentence, so the
  // cause stays diagnosable without the wording moving to the call site.
  REQUEST_FAILED: {
    type: 'service',
    devMessage: 'The request was rejected ({status}). {body}',
    userMessage: {
      en: 'Something went wrong.',
      de: 'Etwas ist schiefgelaufen.',
    },
  },
} as const;

/**
 * A stable identifier for what went wrong.
 *
 * The union lists what this version knows about but stays open on purpose: Speechineer can name
 * a new failure without every app upgrading first, so the type must not claim the list is closed.
 *
 * @group Events and errors
 */
export type SpeechineerErrorCode = keyof typeof SDK_ERRORS | (string & {});

/**
 * The codes the SDK names **itself**, as opposed to the ones Speechineer sends.
 *
 * Useful for telling the two apart — "did this request even leave the browser?" is a different
 * question from "what did Speechineer say?", and it changes what you do about it. A code in this
 * list means nothing was sent: a missing credential, a denied microphone, a browser that cannot
 * record. The one exception is `REQUEST_FAILED`, which means Speechineer *was* reached but
 * answered in a shape that carried no code of its own.
 *
 * @example
 * ```ts
 * import { SDK_ERROR_CODES } from "@speechineer/js";
 *
 * onError: (error) => {
 *   const isLocal = (SDK_ERROR_CODES as readonly string[]).includes(error.code);
 *   if (isLocal) showSetupHint(error);
 *   else reportToSupport(error.code, session.getState().requestId);
 * };
 * ```
 *
 * @group Events and errors
 */
export const SDK_ERROR_CODES = Object.keys(SDK_ERRORS) as readonly (keyof typeof SDK_ERRORS)[];

/**
 * Fill a `{key}` template from a meta map, mirroring the service's `message.format(**meta)`.
 *
 * A placeholder with no value is **dropped** and the result trimmed, so a template's optional
 * `{detail}` tail reads correctly either way. The service can afford to raise on a missing key —
 * it validates every template against its declaration's `Meta` at class creation — but the only
 * caller here is already building an error, and a throw inside that would replace a real failure
 * with an unrelated one.
 *
 * @internal
 */
export function renderTemplate(template: string, meta: Record<string, unknown> | null): string {
  return template.replace(/\{(\w+)\}/g, (_whole, key: string) => (meta && key in meta ? String(meta[key]) : '')).trim();
}

/**
 * One of the SDK's own user-facing sentences, in the language asked for.
 *
 * @internal
 */
export function sdkUserMessage(
  code: keyof typeof SDK_ERRORS,
  language: SdkLanguage = DEFAULT_SDK_LANGUAGE,
  meta: Record<string, unknown> | null = null,
): string {
  const declared = SDK_ERRORS[code].userMessage;
  return renderTemplate(declared[language] ?? declared[DEFAULT_SDK_LANGUAGE], meta);
}

/**
 * One of the SDK's own declarations, rendered into the same five fields a service event carries.
 *
 * The wire-shaped half, so the transport layer can put an SDK-minted failure into a
 * `FailureEnvelope` without reaching for an error class — `api/` speaks the wire, and converting
 * to classes is `convert/`'s job.
 *
 * @internal
 */
export function sdkEvent(
  code: keyof typeof SDK_ERRORS,
  options: { meta?: Record<string, unknown> | null; language?: SdkLanguage } = {},
): EventSdk {
  const declared = SDK_ERRORS[code];
  const meta = options.meta ?? null;
  return {
    code,
    type: declared.type,
    dev_message: renderTemplate(declared.devMessage, meta),
    user_message: sdkUserMessage(code, options.language, meta),
    meta,
  };
}

/**
 * Build one of the SDK's own failures.
 *
 * `meta` carries the runtime detail the sentences interpolate — there is no way to replace a
 * sentence from here, by design.
 *
 * @internal
 */
export function sdkError(
  code: keyof typeof SDK_ERRORS,
  options: {
    meta?: Record<string, unknown> | null;
    language?: SdkLanguage;
    cause?: unknown;
  } = {},
): SpeechineerError {
  return fromEvent(sdkEvent(code, options), { cause: options.cause });
}
