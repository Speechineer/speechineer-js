# @speechineer/react

Build **voice-based documentation** into your React app. Someone speaks and Speechineer turns
what was said into structured, typed values your components receive while they are still
talking — plus the same extraction for text they typed, pasted or imported.

What gets captured is not hard-coded: you model each documentation step once in Speechineer —
its fields, the wording that guides them, its language — and your component names it. Change
the definition later and your integration follows, with no release on your side.

> **You need a Speechineer account** to model your documentation steps and to get the API key
> this package authenticates with. See **[speechineer.com](https://speechineer.com)**.

Builds on [`@speechineer/js`](https://www.npmjs.com/package/@speechineer/js) and re-exports it,
so React apps install one package.

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

The hook result also carries `status`, `error`, `connections`, `transcript` and the
`isConnecting` / `isEnding` flags — the full session state as plain values.

**Text instead of speech:** `useTextToForm({ form })` → `extract(text)` runs the same
documentation step over text the user typed, pasted or imported.

**Defining a step in code:** for prototypes, or a step that belongs in your codebase, use
`form: { source: "inline", key, version, language, fields }` and build the fields with
`FormField` (`text`, `textarea`, `integer`, `date`, `datetime`, `select`). The definition then
ships with your release, which is why naming a step you modelled in Speechineer is the usual
choice.

Full documentation lives in Speechineer — [speechineer.com](https://speechineer.com).
License: Apache-2.0 © Aicendence GmbH.
