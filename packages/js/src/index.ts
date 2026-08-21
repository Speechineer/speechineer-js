/**
 * @speechineer/js — Speechineer for JavaScript, framework-free: the client, the two
 * capabilities it creates sessions for (speech-to-form, text-to-form), the form vocabulary
 * (`FormField`, `FieldSpec`, `FormDefinition`), and the state every session reports. The
 * React and Angular packages build on exactly this surface and re-export it.
 *
 * Internal layers (api/, convert/, tools/, the session core) are NOT re-exported.
 */

export type { SpeechineerClient } from './client.js';
export { createClient } from './client.js';
export { DEFAULT_BASE_URL } from './constants.js';
export type { ErrorPhase } from './errors.js';
export { SpeechineerError } from './errors.js';
export * from './features/index.js';
export * from './session/index.js';
export * from './types/index.js';
