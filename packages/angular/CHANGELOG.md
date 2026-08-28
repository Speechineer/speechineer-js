# @speechineer/angular

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
