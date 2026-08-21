/**
 * Speechineer for JavaScript — framework-free. Create the client once
 * (`createClient`), then create a session for what you want to do:
 * `client.speechToForm(options)` to fill a form by voice, `client.textToForm(options)`
 * to fill it from text. Subscribe to the session's `state` and render from it; drive
 * it with `start` / `stop` / `end` (or `extract`). Nothing here depends on a UI
 * framework — the React hooks and the Angular functions are thin wrappers over exactly
 * these sessions.
 *
 * Every session reports the same `SessionState`: the lifecycle, the id, the last
 * error, the latest `values`, the `transcript`, `isListening`, and one entry per
 * connection. The client, the form definition, the callbacks, and the state types are
 * shared by every package and documented once in the **Core** reference.
 *
 * @module
 *
 * @groupDescription Setup
 * The client: where Speechineer is and who is calling. Create it once; every session
 * starts from it.
 *
 * @groupDescription Capability: Speech to form
 * Fill a form by voice: values stream into `values` (and `onFieldValue`) as the user
 * speaks; add `transcript: true` to also receive the spoken text.
 *
 * @groupDescription Capability: Text to form
 * No recording at all — turn text the user typed or pasted into field values, as often
 * as you like.
 */

// Contributor note (never rendered): the TypeDoc entry of the JavaScript reference
// (packages/js/typedoc.javascript.json). It lists the client + the capability option and
// session types; the shared types (state, auth, forms, callbacks) are documented once in the
// Core reference (core.ts). Not part of the tsup build graph.

export type {
  SpeechineerClient,
  SpeechToFormOptions,
  SpeechToFormSession,
  TextToFormOptions,
  TextToFormSession,
} from './index.js';
export { createClient } from './index.js';
