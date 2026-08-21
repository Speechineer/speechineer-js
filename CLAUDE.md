# CLAUDE.md — Speechineer SDK workspace: contributor & agent guide

This file tells an engineer (or an AI agent) how to work inside the SDK workspace: the
architecture, the **exact naming and placement of every symbol**, and the recipes — **add a
capability** and **mirror a new API field**. Read it top to bottom once; then use the placement
tables as a lookup.

> Sibling docs: [`README.md`](README.md) is the human-facing product intro (install + quick
> starts). [`CONTRIBUTING.md`](CONTRIBUTING.md) is the day-to-day contributor workflow.
> [`VERSIONING.md`](VERSIONING.md) is the version/changeset law — every behavior-touching
> commit carries a changeset (fixed group, one shared version).

---

## 1. What this is

An npm workspace ([`package.json`](package.json)) of **three packages**:

| Package | Dir | npm name | Role |
|---|---|---|---|
| JavaScript | [`packages/js/`](packages/js/) | `@speechineer/js` | **All the logic lives here.** The client, the wire types, the converters, the transport, the session core, the capability sessions, the forms vocabulary. Framework-free. |
| React | [`packages/react/`](packages/react/) | `@speechineer/react` | `SpeechineerProvider` + one hook per capability (`useSpeechToForm`, `useTextToForm`). Depends on `@speechineer/js`; re-exports it. |
| Angular | [`packages/angular/`](packages/angular/) | `@speechineer/angular` | `provideSpeechineer()` + one inject function per capability (`injectSpeechToForm`, `injectTextToForm`), state as signals. Depends on `@speechineer/js`; re-exports it. |

The framework packages contain **no logic** — each is a thin binding of the sessions
`@speechineer/js` creates. **You almost always edit `packages/js/src/`.** You touch a framework
package only to expose a new capability (a hook / an inject function, ~30 lines each).

The product: add **realtime speech-to-form** to any web form, in any framework. The browser
captures the mic, streams audio to Speechineer, and structured field values stream back as the
user speaks — while one observable `SessionState` tells the app what the session is doing.

---

## 2. The ideas you must hold

Everything in `packages/js/src/` follows from these decisions.

### Idea 1 — One client, sessions from it

The **client** (`createClient({ apiKey | token, account, baseUrl })`, `client.ts`) holds the
app-level configuration: where Speechineer is and on whose behalf the app calls. Sessions are
created from it (`client.speechToForm(options)`, `client.textToForm(options)`); the client
resolves the credential string for every create / resume (`resolveAuth`) — a token provider is
asked each time, an API key + account is minted into an unsigned token. The React provider and
the Angular `provideSpeechineer` hand the same client to their bindings. **Configuration
lives on the client instance only** — there is no global or module-level settings state.

### Idea 2 — Same noun, framework verb

A capability has **one** options type and **one** session type, shared by every framework;
only the binding function differs: `client.speechToForm()` (JS) · `useSpeechToForm()` (React —
`use` is mandatory by the Rules of Hooks) · `injectSpeechToForm()` (Angular — the `inject`
convention). React returns the state as plain values, Angular as signals, JS via
`subscribe()` / `getState()`.

### Idea 3 — Flat requests, a response-only envelope (the wire contract)

The lifecycle is **flat on the way in, enveloped on the way back**, snake_case keys. The
response envelope lives in [`types/sdk/common/envelope.ts`](packages/js/src/types/sdk/common/envelope.ts);
the flat request scopes in `types/sdk/workflows/`.

```
create (sdk → service):  { auth, session_id?, workflow, feature, state }         ← flat, NO envelope
get    (sdk → service):  { session_id, state? }                                 ← auth-less, live-only
delete (sdk → service):  { session_id }                                         ← auth-less
answer (service → sdk):  { ok, data: { session_id, connection, quota }, meta }  ← envelope; the SDK unwraps `data`
```

