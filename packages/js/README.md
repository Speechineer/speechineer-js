# @speechineer/js

Speechineer for JavaScript — realtime speech-to-form sessions for any web app, framework-free.
`@speechineer/react` and `@speechineer/angular` build on this package; use it directly in plain
JavaScript or with any other framework.

```bash
npm install @speechineer/js
```

```ts
import { createClient, FormField } from "@speechineer/js";

// once, at app startup — your workspace's API key (development) or a token your server signs (production)
const speechineer = createClient({ apiKey: "spnr_live_…", account: { key: user.id } });

const session = speechineer.speechToForm({
  form: {
    source: "inline", key: "patient-intake", version: "1", language: "en",
    fields: [FormField.text("patientName", "Extract the patient full name")],
  },
  onFieldValue: (fieldId, value) => console.log(fieldId, value),
});

session.subscribe((state) => {
  button.textContent = state.isListening ? "Stop" : "Talk";
  output.textContent = String(state.values.patientName ?? "");
});
button.onclick = () => (session.getState().isListening ? session.stop() : session.start());
```

Prefer the form you configured in Speechineer? Use `form: { source: "workspace", key, version, language }`
— no fields in code. Text instead of voice: `speechineer.textToForm({ form })` → `extract(text)`.

Full documentation: the Speechineer developer docs. License: Apache-2.0 © Aicendence GmbH.
