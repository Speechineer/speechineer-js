# @speechineer/angular

## 0.8.0

### Minor Changes

- 7980536: Surface every failure as the typed error classes from `@speechineer/js`, and let the session calls reject.

  `start()`, `end()` and `extract()` on `useSpeechToForm` / `useTextToForm` (React) and `injectSpeechToForm` / `injectTextToForm` (Angular) now reject when they fail, instead of resolving and reporting only through `onError`. The same error is still available as `error` (React) and `error()` (Angular), so a click handler or template that calls them bare only needs a `catch` to keep the rejection from going unhandled — see the updated examples in each package's README.

  Breaking on the 0.x line:

  - `error` is one of the `SpeechineerError` classes from `@speechineer/js`, with `code`, `type`, `meta` and `details`; `error.phase`, `error.recoverable` and `error.detail` are gone.
  - The missing-provider failure (no `SpeechineerProvider` / `provideSpeechineer(...)` and no `client` passed) keeps its `NO_CLIENT` code and is now a `client`-category error like every other failure the SDK raises on its own.

### Patch Changes

- Updated dependencies [d5c2305]
  - @speechineer/js@0.8.0

## 0.7.2

### Patch Changes

- 16583a1: Accept a function for Angular `injectSpeechToForm` / `injectTextToForm` options so they follow the component's signals. Passing a plain object is unchanged; passing a function re-reads the options whenever the signals it touches change, which keeps `initialValues` and callbacks current for the life of the session.
- Updated dependencies [1aa0afd]
- Updated dependencies [e8dff7a]
  - @speechineer/js@0.7.2

## 0.7.1

### Patch Changes

- Updated dependencies [3152812]
  - @speechineer/js@0.7.1

## 0.7.0

### Minor Changes

- Initial public release of the Speechineer SDK.
