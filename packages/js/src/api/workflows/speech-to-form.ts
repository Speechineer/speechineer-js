/**
 * SDK ↔ service lifecycle calls for `speech_to_form` (flat requests; the answer is the response
 * envelope). Paths derive from `ROUTES.speechToForm`; the API root is the client's `baseUrl`,
 * passed in by the session factory.
 *
 * Each returns the **whole envelope** — `ok` discriminates, the success half keeps its `meta`
 * (the advisory notices and the request id), the failure half keeps the full `errors[]` list.
 * The session layer narrows and converts; this layer speaks the wire.
 */

import { ROUTES } from '../../constants.js';
import type { SdkLanguage } from '../../errors/manifest.js';
import type { Envelope } from '../../types/sdk/common/envelope.js';
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
 * resume target — the service re-resolves the archived session and returns the id it settled on,
 * normally the same one.
 */
export function createSpeechToForm(
  baseUrl: string,
  request: SpeechToFormResolveRequestSdk,
  inline: boolean,
  language?: SdkLanguage,
): Promise<Envelope<SpeechToFormResolveResponseSdk>> {
  const endpoint = inline ? R.endpoints.createStandalone : R.endpoints.createPortal;
  return postForData<SpeechToFormResolveResponseSdk>(baseUrl, `${R.root}/${endpoint}`, request, language);
}

/**
 * Fetch a **live** speech-to-form workflow (auth-less); the request's `state` re-seeds it.
 *
 * A live-miss answers `WORKFLOW_NOT_FOUND`, which is the one failure the session's resume chain
 * advances on — it then re-invokes create with the same id.
 */
export function getSpeechToForm(
  baseUrl: string,
  request: SpeechToFormGetRequestSdk,
  language?: SdkLanguage,
): Promise<Envelope<SpeechToFormResolveResponseSdk>> {
  return postForData<SpeechToFormResolveResponseSdk>(baseUrl, `${R.root}/${R.endpoints.get}`, request, language);
}

/** Delete a speech-to-form workflow (auth-less; the service settles the session). */
export function deleteSpeechToForm(
  baseUrl: string,
  request: DeleteRequestSdk,
  language?: SdkLanguage,
): Promise<Envelope<null>> {
  return postForDelete(baseUrl, `${R.root}/${R.endpoints.delete}`, request, language);
}
