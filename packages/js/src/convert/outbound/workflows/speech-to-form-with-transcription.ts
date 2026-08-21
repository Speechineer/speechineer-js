/**
 * Outbound request assembly for speech_to_form_with_transcription — the same options as
 * speech_to_form (`transcript: true` selected this workflow), a different `workflow_key`.
 */

import type { SpeechToFormOptions } from '../../../types/public/workflows/speech-to-form.js';
import type {
  SpeechToFormWithTranscriptionGetRequestSdk,
  SpeechToFormWithTranscriptionResolveRequestSdk,
} from '../../../types/sdk/workflows/speech-to-form-with-transcription.js';
import { toFeatureScope, toStateScope, toWorkflowScope } from './_form.js';

/** The create request: `auth` + optional resume target + the three flat scopes. */
export function toSpeechToFormWithTranscriptionResolveRequestSdk(
  options: SpeechToFormOptions,
  auth: string,
  resumeSessionId?: string,
): SpeechToFormWithTranscriptionResolveRequestSdk {
  return {
    auth,
    ...(resumeSessionId ? { session_id: resumeSessionId } : {}),
    workflow: toWorkflowScope('speech_to_form_with_transcription', options.form),
    feature: toFeatureScope(options.form, options.spokenLanguage),
    state: toStateScope(options.initialValues, options.spokenLanguage),
  };
}

/** Get re-seed (auth-less, live-only): the target id + the restorable `state`. */
export function toSpeechToFormWithTranscriptionGetRequestSdk(
  options: SpeechToFormOptions,
  sessionId: string,
): SpeechToFormWithTranscriptionGetRequestSdk {
  return {
    session_id: sessionId,
    state: toStateScope(options.initialValues, options.spokenLanguage),
  };
}
