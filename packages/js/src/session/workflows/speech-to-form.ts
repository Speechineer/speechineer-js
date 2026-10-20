/**
 * speech-to-form sessions. `createSpeechToFormWorkflowSession` (internal orchestration)
 * composes the universal session with the microphone, the results connection and — when
 * `transcript` is on — the transcript connection; the wire workflow is `speech_to_form`
 * or `speech_to_form_with_transcription` accordingly. The public factory
 * (`createSpeechToFormSession`, reached through `client.speechToForm()`) is the dev boundary:
 * it resolves the auth string through the client, converts options → request (outbound) and
 * forwards the dev callbacks through the options holder.
 */

import { createSpeechToForm, deleteSpeechToForm, getSpeechToForm } from '../../api/workflows/speech-to-form.js';
import {
  createSpeechToFormWithTranscription,
  deleteSpeechToFormWithTranscription,
  getSpeechToFormWithTranscription,
} from '../../api/workflows/speech-to-form-with-transcription.js';
import type { SpeechineerClient } from '../../client.js';
import {
  toSpeechToFormGetRequestSdk,
  toSpeechToFormResolveRequestSdk,
} from '../../convert/outbound/workflows/speech-to-form.js';
import {
  toSpeechToFormWithTranscriptionGetRequestSdk,
  toSpeechToFormWithTranscriptionResolveRequestSdk,
} from '../../convert/outbound/workflows/speech-to-form-with-transcription.js';
import { negotiateSdkLanguage, type SdkLanguage } from '../../errors/manifest.js';
import { isInlineForm } from '../../features/forms/identity.js';
import type {
  SpeechToFormAnswer,
  SpeechToFormOptions,
  SpeechToFormSession,
  SpeechToFormWorkflowSessionParams,
} from '../../types/public/workflows/speech-to-form.js';
import { createWorkflowSession } from '../base.js';
import {
  type AttachedAudioChannel,
  type AttachedChannel,
  attachAudioChannel,
  attachResultsChannel,
  attachTranscriptChannel,
} from '../channels.js';
import { safely } from '../safely.js';
import type { ConnectionKey } from '../state.js';
import {
  coreCallbackOptions,
  forwardFormValueCallbacks,
  forwardSessionCallbacks,
  forwardTranscriptCallbacks,
  type Holder,
} from './_shared.js';

// --- Orchestration (internal) ---

/** @internal */
export function createSpeechToFormWorkflowSession(
  params: SpeechToFormWorkflowSessionParams,
): Omit<SpeechToFormSession, 'setOptions'> {
  let results: AttachedChannel | null = null;
  let transcript: AttachedChannel | null = null;
  let audio: AttachedAudioChannel | null = null;

  const teardown = (): void => {
    audio?.detach();
    audio = null;
    results?.detach();
    results = null;
    transcript?.detach();
    transcript = null;
  };

  const connections: Exclude<ConnectionKey, 'session'>[] = params.transcript
    ? ['audio', 'results', 'transcript']
    : ['audio', 'results'];

  const core = createWorkflowSession<SpeechToFormAnswer>({
    connections,
    initialValues: params.initialValues,
    language: params.language,
    createWorkflowFn: (resumeSessionId) => params.createWorkflow(resumeSessionId),
    getWorkflowFn: (id) => params.getWorkflow(id),
    deleteWorkflowFn: (answer) => params.deleteWorkflow(answer),
    ...coreCallbackOptions<SpeechToFormAnswer>(params),
    onSessionReady: async ({ connection }) => {
      const current = core.getState().connections;
      if (current.results?.status !== 'open') {
        results?.detach();
        results = attachResultsChannel(core, connection.form_data_ws_url, {
          onFieldValue: (fieldId, value) => safely(() => params.onFieldValue?.(fieldId, value)),
        });
      }
      if (params.transcript && 'transcription_ws_url' in connection && current.transcript?.status !== 'open') {
        transcript?.detach();
        transcript = attachTranscriptChannel(core, connection.transcription_ws_url, {
          onTranscript: (text) => safely(() => params.onTranscript?.(text)),
        });
      }
      if (!audio) {
        audio = await attachAudioChannel(core, connection.audio_ws_url, {
          sampleRate: connection.audio_sample_rate,
          frameDurationMs: connection.audio_frame_duration_ms,
        });
      }
    },
    onSessionTeardown: teardown,
  });

  const stop = (): void => {
    // The declaration's UPPER_SNAKE `code`, not the old lower-case event name: the service's
    // `CLIENT_SIGNALS` map is keyed by code, and a key it does not recognise is dropped in
    // silence — which is exactly how this gesture stopped working (§7c-1).
    core.sendSignal('STOP_RECORDING_REQUESTED');
    audio?.stop();
    audio = null;
  };

  return {
    start: core.start,
    stop,
    end: core.end,
    dispose: core.dispose,
    getState: core.getState,
    subscribe: core.subscribe,
  };
}

