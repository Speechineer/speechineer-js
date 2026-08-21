# Speechineer SDK

Build **voice-based documentation** into your product. Someone speaks — a clinician after a
visit, a technician at a machine, an agent after a call — and Speechineer turns what was said
into structured, typed values your app receives while they are still talking.

What gets captured is not hard-coded. You model each documentation step once in Speechineer —
the fields it collects, the wording that guides each one, the language it is written in — and
your app simply names it. Change the definition later and every integration follows, with no
release on your side.

> **You need a Speechineer account** to model your documentation steps and to get the API key
> the SDK authenticates with. See **[speechineer.com](https://speechineer.com)**.

| Package | Install this when… |
|---|---|
| [`@speechineer/react`](packages/react/) | You are on **React** — `SpeechineerProvider` + `useSpeechToForm` / `useTextToForm`. |
| [`@speechineer/angular`](packages/angular/) | You are on **Angular** — `provideSpeechineer()` + `injectSpeechToForm` / `injectTextToForm`, state as signals. |
| [`@speechineer/js`](packages/js/) | You are on **plain JavaScript** or another framework — `createClient()` + `client.speechToForm()` / `client.textToForm()`. (The React and Angular packages build on it and re-export it.) |

## How an integration works

1. **Model the documentation step in Speechineer.** Which fields it captures, how to guide
   each one, which language the definition is written in. It gets a key and a version.
2. **Install the package for your framework** and create the client once, with your API key.
3. **Name that step in your code.** Values arrive per field as they are recognized; you render
   them into whatever UI you already have.

In the API a documentation step is called a **form** — the set of fields it captures. Naming
one you modelled in Speechineer is `form: { source: "workspace", … }`, and that is the path
most integrations take.

## Quick start

### React

```bash
npm install @speechineer/react
```

```tsx
// main.tsx — once, at app startup. Development: your workspace API key + who the end user is.
// Production: a short-lived token your server signs per user.
import { SpeechineerProvider } from "@speechineer/react";

<SpeechineerProvider apiKey={import.meta.env.VITE_SPEECHINEER_KEY} account={{ key: user.id }}>
  <App />
</SpeechineerProvider>
```

```tsx
import { useSpeechToForm } from "@speechineer/react";

function VisitNotes() {
  // The key, version and language of the step you modelled in Speechineer.
  const { start, stop, isListening, values } = useSpeechToForm({
    form: { source: "workspace", key: "visit-notes", version: "1", language: "en" },
  });

  return (
    <>
      <button type="button" onClick={isListening ? stop : () => void start()}>
        {isListening ? "Stop" : "Dictate"}
      </button>
      {/* values is keyed by the field ids you configured */}
      <input value={String(values.diagnosis ?? "")} readOnly />
    </>
  );
}
```

### Angular

```bash
npm install @speechineer/angular
```

```ts
// app.config.ts
import { provideSpeechineer } from "@speechineer/angular";

export const appConfig: ApplicationConfig = {
  providers: [provideSpeechineer({ apiKey: environment.speechineerKey, account: { key: userId } })],
};
```

```ts
import { Component } from "@angular/core";
import { injectSpeechToForm } from "@speechineer/angular";

@Component({
  selector: "visit-notes",
  template: `
    <button type="button" (click)="dictation.isListening() ? dictation.stop() : dictation.start()">
      {{ dictation.isListening() ? "Stop" : "Dictate" }}
    </button>
    <input [value]="dictation.values()['diagnosis'] ?? ''" readonly />
  `,
})
export class VisitNotes {
  readonly dictation = injectSpeechToForm({
    form: { source: "workspace", key: "visit-notes", version: "1", language: "en" },
  });
}
```

### JavaScript

```bash
npm install @speechineer/js
```

```ts
import { createClient } from "@speechineer/js";

const speechineer = createClient({ apiKey: "spnr_live_…", account: { key: user.id } });

const session = speechineer.speechToForm({
  form: { source: "workspace", key: "visit-notes", version: "1", language: "en" },
});

session.subscribe((state) => render(state));   // state.values, state.isListening, state.error, …
await session.start();                          // mic permission → connect → listening
session.stop();                                 // pause; late values still arrive
await session.end();                            // finish
```

## The concepts

- **Client** — created once with your credentials: a workspace `apiKey` plus an `account`
  identifying the end user (development), or a `token` your server signs per user, as a string
  or a function that fetches a fresh one (production). `baseUrl` defaults to Speechineer.
- **Form** — the documentation step. `form.source: "workspace"` names one you modelled in
  Speechineer, so its fields, guidance and models live there and can change without a release.
  Pin `version` so your integration keeps working while a new version is drafted.
- **Capabilities** — `speechToForm` for spoken input (add `transcript: true` to also receive
  the spoken text), and `textToForm` for text the user typed, pasted or imported
  (`extract(text)`) — the same documentation step, a different way in.
- **Session state** — one immutable `SessionState`: `status`, `sessionId`, `error`,
  `connections`, the latest `values`, the `transcript`, and the flags `isListening`,
  `isConnecting`, `isEnding`. React gives it as plain values, Angular as signals, JavaScript
  via `subscribe()` / `getState()`.
- **Callbacks** — optional: `onFieldValue`, `onTranscript`, `onSessionStart`, `onStateChange`,
  `onEvent`, `onError(SpeechineerError)` — everything they report is also in the state.
- **Errors** — one `SpeechineerError` with a stable `code` (`MICROPHONE_DENIED`, `NETWORK`,
  `NOT_FOUND`, …), the `phase` it happened in, and `recoverable`.

## Defining a step in code instead

For prototypes, or a step that genuinely belongs to your codebase, you can declare the fields
inline rather than modelling them in Speechineer:

```ts
import { FormField } from "@speechineer/js";

form: {
  source: "inline", key: "visit-notes", version: "1", language: "en",
  fields: [
    FormField.text("diagnosis", "Extract the diagnosis"),
    FormField.date("followUp", "Extract the follow-up date"),
  ],
}
```

`FormField` covers `text`, `textarea`, `integer`, `date`, `datetime` and `select`, and you can
add `prompts` and `models` to the form. Speechineer records the step under the same key and
version, so usage is attributed exactly as it is for a step you modelled there — but the
definition now ships with your release, which is why `source: "workspace"` is the default
recommendation.

## Data processing & legal

The SDK runs in the browser and sends the microphone audio (or the text you pass) to
Speechineer, where it is transcribed and turned into field values for your workspace; it
collects no telemetry of its own and stores nothing locally. Use of the Speechineer service is
governed by your agreement with Aicendence GmbH:

- [Privacy Policy](https://speechineer.com/datenschutz)
- [Imprint / Impressum](https://speechineer.com/impressum)
- Terms of Service and the Data Processing Agreement (DPA / AVV) are part of your service
  agreement — request a copy at support@speechineer.com.

Security issues: please report them privately — see [`SECURITY.md`](SECURITY.md).

## Contributing

Issues and feature requests are welcome; see [`CONTRIBUTING.md`](CONTRIBUTING.md) for the
workflow, [`CLAUDE.md`](CLAUDE.md) for the architecture, naming laws and recipes, and
[`VERSIONING.md`](VERSIONING.md) for how versions are cut. This project follows the
[Contributor Covenant](CODE_OF_CONDUCT.md).

## License

[Apache License 2.0](LICENSE) © 2026 Aicendence GmbH. "Speechineer" is a trademark of
Aicendence GmbH (see [`NOTICE`](NOTICE)).
