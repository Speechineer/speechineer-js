/**
 * SDK ↔ service flat lifecycle contract for `speech_to_form` (both directions) —
 * mirrors the Speechineer API's schema.
 *
 * - request (fe → be): `SpeechToFormResolveRequestSdk` — `auth` + optional `session_id` +
 *   `workflow` + `feature` + `state` (flat, no envelope). `feature` carries the (optional)
 *   `spoken_language` STT hint forwarded to the portal; `state` carries the restorable field values
 *   **and** `transcription_language` be reads locally.
 * - answer  (be → fe): `SpeechToFormResolveResponseSdk` — the `data` object
 *   `{ session_id, connection, quota }` (`connection` = lifeline/audio/form-data URLs + audio format).
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

export interface SpeechToFormWorkflowRequestSdk extends WorkflowRequestSdkBase {
  workflow_key: 'speech_to_form';
}

export interface SpeechToFormFeatureRequestSdk extends FeatureRequestSdkBase {
  /** Optional STT (spoken) language hint (auto-detected if absent); forwarded to the portal. */
  spoken_language?: string | null;
  /** System prompts keyed by name (`system_prompt_key`). */
  system_prompts?: Record<string, string> | null;
  /** Fields to extract (optional). */
  fields?: FieldSpec[] | null;
}

export interface SpeechToFormStateRequestSdk extends StateRequestSdkBase {
  /** Previously extracted field values to restore (optional). */
  field_values?: FieldValue[] | null;
  /** Optional STT language hint; read by the service from state (never forwarded to the portal). */
  transcription_language?: string | null;
}

export interface SpeechToFormResolveRequestSdk extends ResolveRequestSdkBase {
  workflow: SpeechToFormWorkflowRequestSdk;
  feature: SpeechToFormFeatureRequestSdk;
  state: SpeechToFormStateRequestSdk;
}

export interface SpeechToFormGetRequestSdk extends GetRequestSdkBase {
  state?: SpeechToFormStateRequestSdk;
}

// --- Answer (be → fe): the `data` object -----------------------------------

export interface SpeechToFormConnectionResponseSdk extends ConnectionResponseSdkBase {
  audio_ws_url: string;
  /** Form-data WebSocket URL (streamed field updates). */
  form_data_ws_url: string;
  audio_sample_rate: number;
  audio_frame_duration_ms: number;
}

export interface SpeechToFormResolveResponseSdk extends ResolveResponseSdkBase {
  connection: SpeechToFormConnectionResponseSdk;
}
