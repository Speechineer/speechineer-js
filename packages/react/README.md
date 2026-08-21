# @speechineer/react

Speechineer for React — fill forms by voice (or from text) with a provider and one hook per
capability. Builds on [`@speechineer/js`](../js).

```bash
npm install @speechineer/react
```

```tsx
// main.tsx — once, with your workspace's API key (development) or a token your server signs (production)
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
      <button type="button" onClick={isListening ? stop : () => void start()}>{isListening ? "Stop" : "Talk"}</button>
      <input value={String(values.patientName ?? "")} readOnly />
    </>
  );
}
```

Prefer the form you configured in Speechineer? Use `form: { source: "workspace", key, version, language }`
— no fields in code. Text instead of voice: `useTextToForm({ form })` → `extract(text)`.

Full documentation: the Speechineer developer docs. License: Apache-2.0 © Aicendence GmbH.
