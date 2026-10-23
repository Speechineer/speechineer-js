---
'@speechineer/js': minor
---

Speak the new wire protocol: typed failures with both messages, `state.errors` as a list, levelled event hooks, and a `uiLanguage` option.

**This is a hard cut — the SDK and Speechineer now have to be on the same side of it.** Earlier versions read the previous shapes and silently discarded what they could not parse, so a failure arrived as a bare `REQUEST_FAILED` carrying the raw body, every warning and progress notice arrived empty, and a stop request was dropped without a word.

What changes for you:

- **Failures carry their own identity again.** Every one arrives with the `code` and category Speechineer named, and with **two messages**: `userMessage`, already translated into the session's language, for the person on screen; `message` in English, for your logs. `field` and `details` are gone — a request that reports several problems now gives you one error per cause.
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
