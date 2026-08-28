# @speechineer/js

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
