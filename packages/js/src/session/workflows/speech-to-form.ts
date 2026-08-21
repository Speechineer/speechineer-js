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
    createWorkflowFn: (resumeSessionId) => params.createWorkflow(resumeSessionId),
    getWorkflowFn: (id) => params.getWorkflow(id),
    deleteWorkflowFn: (answer) => params.deleteWorkflow(answer),
    ...coreCallbackOptions<SpeechToFormAnswer>(params),
    onSessionReady: async ({ connection }) => {
      const current = core.getState().connections;
      if (current.results?.status !== 'open') {
        results?.detach();
        results = attachResultsChannel(core, connection.form_data_ws_url, {
          onFieldValue: (fieldId, value) => params.onFieldValue?.(fieldId, value),
        });
      }
      if (params.transcript && 'transcription_ws_url' in connection && current.transcript?.status !== 'open') {
        transcript?.detach();
        transcript = attachTranscriptChannel(core, connection.transcription_ws_url, {
          onTranscript: (text) => params.onTranscript?.(text),
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
    core.sendSignal('stop_recording_requested');
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

  const session = createSpeechToFormWorkflowSession({
    transcript,
    initialValues: options.initialValues,
    createWorkflow: async (resumeSessionId) => {
      const auth = await client.resolveAuth(h.current.account);
      return transcript
        ? createSpeechToFormWithTranscription(
            client.baseUrl,
            toSpeechToFormWithTranscriptionResolveRequestSdk(h.current, auth, resumeSessionId),
            inline,
          )
        : createSpeechToForm(client.baseUrl, toSpeechToFormResolveRequestSdk(h.current, auth, resumeSessionId), inline);
    },
    getWorkflow: (id) =>
      transcript
        ? getSpeechToFormWithTranscription(client.baseUrl, toSpeechToFormWithTranscriptionGetRequestSdk(h.current, id))
        : getSpeechToForm(client.baseUrl, toSpeechToFormGetRequestSdk(h.current, id)),
    deleteWorkflow: (answer) =>
      transcript
        ? deleteSpeechToFormWithTranscription(client.baseUrl, { session_id: answer.session_id })
        : deleteSpeechToForm(client.baseUrl, { session_id: answer.session_id }),
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
