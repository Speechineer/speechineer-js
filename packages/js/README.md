# @speechineer/js

Build **voice-based documentation** into your product, framework-free. Someone speaks and
Speechineer turns what was said into structured, typed values your app receives while they are
still talking — plus the same extraction for text they typed, pasted or imported.

What gets captured is not hard-coded: you model each documentation step once in Speechineer —
its fields, the wording that guides them, its language — and your code names it. Change the
definition later and your integration follows, with no release on your side.

> **You need a Speechineer account** to model your documentation steps and to get the API key
> this package authenticates with. See **[speechineer.com](https://speechineer.com)**.

`@speechineer/react` and `@speechineer/angular` build on this package. Use it directly in plain
JavaScript, or with any framework that has no binding yet.

```bash
npm install @speechineer/js
```

```ts
import { createClient } from "@speechineer/js";

// Once, at app startup. Development: your workspace API key + who the end user is.
// Production: a short-lived token your server signs per user.
const speechineer = createClient({ apiKey: "spnr_live_…", account: { key: user.id } });

// The key, version and language of the step you modelled in Speechineer.
const session = speechineer.speechToForm({
  form: { source: "workspace", key: "visit-notes", version: "1", language: "en" },
  onFieldValue: (fieldId, value) => console.log(fieldId, value),
});

session.subscribe((state) => {
  button.textContent = state.isListening ? "Stop" : "Dictate";
  output.textContent = String(state.values.diagnosis ?? "");   // keyed by your field ids
});

button.onclick = () => (session.getState().isListening ? session.stop() : session.start());
```

**Text instead of speech:** `speechineer.textToForm({ form })` → `extract(text)` runs the same
documentation step over text the user typed, pasted or imported.

**Defining a step in code:** for prototypes, or a step that belongs in your codebase, use
`form: { source: "inline", key, version, language, fields }` and build the fields with
`FormField` (`text`, `textarea`, `integer`, `date`, `datetime`, `select`). The definition then
ships with your release, which is why naming a step you modelled in Speechineer is the usual
choice.

Full documentation lives in Speechineer — [speechineer.com](https://speechineer.com).
License: Apache-2.0 © Aicendence GmbH.
