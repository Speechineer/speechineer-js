# Speechineer SDK

Add **realtime speech-to-form** to any web app: the user speaks, and structured field values
stream into your form as they are recognized — plus text-to-form for text the user typed or
pasted. One client, one session per capability, the same options and state in every framework.

| Package | Install this when… |
|---|---|
| [`@speechineer/react`](packages/react/) | You are on **React** — `SpeechineerProvider` + `useSpeechToForm` / `useTextToForm`. |
| [`@speechineer/angular`](packages/angular/) | You are on **Angular** — `provideSpeechineer()` + `injectSpeechToForm` / `injectTextToForm`, state as signals. |
| [`@speechineer/js`](packages/js/) | You are on **plain JavaScript** or another framework — `createClient()` + `client.speechToForm()` / `client.textToForm()`. (The React and Angular packages build on it and re-export it.) |

## Quick start

### React

```bash
npm install @speechineer/react
```

```tsx
// main.tsx — once: your workspace's API key (development) or a token your server signs (production)
import { SpeechineerProvider } from "@speechineer/react";

<SpeechineerProvider apiKey={import.meta.env.VITE_SPEECHINEER_KEY} account={{ key: user.id }}>
  <App />
</SpeechineerProvider>
```

```tsx
import { useSpeechToForm, FormField } from "@speechineer/react";

const fields = [
  FormField.text("patientName", "Extract the patient full name"),
  FormField.integer("age", "Extract the age in years"),
];

function TalkToForm() {
  const { start, stop, isListening, values } = useSpeechToForm({
    form: { source: "inline", key: "patient-intake", version: "1", language: "en", fields },
  });
  return (
    <>
      <button type="button" onClick={isListening ? stop : () => void start()}>
        {isListening ? "Stop" : "Talk"}
      </button>
      <input value={String(values.patientName ?? "")} readOnly />
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
import { injectSpeechToForm, FormField } from "@speechineer/angular";

@Component({
  selector: "talk-to-form",
  template: `
    <button type="button" (click)="voice.isListening() ? voice.stop() : voice.start()">
      {{ voice.isListening() ? "Stop" : "Talk" }}
    </button>
    <input [value]="voice.values()['patientName'] ?? ''" readonly />
  `,
})
export class TalkToForm {
  readonly voice = injectSpeechToForm({
    form: {
      source: "inline", key: "patient-intake", version: "1", language: "en",
      fields: [FormField.text("patientName", "Extract the patient full name")],
    },
  });
}
```

### JavaScript

```bash
npm install @speechineer/js
```

```ts
import { createClient, FormField } from "@speechineer/js";

const speechineer = createClient({ apiKey: "spnr_live_…", account: { key: user.id } });
const session = speechineer.speechToForm({
  form: {
    source: "inline", key: "patient-intake", version: "1", language: "en",
    fields: [FormField.text("patientName", "Extract the patient full name")],
  },
});
session.subscribe((state) => render(state));   // state.values, state.isListening, state.error, …
await session.start();                          // mic permission → connect → listening
session.stop();                                 // pause; late values still arrive
await session.end();                            // finish the session
```

## The concepts

- **Client** — created once with your credentials: an unsigned workspace `apiKey` + `account`
  (development) or a `token` your server signs per user, as a string or a function that fetches a
  fresh one (production). `baseUrl` defaults to the production Speechineer API.
- **Form definition** — `form.source: "workspace"` names a form you configured in Speechineer
  (fields, prompts and models come from your workspace); `form.source: "inline"` ships the fields
  from your code (built with `FormField`), optionally with `prompts` and `models`.
- **Capabilities** — `speechToForm` (add `transcript: true` to also receive the spoken text) and
  `textToForm` (`extract(text)`).
- **Session state** — every session reports one immutable `SessionState`: `status`, `sessionId`,
  `error`, `connections`, the latest `values`, the `transcript`, and the flags `isListening`,
  `isConnecting`, `isEnding`. React gives it to you as plain values, Angular as signals,
  JavaScript via `subscribe()` / `getState()`.
- **Callbacks** — optional: `onFieldValue`, `onTranscript`, `onSessionStart`, `onStateChange`,
  `onEvent`, `onError(SpeechineerError)` — everything they report is also in the state.
- **Errors** — one `SpeechineerError` with a stable `code` (`MICROPHONE_DENIED`, `NETWORK`,
  `NOT_FOUND`, a service error code, …), the `phase` it happened in, and `recoverable`.

Full documentation — guides and the per-framework API reference — lives in the Speechineer
developer docs.

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
