/**
 * Speechineer for React. Wrap your app in `SpeechineerProvider` once (your API key, or a
 * token your server signs), then call one hook per capability: `useSpeechToForm` to fill
 * a form by voice, `useTextToForm` to fill it from text. Each hook gives you the session
 * state as plain values (`values`, `transcript`, `isListening`, `error`, …) and the
 * controls (`start`, `stop`, `end` / `extract`). The client, the form definition, the
 * callbacks, and the state types are shared by every package and documented once in the
 * **Core** reference.
 *
 * @module
 *
 * @groupDescription Setup
 * The provider: give it your credentials (or a client you created) and every hook below
 * it uses the same client.
 *
 * @groupDescription Capability: Speech to form
 * Fill a form by voice: values stream into `values` (and `onFieldValue`) as the user
 * speaks; add `transcript: true` to also receive the spoken text.
 *
 * @groupDescription Capability: Text to form
 * No recording at all — turn text the user typed or pasted into field values, as often
 * as you like.
 */

// Contributor note (never rendered): this file exists ONLY for the generated API reference
// (packages/react/typedoc.json reads it as the entry). It lists the React surface MINUS the
// shared symbols, which are documented once in the Core reference (packages/js/src/core.ts).
// The real package surface — what consumers import — is index.ts.

export { SpeechineerProvider, useSpeechineer } from './context.js';
export type { SpeechineerProviderProps } from './context.js';
export { useSpeechToForm } from './hooks/speech-to-form.js';
export type { UseSpeechToFormOptions, UseSpeechToFormResult } from './hooks/speech-to-form.js';
export { useTextToForm } from './hooks/text-to-form.js';
export type { UseTextToFormOptions, UseTextToFormResult } from './hooks/text-to-form.js';
