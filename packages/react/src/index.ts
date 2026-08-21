// @speechineer/react — the package entry: the surface consumers import. Everything from
// @speechineer/js (the client, FormField, the types) plus the React wiring: the provider and
// one hook per capability. The rendered API-reference intro lives in docs-entry.ts.

export * from '@speechineer/js';
export { SpeechineerProvider, useSpeechineer } from './context.js';
export type { SpeechineerProviderProps } from './context.js';
export { useSpeechToForm } from './hooks/speech-to-form.js';
export type { UseSpeechToFormOptions, UseSpeechToFormResult } from './hooks/speech-to-form.js';
export { useTextToForm } from './hooks/text-to-form.js';
export type { UseTextToFormOptions, UseTextToFormResult } from './hooks/text-to-form.js';
