/**
 * SDK ↔ service calls for `text_to_form`: the flat lifecycle (create / get / delete) plus the
 * custom `extract` HTTP action. Paths derive from `ROUTES.textToForm`; the API root is the
 * client's `baseUrl`, passed in by the session factory.
 *
 * Each returns the **whole envelope** — `ok` discriminates, the success half keeps its `meta`,
 * the failure half keeps the full `errors[]` list. The session layer narrows and converts.
 */

import { ROUTES } from '../../constants.js';
import type { SdkLanguage } from '../../errors/manifest.js';
import type { Envelope } from '../../types/sdk/common/envelope.js';
import type { FormDataExtractionResult } from '../../types/sdk/common/form-data-extraction.js';
import type { DeleteRequestSdk } from '../../types/sdk/workflows/base.js';
import type {
  FormTextRequest,
  TextToFormGetRequestSdk,
  TextToFormResolveRequestSdk,
  TextToFormResolveResponseSdk,
} from '../../types/sdk/workflows/text-to-form.js';
import { postForData, postForDelete, postForResult } from './_post.js';

const R = ROUTES.textToForm;

// --- Lifecycle (flat request; enveloped answer) ---

/**
 * Create a text-to-form workflow. `inline` picks the resolve route (`create-standalone` for a
 * standalone form, `create-portal` for a workspace form). A `session_id` on the request is a
 * resume target — the service re-resolves the archived session and returns the id it settled on.
 */
export function createTextToForm(
  baseUrl: string,
  request: TextToFormResolveRequestSdk,
  inline: boolean,
  language?: SdkLanguage,
): Promise<Envelope<TextToFormResolveResponseSdk>> {
  const endpoint = inline ? R.endpoints.createStandalone : R.endpoints.createPortal;
  return postForData<TextToFormResolveResponseSdk>(baseUrl, `${R.root}/${endpoint}`, request, language);
}

/** Fetch a **live** text-to-form workflow (auth-less); the request's `state` re-seeds it. */
export function getTextToForm(
  baseUrl: string,
  request: TextToFormGetRequestSdk,
  language?: SdkLanguage,
): Promise<Envelope<TextToFormResolveResponseSdk>> {
  return postForData<TextToFormResolveResponseSdk>(baseUrl, `${R.root}/${R.endpoints.get}`, request, language);
}

/** Delete a text-to-form workflow (auth-less; the service settles the session). */
export function deleteTextToForm(
  baseUrl: string,
  request: DeleteRequestSdk,
  language?: SdkLanguage,
): Promise<Envelope<null>> {
  return postForDelete(baseUrl, `${R.root}/${R.endpoints.delete}`, request, language);
}

// --- HTTP action (custom body, targets a LIVE workflow via `session_id`) ---

/**
 * Extract form data from the posted source text.
 *
 * Unenveloped on success — the body *is* the result — while a failure arrives in the same
 * envelope as everything else, which is why this still answers one.
 */
export function extractTextToForm(
  baseUrl: string,
  request: FormTextRequest,
  language?: SdkLanguage,
): Promise<Envelope<FormDataExtractionResult>> {
  return postForResult<FormDataExtractionResult>(baseUrl, `${R.root}/${R.endpoints.extract}`, request, language);
}
