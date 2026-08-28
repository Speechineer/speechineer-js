/**
 * The Angular binding of the framework-free sessions: one `inject<Capability>(options)`
 * function per capability. Call it in an injection context (a constructor or a field
 * initializer of a component / service). It creates the session from the provided client,
 * exposes its state as signals, and disposes it with the injector (`DestroyRef`).
 */

import { computed, DestroyRef, effect, inject, type Signal, signal } from '@angular/core';
import type {
  SessionState,
  SpeechineerClient,
  SpeechineerError,
  SpeechToFormOptions,
  SpeechToFormSession,
  TextToFormOptions,
  TextToFormSession,
} from '@speechineer/js';
import { resolveClient } from './provide.js';

/**
 * The session state as signals — the same shape every framework reports, one signal
 * per field you typically render, plus `state` for the whole object.
 *
 * @group Session state
 */
export interface SessionSignals {
  /** The whole state object as a signal; it updates on every change. */
  readonly state: Signal<SessionState>;
  /** Where the session is in its life. */
  readonly status: Signal<SessionState['status']>;
  /** The id of the running session, or `null`. */
  readonly sessionId: Signal<string | null>;
  /** The last error, or `null`. */
  readonly error: Signal<SpeechineerError | null>;
  /** The latest recognized value of every field, keyed by field id. */
  readonly values: Signal<Readonly<Record<string, unknown>>>;
  /** The spoken text so far. */
  readonly transcript: Signal<string>;
  /** The microphone is on and audio is being sent. */
  readonly isListening: Signal<boolean>;
  /** The session or one of its connections is being established. */
  readonly isConnecting: Signal<boolean>;
  /** The session is being finished, or the microphone is winding down. */
  readonly isEnding: Signal<boolean>;
}

interface Bindable {
  getState: () => SessionState;
  subscribe: (listener: (state: SessionState) => void) => () => void;
  dispose: () => void;
}

/** Bind a session to the current injector: state → signals, dispose on destroy. @internal */
export function bindSession<S extends Bindable>(session: S): S & SessionSignals {
  const state = signal(session.getState());
  const unsubscribe = session.subscribe((next) => state.set(next));
  inject(DestroyRef).onDestroy(() => {
    unsubscribe();
    session.dispose();
  });
  const signals: SessionSignals = {
    state: state.asReadonly(),
    status: computed(() => state().status),
    sessionId: computed(() => state().sessionId),
    error: computed(() => state().error),
    values: computed(() => state().values),
    transcript: computed(() => state().transcript),
    isListening: computed(() => state().isListening),
    isConnecting: computed(() => state().isConnecting),
    isEnding: computed(() => state().isEnding),
  };
  return Object.assign(session, signals);
}

/** Read an options source: a plain object as-is, a reactive one by calling it. @internal */
function readOptions<O>(source: O | (() => O)): O {
  return typeof source === 'function' ? (source as () => O)() : source;
}

/**
 * Re-apply a reactive options source to the session whenever the signals it reads change.
 *
 * A plain object is left alone — there is nothing to track. The effect registers against the
 * current injector, so it is torn down with the component like the subscription in
 * `bindSession`.
 * @internal
 */
function trackOptions<O>(session: { setOptions: (next: O) => void }, source: O | (() => O)): void {
  if (typeof source !== 'function') return;
  effect(() => session.setOptions((source as () => O)()));
}

/**
 * The options of `injectSpeechToForm`: the session options every framework shares, plus
 * an optional `client` to use instead of the provided one.
 *
 * @group Capability: Speech to form
 */
export interface InjectSpeechToFormOptions extends SpeechToFormOptions {
  /** Use this client instead of the one `provideSpeechineer` registered. */
  client?: SpeechineerClient;
}

/**
 * What `injectSpeechToForm` returns: the session (`start`, `stop`, `end`, …) plus its
 * state as signals.
 *
 * @group Capability: Speech to form
 */
export type InjectSpeechToFormResult = SpeechToFormSession & SessionSignals;

/**
 * Fill a form by voice. Call it in an injection context; the session is released
 * with the component. Render from the signals (`isListening()`, `values()`, …) and
 * drive it with `start()` / `stop()` / `end()`.
 *
 * Pass a plain object when the options never change. Pass a **function** when they depend on
 * signals: it is re-read whenever those signals change, so callbacks and `initialValues`
 * follow the component instead of staying at the values they had when the session was
 * created. That matters for `initialValues` in particular — a session that reconnects sends
 * the values the form holds at that moment, not the ones it started with.
 *
 * @example
 * ```ts
 * import { Component } from "@angular/core";
 * import { injectSpeechToForm, FormField } from "@speechineer/angular";
 *
 * @Component({
 *   selector: "talk-to-form",
 *   template: `
 *     <button type="button" (click)="voice.isListening() ? voice.stop() : voice.start()">
 *       {{ voice.isListening() ? "Stop" : "Talk" }}
 *     </button>
 *     <input [value]="voice.values()['patientName'] ?? ''" readonly />
 *   `,
 * })
 * export class TalkToForm {
 *   readonly voice = injectSpeechToForm({
 *     form: { source: "inline", key: "patient-intake", version: "1", language: "en",
 *       fields: [FormField.text("patientName", "Extract the patient full name")] },
 *   });
 * }
 * ```
 *
 * @group Capability: Speech to form
 */
export function injectSpeechToForm(
  options: InjectSpeechToFormOptions | (() => InjectSpeechToFormOptions),
): InjectSpeechToFormResult {
  const initial = readOptions(options);
  const session = resolveClient(initial.client).speechToForm(initial);
  trackOptions(session, options);
  return bindSession(session);
}

/**
 * The options of `injectTextToForm`: the session options every framework shares, plus
 * an optional `client` to use instead of the provided one.
 *
 * @group Capability: Text to form
 */
export interface InjectTextToFormOptions extends TextToFormOptions {
  /** Use this client instead of the one `provideSpeechineer` registered. */
  client?: SpeechineerClient;
}

/**
 * What `injectTextToForm` returns: the session (`extract`, `start`, `end`, …) plus its
 * state as signals.
 *
 * @group Capability: Text to form
 */
export type InjectTextToFormResult = TextToFormSession & SessionSignals;

/**
 * Extract field values from text. Call it in an injection context; `extract(text)`
 * opens the session on first use and merges every result into `values()`.
 *
 * As with `injectSpeechToForm`, pass a function instead of a plain object when the options
 * depend on signals and should follow the component.
 *
 * @group Capability: Text to form
 */
export function injectTextToForm(
  options: InjectTextToFormOptions | (() => InjectTextToFormOptions),
): InjectTextToFormResult {
  const initial = readOptions(options);
  const session = resolveClient(initial.client).textToForm(initial);
  trackOptions(session, options);
  return bindSession(session);
}
