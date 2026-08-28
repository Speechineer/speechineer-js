/**
 * SDK ↔ service lifecycle calls for `speech_to_form` (flat requests; the answer is the
 * response envelope's `data` object). Paths derive from `ROUTES.speechToForm`; the API root
 * is the client's `baseUrl`, passed in by the session factory.
 */

import { ROUTES } from '../../constants.js';
import type { DeleteRequestSdk } from '../../types/sdk/workflows/base.js';
import type {
  SpeechToFormGetRequestSdk,
  SpeechToFormResolveRequestSdk,
  SpeechToFormResolveResponseSdk,
} from '../../types/sdk/workflows/speech-to-form.js';
import { postForData, postForDelete } from './_post.js';

const R = ROUTES.speechToForm;

/**
 * Create a speech-to-form workflow. `inline` picks the resolve route (`create-standalone` for a
 * standalone form, `create-portal` for a workspace form). A `session_id` on the request is a
 * resume target — the service re-resolves the archived session and mints a **new** id, returned
 * on the answer.
 */
export function createSpeechToForm(
  baseUrl: string,
  request: SpeechToFormResolveRequestSdk,
  inline: boolean,
): Promise<SpeechToFormResolveResponseSdk> {
  const endpoint = inline ? R.endpoints.createStandalone : R.endpoints.createPortal;
  return postForData<SpeechToFormResolveResponseSdk>(baseUrl, `${R.root}/${endpoint}`, request);
}

/**
 * Fetch a **live** speech-to-form workflow (auth-less); the request's `state` re-seeds it. A
 * live-miss 404s ({@link WorkflowNotFoundError}) — the session then re-invokes create with the id.
 */
export function getSpeechToForm(
  baseUrl: string,
  request: SpeechToFormGetRequestSdk,
): Promise<SpeechToFormResolveResponseSdk> {
  return postForData<SpeechToFormResolveResponseSdk>(baseUrl, `${R.root}/${R.endpoints.get}`, request);
}

/** Delete a speech-to-form workflow (auth-less; the service settles the session). */
export function deleteSpeechToForm(baseUrl: string, request: DeleteRequestSdk): Promise<void> {
  return postForDelete(baseUrl, `${R.root}/${R.endpoints.delete}`, request);
}
