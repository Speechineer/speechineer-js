# @speechineer/js

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
