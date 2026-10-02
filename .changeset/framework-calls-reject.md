---
'@speechineer/react': minor
'@speechineer/angular': minor
---

Surface every failure as the typed error classes from `@speechineer/js`, and let the session calls reject.

`start()`, `end()` and `extract()` on `useSpeechToForm` / `useTextToForm` (React) and `injectSpeechToForm` / `injectTextToForm` (Angular) now reject when they fail, instead of resolving and reporting only through `onError`. The same error is still available as `error` (React) and `error()` (Angular), so a click handler or template that calls them bare only needs a `catch` to keep the rejection from going unhandled — see the updated examples in each package's README.

Breaking on the 0.x line:

- `error` is one of the `SpeechineerError` classes from `@speechineer/js`, with `code`, `type`, `meta` and `details`; `error.phase`, `error.recoverable` and `error.detail` are gone.
- The missing-provider failure (no `SpeechineerProvider` / `provideSpeechineer(...)` and no `client` passed) keeps its `NO_CLIENT` code and is now a `client`-category error like every other failure the SDK raises on its own.
