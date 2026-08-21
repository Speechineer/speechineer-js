/**
 * SDK ↔ service lifecycle calls for `speech_to_form_with_transcription` — the speech-to-form
 * workflow that also streams the spoken text (`transcript: true` on the public options). Flat
 * requests; the answer is the response envelope's `data` object. Paths derive from
 * `ROUTES.speechToFormWithTranscription`; the API root is the client's `baseUrl`.
 */

import { ROUTES } from '../../constants.js';
import type { DeleteRequestSdk } from '../../types/sdk/workflows/base.js';
import type {
  SpeechToFormWithTranscriptionGetRequestSdk,
  SpeechToFormWithTranscriptionResolveRequestSdk,
  SpeechToFormWithTranscriptionResolveResponseSdk,
} from '../../types/sdk/workflows/speech-to-form-with-transcription.js';
import { postForData, postForDelete } from './_post.js';

const R = ROUTES.speechToFormWithTranscription;

/** Create a speech-to-form-with-transcription workflow (`inline` picks the resolve route). */
export function createSpeechToFormWithTranscription(
  baseUrl: string,
  request: SpeechToFormWithTranscriptionResolveRequestSdk,
  inline: boolean,
): Promise<SpeechToFormWithTranscriptionResolveResponseSdk> {
  const endpoint = inline ? R.endpoints.createStandalone : R.endpoints.createPortal;
  return postForData<SpeechToFormWithTranscriptionResolveResponseSdk>(baseUrl, `${R.root}/${endpoint}`, request);
}

/** Fetch a **live** workflow (auth-less); a live-miss 404s ({@link WorkflowNotFoundError}). */
export function getSpeechToFormWithTranscription(
  baseUrl: string,
  request: SpeechToFormWithTranscriptionGetRequestSdk,
): Promise<SpeechToFormWithTranscriptionResolveResponseSdk> {
  return postForData<SpeechToFormWithTranscriptionResolveResponseSdk>(baseUrl, `${R.root}/${R.endpoints.get}`, request);
}

/** Delete the workflow (auth-less; the service settles the session). */
export function deleteSpeechToFormWithTranscription(baseUrl: string, request: DeleteRequestSdk): Promise<void> {
  return postForDelete(baseUrl, `${R.root}/${R.endpoints.delete}`, request);
}
