/**
 * SDK ↔ service lifecycle calls for `speech_to_form_with_transcription` — the speech-to-form
 * workflow that also streams the spoken text (`transcript: true` on the public options). Flat
 * requests; the answer is the response envelope. Paths derive from
 * `ROUTES.speechToFormWithTranscription`; the API root is the client's `baseUrl`.
 *
 * Each returns the **whole envelope** — `ok` discriminates, the success half keeps its `meta`,
 * the failure half keeps the full `errors[]` list. The session layer narrows and converts.
 */

import { ROUTES } from '../../constants.js';
import type { SdkLanguage } from '../../errors/manifest.js';
import type { Envelope } from '../../types/sdk/common/envelope.js';
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
  language?: SdkLanguage,
): Promise<Envelope<SpeechToFormWithTranscriptionResolveResponseSdk>> {
  const endpoint = inline ? R.endpoints.createStandalone : R.endpoints.createPortal;
  return postForData<SpeechToFormWithTranscriptionResolveResponseSdk>(
    baseUrl,
    `${R.root}/${endpoint}`,
    request,
    language,
  );
}

/**
 * Fetch a **live** workflow (auth-less).
 *
 * A live-miss answers `WORKFLOW_NOT_FOUND`, the one failure the session's resume chain advances
 * on.
 */
export function getSpeechToFormWithTranscription(
  baseUrl: string,
  request: SpeechToFormWithTranscriptionGetRequestSdk,
  language?: SdkLanguage,
): Promise<Envelope<SpeechToFormWithTranscriptionResolveResponseSdk>> {
  return postForData<SpeechToFormWithTranscriptionResolveResponseSdk>(
    baseUrl,
    `${R.root}/${R.endpoints.get}`,
    request,
    language,
  );
}

/** Delete the workflow (auth-less; the service settles the session). */
export function deleteSpeechToFormWithTranscription(
  baseUrl: string,
  request: DeleteRequestSdk,
  language?: SdkLanguage,
): Promise<Envelope<null>> {
  return postForDelete(baseUrl, `${R.root}/${R.endpoints.delete}`, request, language);
}
