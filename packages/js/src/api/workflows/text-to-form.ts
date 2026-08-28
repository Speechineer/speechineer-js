/**
 * SDK ↔ service calls for `text_to_form`: the flat lifecycle (create / get / delete) plus the
 * custom `extract` HTTP action. Paths derive from `ROUTES.textToForm`; the API root is the
 * client's `baseUrl`, passed in by the session factory.
 */

import { ROUTES } from '../../constants.js';
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
 * resume target — the service re-resolves the archived session and mints a **new** id.
 */
export function createTextToForm(
  baseUrl: string,
  request: TextToFormResolveRequestSdk,
  inline: boolean,
): Promise<TextToFormResolveResponseSdk> {
  const endpoint = inline ? R.endpoints.createStandalone : R.endpoints.createPortal;
  return postForData<TextToFormResolveResponseSdk>(baseUrl, `${R.root}/${endpoint}`, request);
}

/** Fetch a **live** text-to-form workflow (auth-less); the request's `state` re-seeds it. */
export function getTextToForm(
  baseUrl: string,
  request: TextToFormGetRequestSdk,
): Promise<TextToFormResolveResponseSdk> {
  return postForData<TextToFormResolveResponseSdk>(baseUrl, `${R.root}/${R.endpoints.get}`, request);
}

/** Delete a text-to-form workflow (auth-less; the service settles the session). */
export function deleteTextToForm(baseUrl: string, request: DeleteRequestSdk): Promise<void> {
  return postForDelete(baseUrl, `${R.root}/${R.endpoints.delete}`, request);
}

// --- HTTP action (custom body, targets a LIVE workflow via `session_id`) ---

/** Extract form data from the posted source text. */
export function extractTextToForm(baseUrl: string, request: FormTextRequest): Promise<FormDataExtractionResult> {
  return postForResult<FormDataExtractionResult>(baseUrl, `${R.root}/${R.endpoints.extract}`, request);
}
