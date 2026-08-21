// @speechineer/angular — the package entry: the surface consumers import. Everything from
// @speechineer/js (the client, FormField, the types) plus the Angular wiring: the provider
// function and one inject function per capability. The rendered API-reference intro lives
// in docs-entry.ts.

export * from '@speechineer/js';
export { injectSpeechineer, provideSpeechineer } from './provide.js';
export { injectSpeechToForm, injectTextToForm } from './inject.js';
export type {
  InjectSpeechToFormOptions,
  InjectSpeechToFormResult,
  InjectTextToFormOptions,
  InjectTextToFormResult,
  SessionSignals,
} from './inject.js';
