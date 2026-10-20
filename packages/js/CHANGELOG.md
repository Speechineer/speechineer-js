# @speechineer/js

## 0.9.0

### Minor Changes

- 69f2d42: Add four failure categories for the ways a request's _envelope_ can be wrong, each with a class of its own: `SpeechineerMethodError` (405), `SpeechineerNotAcceptableError` (406), `SpeechineerTooLargeError` (413) and `SpeechineerUnsupportedMediaError` (415).

  These were previously reported as `SpeechineerValidationError`, which said "your request is wrong" without saying that the body was too big, the content type unreadable, or the method simply not the one that endpoint takes — the four cases where nothing about the request's _content_ is at fault. `error.code` is unchanged for all of them, so a `catch` that already branches on the code keeps working; only the class and the HTTP status are more specific.

- 69f2d42: Speak the new wire protocol: typed failures with both messages, `state.errors` as a list, levelled event hooks, and a `uiLanguage` option.

  **This is a hard cut — the SDK and Speechineer now have to be on the same side of it.** Earlier versions read the previous shapes and silently discarded what they could not parse, so a failure arrived as a bare `REQUEST_FAILED` carrying the raw body, every warning and progress notice arrived empty, and a stop request was dropped without a word.

  What changes for you:

  - **Failures carry their own identity again.** Every one arrives with the `code` and category Speechineer named, and with **two messages**: `userMessage`, already translated into the session's language, for the person on screen; `devMessage` (and `message`) in English, for your logs. `field` and `details` are gone — a request that reports several problems now gives you one error per cause.
  - **`state.errors` is a list, and there is no `state.error`.** Read `errors[0]` for the cause to show; the rest is the context it arrived with. The id of the answer moves to `state.requestId` — quote that when reporting a problem. In React both arrive as spread fields (`errors`, `requestId`); in Angular as signals (`errors()`, `requestId()`), replacing `error()`.
  - **One shape for everything Speechineer reports.** `onEvent` receives failures and notices alike as a `SpeechineerEvent`, where `level` is the terminality: `'error'` means the session is over and nothing else does. Alongside it, `onWarning`, `onInfo` and `onDebug` each receive only their own level.
  - **`SpeechineerSessionEndedError` is gone.** A session that has ended now answers with the failure that actually ended it — a spent allowance is a `SpeechineerQuotaError` with its numbers, not a generic wrapper you had to unpack.
  - **`uiLanguage`**, on `createClient` or on a single session, sets the language people are shown messages in — **including when a call itself fails.** Starting a session, resuming one, ending one or running an action is an HTTP request, and the failure it answers with is now translated into the language you named, the same as the ones that arrive once the session is running. Leave it unset and Speechineer picks the one the browser asked for, as before. Its type is exported as `SdkLanguage`, with `SDK_LANGUAGES` and `DEFAULT_SDK_LANGUAGE` beside it, so narrowing a locale string you already hold does not mean restating the list.
  - **`SDK_ERROR_CODES`** lists the codes the SDK names itself, so you can tell "this request never left the browser" from "Speechineer refused it" — two failures that call for different handling.

  Resuming a session also works again: the SDK was waiting for a code the service had renamed, so a stopped session could not be restarted.

  **Three failures that used to be unnameable — or invisible — now have codes:**

  - A **token provider that throws** answers `NO_AUTH`, not `UNKNOWN`. Returning an empty token already did; throwing fell through to the catch-all, which is the common case, since a provider usually signals "not signed in" by throwing. What it threw stays on `error.cause`, so `cause instanceof YourError` keeps working.
  - A **connection the browser refuses to open** (a malformed URL, `ws://` from an `https://` page) answers `NETWORK`, matching what an unreachable service already answered over HTTP.
  - A **capture pipeline that cannot be built** answers `AUDIO_UNSUPPORTED` through `onError` and `state.errors`. It previously wrote to `console.error` and nowhere else, so a content-security policy that blocks `blob:` workers left the microphone granted, the connection open, and no error anywhere you could read.

  **Your callbacks can no longer break the session.** `onError`, `onFieldValue`, a `subscribe` listener — if one of yours throws, the session carries on and your error is re-thrown on a fresh task, so it still reaches `window.onerror` and your error reporting. Before, a throwing `subscribe` listener stopped every listener after it from being notified, and a throwing `onError` replaced the rejection from `start()` with your own bug. One consequence worth knowing: `try { await start() } catch` no longer catches a mistake inside your own `onError` — that now arrives separately as an uncaught error, and the rejection is always the session's real failure.

## 0.8.0

### Minor Changes

- d5c2305: Report every failure as a typed `SpeechineerError` carrying Speechineer's own code and category, with one class per category.

  `instanceof SpeechineerQuotaError` now handles every way an allowance can run out, and `error.code` is the stable identifier Speechineer sent rather than one the SDK derived. A rejected request, a session that stopped mid-run and a connection that closed all produce the same type, so one `catch` covers them.

  Breaking on the 0.x line:

  - `error.phase` and `error.recoverable` are gone. A failure now says what it is through its class and `code`; whether to retry follows from that, not from a flag the SDK guessed at. `SpeechineerSessionEndedError` means the session cannot be resumed; the SDK's own `client`-category failures (a denied microphone, missing credentials) are the retryable ones.
  - `error.detail` is gone; `error.meta` carries the data belonging to the failure (see `QuotaMeta`) and `error.details` breaks an aggregated failure into one atom per cause.
  - `SessionEvent.type` is now `event`, and `SessionEvent.payload` is now `data`. Events are progress only — anything that ends the session reaches `onError` and `state.error` instead.
  - `start()` and `end()` now reject when they fail, instead of resolving and reporting only through `onError`.
  - `ErrorPhase` is no longer exported.
  - `SERVICE_UNAVAILABLE` is an `unavailable` failure, not a `service` one, so it now arrives as `SpeechineerUnavailableError`. The code was declared in two categories at once; `unavailable` is the correct reading, and it is the retryable one.

## 0.7.2

### Patch Changes

- 1aa0afd: Re-seed the session when a stopped one is started again, so values collected while it was stopped are applied before the next extraction. Restarting previously re-attached without sending anything, which stranded edits made during the pause.
- e8dff7a: Allow a workspace form to supply configuration for the fields your workspace marks as set by code, through `fieldConfigs` and the new `FormFieldConfig` factory.

## 0.7.1

### Patch Changes

- 3152812: Reframe the documentation around building voice-based documentation into your product, with the forms you configure in Speechineer as the primary integration path.

## 0.7.0

### Minor Changes

- Initial public release of the Speechineer SDK.
