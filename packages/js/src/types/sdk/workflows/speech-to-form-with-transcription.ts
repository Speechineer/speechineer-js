/**
 * SDK ↔ service flat lifecycle contract for `speech_to_form_with_transcription` (both
 * directions) — mirrors the Speechineer API's schema.
 *
 * Identical to `speech_to_form` plus a fourth connection URL: `connection.transcription_ws_url`
 * for the outbound WebSocket that streams the accumulated transcript text to the client.
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

export interface SpeechToFormWithTranscriptionWorkflowRequestSdk extends WorkflowRequestSdkBase {
  workflow_key: 'speech_to_form_with_transcription';
}

export interface SpeechToFormWithTranscriptionFeatureRequestSdk extends FeatureRequestSdkBase {
  /** Optional STT (spoken) language hint (auto-detected if absent); forwarded to the portal. */
  spoken_language?: string | null;
  /** System prompts keyed by name (`system_prompt_key`). */
  system_prompts?: Record<string, string> | null;
  /** Fields to extract (optional). */
  fields?: FieldSpec[] | null;
}

export interface SpeechToFormWithTranscriptionStateRequestSdk extends StateRequestSdkBase {
  /** Previously extracted field values to restore (optional). */
  field_values?: FieldValue[] | null;
  /** Optional STT language hint; read by the service from state (never forwarded to the portal). */
  transcription_language?: string | null;
}

export interface SpeechToFormWithTranscriptionResolveRequestSdk extends ResolveRequestSdkBase {
  workflow: SpeechToFormWithTranscriptionWorkflowRequestSdk;
  feature: SpeechToFormWithTranscriptionFeatureRequestSdk;
  state: SpeechToFormWithTranscriptionStateRequestSdk;
}

export interface SpeechToFormWithTranscriptionGetRequestSdk extends GetRequestSdkBase {
  state?: SpeechToFormWithTranscriptionStateRequestSdk;
}

// --- Answer (be → fe): the `data` object -----------------------------------

export interface SpeechToFormWithTranscriptionConnectionResponseSdk extends ConnectionResponseSdkBase {
  audio_ws_url: string;
  /** Form-data WebSocket URL (streamed field updates). */
  form_data_ws_url: string;
  /** Transcription WebSocket URL (accumulated transcript text). */
  transcription_ws_url: string;
  audio_sample_rate: number;
  audio_frame_duration_ms: number;
}

export interface SpeechToFormWithTranscriptionResolveResponseSdk extends ResolveResponseSdkBase {
  connection: SpeechToFormWithTranscriptionConnectionResponseSdk;
}