- `auth` — a single compact **JWT string** (minted for an API key, or the developer's signed token forwarded verbatim).
- `session_id` (create) — an optional **resume target** (create owns resume); the answer's `session_id` (possibly new) is adopted.
- `workflow` — `workflow_key` + the inline form's model pins (`adapter_config_keys`).
- `feature` — the form identity (`form_key`, `form_version_key`, `form_config_language`) + per-capability extras (`spoken_language`, `fields`, `system_prompts`).
- `state` — restorable `field_values` + the `transcription_language` the service reads at runtime.
- The answer's `connection` carries where to connect (`lifeline_ws_url` + `audio_ws_url` / `form_data_ws_url` / `transcription_ws_url` + audio format); `quota` is the pass-through budget.

### Idea 4 — camelCase for the developer, snake_case on the wire, `convert/` is the ONE boundary

**The app developer only ever sees camelCase** (`form.key`, `fieldId`, `onFieldValue`, `prompts.extraction`).
**The wire is always snake_case** and that will never change. The translation happens in
exactly one place: **`convert/`**.

```
dev options ──▶ convert/outbound ──▶ flat snake_case request ──▶ POST
dev events  ◀── convert/inbound  ◀── snake_case signal/result ◀── WS / HTTP response
```

Two type worlds, kept physically separate under `types/`:

- **`types/sdk/`** — snake_case **wire** types. Internal. Mirror the Speechineer API's schemas. Never exported to the developer.
- **`types/public/`** — camelCase **dev-facing** types. This is the API surface.

**Rule you must never break:** no snake_case key appears outside `types/sdk/`, `convert/`, and
`api/`. The prompt and model slots a customer names are camelCase too — `prompts.transcription` /
`prompts.extraction`, `models.transcription` / `models.extraction` — and `convert/outbound/common/field.ts`
maps them onto the wire slot names.

### Idea 5 — The form's origin is an option

`form.source: 'workspace' | 'inline'` (`features/forms/identity.ts`) decides the create route
(`create-portal` vs `create-standalone`) and what the `feature` / `workflow` scopes carry. An
inline form ships its `fields`, `prompts`, `models`; a workspace form ships identity only.
The words *portal* / *standalone* belong to the wire: they appear in those route segments and
in the internal `inline` boolean, never in a public name.

### Idea 6 — Results and flags live in the state

Every session reports one immutable `SessionState` (`session/state.ts`): lifecycle `status`,
`sessionId`, `error` (a `SpeechineerError`), `connections`, the latest `values`, the
`transcript`, and the derived flags `isListening` / `isConnecting` / `isEnding` recomputed by
`finalize()` on every update. Callbacks (`onFieldValue`, `onTranscript`, `onError`, `onEvent`,
`onStateChange`, `onSessionStart`) are optional conveniences — the state is the truth.

---

## 3. Repository tour — `packages/js/src/`

```
packages/js/src/
  index.ts                 The public barrel: createClient, DEFAULT_BASE_URL, SpeechineerError, FormField,
                           FIELD_TYPES, the public types. NOT api/, convert/, tools/, session/base (internal).
  client.ts                createClient / SpeechineerClient: baseUrl, resolveAuth, speechToForm(), textToForm().
  constants.ts             DEFAULT_BASE_URL, ROUTES (every endpoint segment), WS close codes (4404, 4501-4505).
  errors.ts                SpeechineerError (code / phase / recoverable), toSpeechineerError, fromCrashSignal.
  core.ts, docs-entry.ts   TypeDoc entries (the shared Core reference, the JavaScript reference). Not built.

  types/
    sdk/                   snake_case WIRE types. common/ (envelope, field, form-data-extraction, lifeline,
                           transcription-snapshot) + workflows/ (base + one file per wire workflow).
    public/                camelCase DEV-FACING types. common/ (auth = ClientOptions/Account/TokenProvider,
                           callbacks, event) + workflows/ (one file per capability: options + session types).

  features/forms/          The forms vocabulary: identity (FormDefinition = WorkspaceForm | InlineForm, Prompts,
                           Models), fields (FieldSpec, FieldConfig), form-field (FormField factory, FIELD_TYPES).

  session/                 The FRAMEWORK-AGNOSTIC session.
    state.ts               SessionState + the immutable updaters + finalize() (derived flags).
    store.ts               createStore: immutable value, getState/setState/subscribe.
    base.ts                createWorkflowSession: create → main connection → connections → recover → end/dispose;
                           error mapping; values/transcript recording.
    channels.ts            attach{Results,Transcript,Audio}Channel — transport client + connection status + recording.
    workflows/             per capability: create<Capability>WorkflowSession (internal orchestration) +
                           create<Capability>Session(client, options) (the factory the client methods call).
                           _shared.ts: options holder, callback forwarding, requireSessionId.

  convert/                 THE camel⇄snake boundary.
    outbound/common/       auth (mintUnsignedToken), field (toSdkFieldSpec, toSdkFieldValues, toSdkPrompts, toSdkModels)
    outbound/workflows/    _form.ts (the three scopes, switching on form.source) + one builder file per wire workflow
    inbound/common/        signal (fromSignal → SessionEvent)
    inbound/workflows/     text-to-form (fromFormDataResult → values record)

  api/                     Transport. No camelCase here — speaks the wire.
    workflows/             REST lifecycle: _post.ts (postForData/Delete/Result, RequestError, WorkflowNotFoundError)
                           + one file per wire workflow; every function takes `baseUrl` first.
    ws/                    WebSocket clients: audio, form-data, transcription, lifeline.

  tools/audio/             The mic capability: recorder (getUserMedia + AudioWorklet → audio socket) + worklet.
```

**Public vocabulary:** *client*, *capability* (speech-to-form, text-to-form), *session* (one run
of a capability, with a lifecycle and connections), *connection* (`session` = the main connection
— the wire "lifeline" is an internal name and never appears in public docs —, `audio`, `results`,
`transcript`), *workspace form* / *inline form*.

---

## 4. NAMING LAWS (memorize — reviews enforce these)

> Non-negotiable. **No abbreviations** (`SpeechToForm`, never `Stf`). **No "Wire"** (the
> internal world is `sdk`). Public names carry no mode marker.

### 4a. Files & folders

- Wire workflow files are `kebab-case` of the `snake_case` workflow key: `speech_to_form` →
  `speech-to-form.ts`; the **same base filename** is reused in every folder of the vertical slice
  (`types/sdk/workflows`, `convert/outbound/workflows`, `api/workflows`). Capability files
  (`types/public/workflows`, `session/workflows`, the framework bindings) are named after the
  capability (`speech-to-form.ts`, `text-to-form.ts`).
- `common/` holds cross-workflow code; `workflows/` holds per-workflow code.
- Shared helpers that aren't a public module are prefixed `_`: `api/workflows/_post.ts`,
  `convert/outbound/workflows/_form.ts`, `session/workflows/_shared.ts`.

### 4b. Types

| Kind | Pattern | Lives in | Example |
|---|---|---|---|
| Wire create request | `<Workflow>ResolveRequestSdk` | `types/sdk/workflows/<wf>.ts` | `SpeechToFormResolveRequestSdk` |
| Wire get request | `<Workflow>GetRequestSdk` | same | `SpeechToFormGetRequestSdk` |
| Wire answer (the `data` object) | `<Workflow>ResolveResponseSdk` | same | `SpeechToFormResolveResponseSdk` |
| Wire scopes | `<Workflow>{Workflow,Feature,State}RequestSdk`, `<Workflow>ConnectionResponseSdk` | same | |
| Shared wire bases / concretes | `…SdkBase` / `DeleteRequestSdk`, `QuotaResponseSdk` | `types/sdk/workflows/base.ts` | |
| Public options | `<Capability>Options` | `types/public/workflows/<cap>.ts` | `SpeechToFormOptions` |
| Public session | `<Capability>Session` | same | `SpeechToFormSession` |
| Internal orchestration params | `<Capability>WorkflowSessionParams` (`@internal`) | same | |
| React hook options / result | `Use<Capability>Options` / `Use<Capability>Result` | `packages/react/src/hooks/<cap>.ts` | `UseSpeechToFormResult` |
| Angular inject options / result | `Inject<Capability>Options` / `Inject<Capability>Result` | `packages/angular/src/inject.ts` | `InjectSpeechToFormResult` |

> The side marker `Sdk` is a **suffix on the role, immediately before an optional `Base`**; the
> workflow prefix leads. Public (camel) fragments are **plain concepts** — no wire role/marker
> words and no mode words.

### 4c. Convert functions

| Direction | Pattern | Lives in | Example |
|---|---|---|---|
| Outbound create | `to<Workflow>ResolveRequestSdk(options, auth, resumeSessionId?)` | `convert/outbound/workflows/<wf>.ts` | `toSpeechToFormResolveRequestSdk` |
| Outbound get | `to<Workflow>GetRequestSdk(options, sessionId)` | same | |
| Outbound shared pieces | `to<Thing>` / `toSdk<Thing>` | `convert/outbound/common/` | `toSdkFieldSpec`, `toSdkPrompts`, `mintUnsignedToken` |
| Inbound | `from<Thing>` | `convert/inbound/` | `fromSignal`, `fromFormDataResult` |

Direction verb is the law: **`to…` = camel → sdk (outbound)**, **`from…` = sdk → camel (inbound)**.
The scopes are assembled by `_form.ts` helpers switching on `form.source`; a builder reads as one
flat shape.

### 4d. API, sessions, bindings

| Kind | Pattern | Lives in | Example |
|---|---|---|---|
| Create / get / delete call | `create<Workflow>(baseUrl, request, inline)` / `get<Workflow>(baseUrl, request)` / `delete<Workflow>(baseUrl, request)` | `api/workflows/<wf>.ts` | `createSpeechToForm` |
| HTTP action call | `<verb><Workflow>(baseUrl, request)` | same | `extractTextToForm` |
| WS client factory | `create<Kind>Client` | `api/ws/<kind>.ts` | `createLifelineClient` |
| Universal session | `createWorkflowSession` | `session/base.ts` | (one, shared) |
| Connection adapter | `attach<Connection>Channel` | `session/channels.ts` | `attachResultsChannel` |
| Internal orchestration | `create<Capability>WorkflowSession` (`@internal`) | `session/workflows/<cap>.ts` | |
| Session factory (the client calls it) | `create<Capability>Session(client, options)` (`@internal`) | same | `createSpeechToFormSession` |
| Client method | `client.<capability>(options)` | `client.ts` | `client.speechToForm` |
| React hook | `use<Capability>` | `packages/react/src/hooks/<cap>.ts` | `useSpeechToForm` |
| Angular inject function | `inject<Capability>` | `packages/angular/src/inject.ts` | `injectSpeechToForm` |
| Forms input factory | `FormField` (object, not class) | `features/forms/form-field.ts` | `FormField.text(id, prompt)` |

**camelCase/PascalCase discipline:** types & interfaces `PascalCase`; functions, variables, hooks
`camelCase` (`use` prefix for hooks, `inject` for Angular); booleans `is/has/should/can`;
constants `UPPER_SNAKE_CASE` (`ROUTES`, `DEFAULT_BASE_URL`, `FIELD_TYPES`).

### 4e. Import extensions

`"module": "ESNext"` + `"moduleResolution": "bundler"` **NodeNext-style** TS: every relative import
**must** end in `.js` (even though the source is `.ts`), and use `import type` for type-only
imports. Copy the style of any existing file.

### 4f. Public TSDoc is the API reference

TSDoc on an exported symbol is generated verbatim into the customer-facing API reference. Write it
in product language — what the developer does and gets back; no service topology, vendors, or
internals; every property described (a blank cell in a generated table is a bug). Group tags:
the Core reference uses `Setup`, `Authentication`, `Forms`, `Fields`, `Callbacks`, `Events and errors`,
`Session state`; the per-package references use `Setup`, `Capability: Speech to form`,
`Capability: Text to form`. File-header and inline comments are contributor docs (never rendered).

---

## 5. The layers of one capability (the vertical slice)

**Create / record flow (speech-to-form):**

```
useSpeechToForm(options) / injectSpeechToForm / client.speechToForm   → createSpeechToFormSession(client, options)
  options holder h ─▶ createWorkflow: auth = await client.resolveAuth(h.current.account)
    ─▶ toSpeechToFormResolveRequestSdk(h.current, auth, resume?)    convert/outbound/workflows/speech-to-form.ts
      ─▶ createSpeechToForm(client.baseUrl, request, inline)        api/workflows/speech-to-form.ts
        POST …/speech-to-form/create-{portal|standalone}            ──▶ Speechineer
      ◀─ answer.data {session_id, connection, quota} (postForData)
  answer ─▶ createWorkflowSession opens the main connection          session/base.ts
  connection.audio_ws_url ─▶ attachAudioChannel → createAudioRecorder     session/channels.ts, tools/audio
  connection.form_data_ws_url ─▶ attachResultsChannel → createFormDataClient
  (transcript: true) connection.transcription_ws_url ─▶ attachTranscriptChannel
  every step ─▶ update() → finalize() → subscribers / onStateChange
```

**Result / event flow (back):**

```
form_data message (snake) ─▶ core.setFieldValue → state.values, then onFieldValue(fieldId, value)
transcription snapshot    ─▶ core.setTranscript → state.transcript, then onTranscript(text)
lifeline signal           ─▶ fromSignal → onEvent(SessionEvent)
lifeline crash            ─▶ fromCrashSignal → state.error + onError(SpeechineerError, runtime, not recoverable)
thrown errors             ─▶ toSpeechineerError(e, phase) → status failed + onError
```

Division of labor:

- **`session/base.ts` — `createWorkflowSession<C>`** owns what EVERY capability shares: create the
  session, open the main connection (the sole detector of failure / disconnect / 4404-not-found),
  delete on `end()`, **resume** on a 4404 via the get → create-on-404 chain, and the state. When
  the main connection is lost (non-4404) it tears every other connection down; `status` stays
  `active` and the next `start()` re-attaches (clearing `error`). Capability-agnostic —
  connections and actions are wired *in* through `onSessionReady` / `onSessionTeardown`.
- **`session/channels.ts` — `attach<Connection>Channel`** wraps one transport (or the recorder),
  reports that connection's status, and records what arrives on it into the state.
- **`session/workflows/<cap>.ts`** — the orchestration (which connections, which actions) + the
  factory the client calls (options holder, auth through the client, request builders).
- **Bindings** are thin: React `useSession(create, options)` (create once, `setOptions` every
  render, `dispose` on unmount) + `useSessionState` (`useSyncExternalStore`) + a memoized result;
  Angular `bindSession` (state → signals, `DestroyRef` disposal).

**The options-holder pattern** (every factory): callbacks are read at call time from `h.current`,
refreshed by `setOptions(next)`; the bindings call it each render / never capture `options` in a
closure directly. Identity (`form`, `transcript`, `initialValues`) is read **once** at creation.

---

## 6. RECIPE — Add a capability

Example: the service adds `speech_to_summary` (records audio, returns a summary over an HTTP
action). Do these **in order**; each file has a twin in `speech-to-form` (streamed) or
`text-to-form` (action) — copy the twin and rename.

1. **Route** — `constants.ts`: add `ROUTES.speechToSummary` (root + endpoints).
2. **Wire types** — `types/sdk/workflows/speech-to-summary.ts`: the scopes + `…ResolveRequestSdk` /
   `…GetRequestSdk` / `…ResolveResponseSdk` (+ action bodies); add to the barrel.
3. **Public types** — `types/public/workflows/speech-to-summary.ts`: `SpeechToSummaryOptions`
   (extends `SessionCallbacks` + the callbacks it needs; `form` if it fills a form), the
   `SpeechToSummarySession`, the `@internal` params; export the two public types from the barrel.
4. **Outbound convert** — `convert/outbound/workflows/speech-to-summary.ts`:
   `toSpeechToSummaryResolveRequestSdk(options, auth, resumeSessionId?)` + `…GetRequestSdk` via the
   `_form.ts` scope helpers (or their equivalent for a formless capability).
5. **Inbound convert** (only for action results) — `convert/inbound/workflows/speech-to-summary.ts`.
6. **API** — `api/workflows/speech-to-summary.ts`: create/get/delete (+ actions) via `_post.ts`,
   `baseUrl` first. **Do not** write `fetch` here.
7. **Session** — `session/workflows/speech-to-summary.ts`: the internal orchestration
   (`connections`, `onSessionReady` attaching, actions via `requireSessionId`) + the factory
   `createSpeechToSummarySession(client, options)`.
8. **Client** — `client.ts`: add `speechToSummary(options)` to `SpeechineerClient` + `createClient`.
9. **Bindings** — `packages/react/src/hooks/speech-to-summary.ts` (`useSpeechToSummary`,
   `UseSpeechToSummaryOptions/Result`) and `packages/angular/src/inject.ts`
   (`injectSpeechToSummary`, `InjectSpeechToSummaryOptions/Result`); export from each `index.ts`
   **and** each `docs-entry.ts`; add the types to `packages/js/src/docs-entry.ts`.
10. **TSDoc** — `@group Capability: Speech to summary` on the options, session, hook, inject
    function (+ one `@example`); add the group to the three `typedoc*.json` `groupOrder`s.
11. **Tests** — `packages/js/test/`: the request builder (both form sources), the session
    behavior with the fakes, the client route.
12. **Changeset** — `.changeset/<slug>.md` (`patch` on the 0.x line for a new capability; see `VERSIONING.md`).

## 7. RECIPE — Mirror a new API field

- **A new field type** — `types/sdk/common/field.ts` (`FieldType`), `features/forms/form-field.ts`
  (`FormField.<type>` + `FIELD_TYPES`), a config variant in `features/forms/fields.ts` + its snake
  twin + a branch in `toSdkFieldSpec` if it carries configuration.
- **A new option on a capability** — the public type (`types/public/workflows/<cap>.ts`) → the wire
  scope (`types/sdk/workflows/<wf>.ts`) → the builder (`convert/outbound/…`); document it (TSDoc).
- **A new answer field** — `<Workflow>ConnectionResponseSdk` → read it in the session orchestration.
- **A new prompt / model slot** — `SLOT_KEYS` in `convert/outbound/common/field.ts` + `Prompts` / `Models`.

---

## 8. Build, type-check, test, docs

```bash
npm install                       # links the workspace
npm run build                     # every package, js first (workspace order) — tsup, ESM + flat .d.ts
npm run typecheck                 # tsc --noEmit per package
npm test                          # vitest (packages/js/test)
npm run check -w @speechineer/js  # biome (format + lint)
```

`@speechineer/js` builds to a single bundled `dist/index.js` + one flat `dist/index.d.ts` (TSDoc
kept); the framework packages externalize `@speechineer/js` (a real dependency) and their
framework peer. The React entry carries a `'use client'` banner. Tests are deterministic: a
scriptable fake `WebSocket` + a fake recorder (`packages/js/test/fakes.ts`), explicit transitions,
no timers.

The API reference is generated with TypeDoc from the docs entries (`packages/js/src/core.ts` = the
shared Core reference; `packages/*/src/docs-entry.ts` = the per-package references), addressed
by [`docs-packages.json`](docs-packages.json). A new export must be added to `index.ts` **and** to
the matching docs entry, or it silently misses the reference.

## 9. Known gaps (read before shipping changes that touch these)

- **`signalVerbosity` is not wired.** `EventLevel` exists, but no public option filters the
  event stream client-side; filter in `onEvent`.
- **Transcription-only** (`speech_to_transcription`) is not a capability: it needs a formless
  feature on the service side. When that exists it lands as `client.transcription()` /
  `useTranscription` / `injectTranscription`, following the recipe in §6.
- **Template workflows** (`speech_to_template_and_form`) are not part of the public surface.
