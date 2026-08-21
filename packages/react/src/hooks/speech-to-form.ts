/**
 * `useSpeechToForm` — the React binding of the speech-to-form session: one session per
 * component (created from the provider's client, or the `client` option), the latest
 * callbacks every render, the state as plain values.
 */

import type { SessionState, SpeechineerClient, SpeechToFormOptions } from '@speechineer/js';
import { useMemo } from 'react';
import { useClient } from '../context.js';
import { useSession, useSessionState } from './base.js';

/**
 * The options of `useSpeechToForm`: the session options every framework shares, plus
 * an optional `client` to use instead of the provider's.
 *
 * @group Capability: Speech to form
 */
export interface UseSpeechToFormOptions extends SpeechToFormOptions {
  /** Use this client instead of the nearest `SpeechineerProvider`'s. */
  client?: SpeechineerClient;
}

/**
 * What `useSpeechToForm` returns: the session state spread out for rendering
 * (`values`, `transcript`, `isListening`, `isConnecting`, `isEnding`, `error`,
 * `sessionId`, `status`, `connections`), the controls, and the full `state` object
 * for when you want to compare by reference.
 *
 * @group Capability: Speech to form
 */
export interface UseSpeechToFormResult extends SessionState {
  /** Start listening — see `SpeechToFormSession.start`. */
  start: () => Promise<void>;
  /** Pause listening — see `SpeechToFormSession.stop`. */
  stop: () => void;
  /** Finish the session — see `SpeechToFormSession.end`. */
  end: () => Promise<void>;
  /** The whole state object (the same values as the spread fields). */
  state: SessionState;
}

/**
 * Fill a form by voice. The session is created once per component and released
 * when the component goes away; the callbacks you pass are always the latest ones.
 * `transcript` and `form.source` are fixed for the component's lifetime; the rest of
 * `form` (key, version, language) is read each time a session starts, so a change
 * applies to the next session after `end()`. To change everything at once, render a
 * new component (for example with a `key`).
 *
 * @example
 * ```tsx
 * import { useSpeechToForm, FormField } from "@speechineer/react";
 *
 * const fields = [
 *   FormField.text("patientName", "Extract the patient full name"),
 *   FormField.integer("age", "Extract the age in years"),
 * ];
 *
 * function TalkToForm() {
 *   const { start, stop, isListening, values } = useSpeechToForm({
 *     form: { source: "inline", key: "patient-intake", version: "1", language: "en", fields },
 *   });
 *   return (
 *     <>
 *       <button type="button" onClick={isListening ? stop : () => void start()}>
 *         {isListening ? "Stop" : "Talk"}
 *       </button>
 *       <input value={String(values.patientName ?? "")} readOnly />
 *     </>
 *   );
 * }
 * ```
 *
 * @group Capability: Speech to form
 */
export function useSpeechToForm(options: UseSpeechToFormOptions): UseSpeechToFormResult {
  const client = useClient(options.client);
  const session = useSession((o: UseSpeechToFormOptions) => client.speechToForm(o), options);
  const state = useSessionState(session);
  return useMemo(
    () => ({ ...state, state, start: session.start, stop: session.stop, end: session.end }),
    [session, state],
  );
}