// --- Public factory (reached through the client) ---

/**
 * Build a speech-to-form session for a client: the options holder (so bindings can
 * refresh the callbacks), the request runners (auth resolved through the client on
 * every create / resume), and the orchestration. `transcript` is read once — it picks the
 * wire workflow for the session's lifetime.
 *
 * @internal
 */
export function createSpeechToFormSession(
  client: SpeechineerClient,
  options: SpeechToFormOptions,
): SpeechToFormSession {
  const h: Holder<SpeechToFormOptions> = { current: options };
  const transcript = Boolean(options.transcript);
  const inline = isInlineForm(options.form);

  /**
   * The options as the request builders should see them: the session's own `uiLanguage` when it
   * set one, the client's otherwise.
   *
   * Resolved here rather than in the builder because only this layer knows the client. Read at
   * call time, like every other option, so a binding that refreshes options between a stop and
   * the next `start()` can switch the session's language — which the service reads as a switch
   * from that point on.
   */
  /**
   * The language that **travels**: what the session asked for, else what the client asked for,
   * else nothing — and nothing is meaningful, because Speechineer then negotiates it from the
   * request rather than being told a guess.
   */
  const wireLanguage = (): SdkLanguage | undefined => h.current.uiLanguage ?? client.uiLanguage;

  /**
   * The language the SDK renders its **own** messages in — always concrete, since nothing else
   * will translate them. Only this path falls back to the browser.
   */
  const language = (): SdkLanguage => wireLanguage() ?? negotiateSdkLanguage();

  const current = (): SpeechToFormOptions => ({ ...h.current, uiLanguage: wireLanguage() });

  const session = createSpeechToFormWorkflowSession({
    transcript,
    initialValues: options.initialValues,
    language,
    // `wireLanguage()` for every REQUEST, not `language()` (FLY-503): the transport asks
    // Speechineer for this language with `Accept-Language`, so an unnamed one must stay unnamed
    // — a resolved guess would override the browser's own q-weighted list. The api layer falls
    // back for its own sentences at render time.
    createWorkflow: async (resumeSessionId) => {
      // `language()` so a credential failure speaks the SESSION's language, not the
      // client's — the per-session `uiLanguage` was ignored here before (FLY-503). Resolved,
      // because nothing but the SDK translates that one.
      const auth = await client.resolveAuth(h.current.account, language());
      return transcript
        ? createSpeechToFormWithTranscription(
            client.baseUrl,
            toSpeechToFormWithTranscriptionResolveRequestSdk(current(), auth, resumeSessionId),
            inline,
            wireLanguage(),
          )
        : createSpeechToForm(
            client.baseUrl,
            toSpeechToFormResolveRequestSdk(current(), auth, resumeSessionId),
            inline,
            wireLanguage(),
          );
    },
    getWorkflow: (id) =>
      transcript
        ? getSpeechToFormWithTranscription(
            client.baseUrl,
            toSpeechToFormWithTranscriptionGetRequestSdk(current(), id),
            wireLanguage(),
          )
        : getSpeechToForm(client.baseUrl, toSpeechToFormGetRequestSdk(current(), id), wireLanguage()),
    deleteWorkflow: (answer) =>
      transcript
        ? deleteSpeechToFormWithTranscription(client.baseUrl, { session_id: answer.session_id }, wireLanguage())
        : deleteSpeechToForm(client.baseUrl, { session_id: answer.session_id }, wireLanguage()),
    ...forwardSessionCallbacks(h),
    ...forwardFormValueCallbacks(h),
    ...forwardTranscriptCallbacks(h),
  });

  return {
    ...session,
    setOptions: (next) => {
      h.current = next;
    },
  };
}
