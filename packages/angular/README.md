# @speechineer/angular

Build **voice-based documentation** into your Angular app. Someone speaks and Speechineer turns
what was said into structured, typed values your components receive — as signals — while they
are still talking, plus the same extraction for text they typed, pasted or imported.

What gets captured is not hard-coded: you model each documentation step once in Speechineer —
its fields, the wording that guides them, its language — and your component names it. Change
the definition later and your integration follows, with no release on your side.

> **You need a Speechineer account** to model your documentation steps and to get the API key
> this package authenticates with. See **[speechineer.com](https://speechineer.com)**.

Builds on [`@speechineer/js`](https://www.npmjs.com/package/@speechineer/js) and re-exports it,
so Angular apps install one package.

```bash
npm install @speechineer/angular
```

```ts
// app.config.ts — once, at app startup. Development: your workspace API key + who the end user
// is. Production: a short-lived token your server signs per user.
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
    <!-- values() is keyed by the field ids you configured -->
    <input [value]="dictation.values()['diagnosis'] ?? ''" readonly />
  `,
})
export class VisitNotes {
  // The key, version and language of the step you modelled in Speechineer.
  readonly dictation = injectSpeechToForm({
    form: { source: "workspace", key: "visit-notes", version: "1", language: "en" },
  });
}
```

The session state is exposed as signals — `status`, `sessionId`, `error`, `values`,
`transcript`, `isListening`, `isConnecting`, `isEnding`, plus `state()` for the whole object —
and the session is cleaned up with the injection context.

**Text instead of speech:** `injectTextToForm({ form })` → `extract(text)` runs the same
documentation step over text the user typed, pasted or imported.

**Defining a step in code:** for prototypes, or a step that belongs in your codebase, use
`form: { source: "inline", key, version, language, fields }` and build the fields with
`FormField` (`text`, `textarea`, `integer`, `date`, `datetime`, `select`). The definition then
ships with your release, which is why naming a step you modelled in Speechineer is the usual
choice.

Full documentation lives in Speechineer — [speechineer.com](https://speechineer.com).
License: Apache-2.0 © Aicendence GmbH.
