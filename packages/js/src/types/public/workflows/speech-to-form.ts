/**
 * Dev-facing camelCase types for the speech-to-form capability: the options every binding
 * takes (`client.speechToForm()` / `useSpeechToForm()` / `injectSpeechToForm()`), the session
 * they return, and the internal orchestration params. `transcript: true` selects the
 * `speech_to_form_with_transcription` workflow on the wire; the options and the session are
 * the same either way.
 */

import type { FormDefinition } from '../../../features/forms/identity.js';
import type { SessionState } from '../../../session/state.js';
import type { SpeechToFormResolveResponseSdk } from '../../sdk/workflows/speech-to-form.js';
import type { SpeechToFormWithTranscriptionResolveResponseSdk } from '../../sdk/workflows/speech-to-form-with-transcription.js';
import type { Account } from '../common/auth.js';
import type { FormValueCallbacks, SessionCallbacks, TranscriptCallbacks } from '../common/callbacks.js';

/**
 * What you pass to start filling a form by voice. The same options work in every
 * framework; only the function that takes them differs.
 *
 * @group Capability: Speech to form
 */
export interface SpeechToFormOptions extends SessionCallbacks, FormValueCallbacks, TranscriptCallbacks {
  /** Which form to fill: the one configured in Speechineer, or one defined right here. */
  form: FormDefinition;
  /**
   * The language the user will speak (for example `'en'`, `'de'`). Detected
   * automatically when omitted; set it when you already know, for slightly
   * faster and more reliable recognition.
   */
  spokenLanguage?: string;
  /**
   * Also stream the spoken text: `transcript` in the state (and `onTranscript`)
   * fills while the user speaks. Fixed for the session — change it by creating a
   * new one.
   */
  transcript?: boolean;
  /**
   * Values you already captured, keyed by field id — for example when a user
   * resumes a form that was partly filled in earlier. They appear in `values`
   * immediately and Speechineer continues from them.
   */
  initialValues?: Record<string, unknown>;
  /**
   * The end user this session is for, when it differs from the client's default
   * `account`. Ignored when the client authenticates with a signed token — the
   * token carries the account.
   */
  account?: Account;
}

/**
 * A speech-to-form session: the controls plus the observable state. Field values
 * and the transcript live in the state (`values`, `transcript`) and also reach your
 * callbacks as they arrive.
 *
 * @group Capability: Speech to form
 */
export interface SpeechToFormSession {
  /**
   * Start listening. Asks for microphone permission the first time, prepares the
   * session, and begins sending audio. Safe to call again after `stop()` to continue
   * in the same session.
   */
  start: () => Promise<void>;
  /**
   * Pause listening. Values already being recognized still arrive, so late updates
   * after this call are expected — keep applying them.
   */
  stop: () => void;
  /**
   * Finish the session and release everything: the microphone, the connections, and
   * the session itself. `start()` afterwards begins a new one. `values` return to
   * `initialValues`.
   */
  end: () => Promise<void>;
  /**
   * Release the microphone and the connections without finishing the session
   * (leaving the page). The React and Angular bindings call this for you when the
   * component goes away.
   */
  dispose: () => void;
  /** The current session state. */
  getState: () => SessionState;
  /** Be told about every state change; returns the unsubscribe function. */
  subscribe: (listener: (state: SessionState) => void) => () => void;
  /**
   * Swap the options the session reads its callbacks from — the framework
   * bindings use it to keep the latest closures. `transcript` and `form.source`
   * stay with the session; the rest of `form` is read when the next session starts.
   */
  setOptions: (next: SpeechToFormOptions) => void;
}

/**
 * The wire answer of either speech-to-form workflow (with or without the transcript
 * connection).
 *
 * @internal
 */
export type SpeechToFormAnswer = SpeechToFormResolveResponseSdk | SpeechToFormWithTranscriptionResolveResponseSdk;

/**
 * Params of the internal orchestration. The public session factory builds these —
 * converting the dev options into the create/get/delete request runners — and
 * delegates to it.
 *
 * @internal
 */
export interface SpeechToFormWorkflowSessionParams extends SessionCallbacks, FormValueCallbacks, TranscriptCallbacks {
  /** Whether the session also streams the spoken text (the with-transcription workflow). */
  transcript: boolean;
  initialValues?: Record<string, unknown>;
  createWorkflow: (resumeSessionId?: string) => Promise<SpeechToFormAnswer>;
  getWorkflow: (sessionId: string) => Promise<SpeechToFormAnswer>;
  deleteWorkflow: (answer: SpeechToFormAnswer) => Promise<void>;
}
