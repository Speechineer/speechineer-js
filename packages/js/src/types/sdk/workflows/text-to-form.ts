/**
 * SDK ↔ service flat lifecycle contract for `text_to_form` (both directions) — mirrors
 * the Speechineer API's text-to-form schema and its extract action.
 *
 * A form-data-extraction-only workflow: text in over the HTTP `extract` action, form data back.
 * No audio and no streaming data plane, so the `connection` answer carries only the mandatory
 * `lifeline_ws_url` (inherited). The `feature` carries the fields to extract; the `state` the
 * restorable values.
 */

import type { FieldSpec, FieldValue } from '../common/field.js';
import type {
  ConnectionResponseSdkBase,
  FeatureRequestSdkBase,
  GetRequestSdkBase,
  ResolveRequestSdkBase,
  ResolveResponseSdkBase,
  StateRequestSdkBase,
  WorkflowRequestSdkBase,
} from './base.js';

// --- Request (fe → be) -----------------------------------------------------

export interface TextToFormWorkflowRequestSdk extends WorkflowRequestSdkBase {
  workflow_key: 'text_to_form';
}

export interface TextToFormFeatureRequestSdk extends FeatureRequestSdkBase {
  /** System prompts keyed by name (`system_prompt_key`). */
  system_prompts?: Record<string, string> | null;
  /** Fields to extract (optional). */
  fields?: FieldSpec[] | null;
}

export interface TextToFormStateRequestSdk extends StateRequestSdkBase {
  /** Previously extracted field values to restore (the extractor baseline). */
  field_values?: FieldValue[] | null;
}

export interface TextToFormResolveRequestSdk extends ResolveRequestSdkBase {
  workflow: TextToFormWorkflowRequestSdk;
  feature: TextToFormFeatureRequestSdk;
  state: TextToFormStateRequestSdk;
}

export interface TextToFormGetRequestSdk extends GetRequestSdkBase {
  state?: TextToFormStateRequestSdk;
}

// --- Answer (be → fe): the `data` object -----------------------------------

/** Connection scope: only the mandatory `lifeline_ws_url` (inherited) — no data-plane WS. */
export interface TextToFormConnectionResponseSdk extends ConnectionResponseSdkBase {}

export interface TextToFormResolveResponseSdk extends ResolveResponseSdkBase {
  connection: TextToFormConnectionResponseSdk;
}

// --- HTTP action body (custom, non-enveloped; targets a LIVE workflow via `session_id`) ---
// Mirrors the Speechineer API's extract action. The result is the shared
// `FormDataExtractionResult` (types/sdk/common/form-data-extraction.ts).

/** POST body for `…/text-to-form/extract`: the source text + the target id. */
export interface FormTextRequest {
  session_id: string;
  text: string;
}
