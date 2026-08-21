# @speechineer/angular

Speechineer for Angular — fill forms by voice (or from text) with `provideSpeechineer()` and
one inject function per capability, state as signals. Builds on [`@speechineer/js`](../js).

```bash
npm install @speechineer/angular
```

```ts
// app.config.ts — once, with your workspace's API key (development) or a token your server signs (production)
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

Prefer the form you configured in Speechineer? Use `form: { source: "workspace", key, version, language }`
— no fields in code. Text instead of voice: `injectTextToForm({ form })` → `extract(text)`.

Full documentation: the Speechineer developer docs. License: Apache-2.0 © Aicendence GmbH.
