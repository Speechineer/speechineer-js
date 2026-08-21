/**
 * Speechineer for Angular. Register it once with `provideSpeechineer` (your API key, or a
 * token your server signs), then call one inject function per capability in a component or
 * service: `injectSpeechToForm` to fill a form by voice, `injectTextToForm` to fill it from
 * text. Each returns the session (`start`, `stop`, `end` / `extract`) with its state as
 * signals (`values()`, `transcript()`, `isListening()`, `error()`, …). The client, the form
 * definition, the callbacks, and the state types are shared by every package and documented
 * once in the **Core** reference.
 *
 * @module
 *
 * @groupDescription Setup
 * The provider function: give it your credentials (or a client you created) in your
 * application providers and every inject function uses the same client.
 *
 * @groupDescription Capability: Speech to form
 * Fill a form by voice: values stream into `values()` (and `onFieldValue`) as the user
 * speaks; add `transcript: true` to also receive the spoken text.
 *
 * @groupDescription Capability: Text to form
 * No recording at all — turn text the user typed or pasted into field values, as often
 * as you like.
 *
 * @groupDescription Session state
 * The state as signals — one per field you typically render.
 */

// Contributor note (never rendered): this file exists ONLY for the generated API reference
// (packages/angular/typedoc.json reads it as the entry). It lists the Angular surface MINUS
// the shared symbols, which are documented once in the Core reference
// (packages/js/src/core.ts). The real package surface — what consumers import — is index.ts.

export { injectSpeechineer, provideSpeechineer } from './provide.js';
export { injectSpeechToForm, injectTextToForm } from './inject.js';
export type {
  InjectSpeechToFormOptions,
  InjectSpeechToFormResult,
  InjectTextToFormOptions,
  InjectTextToFormResult,
  SessionSignals,
} from './inject.js';
