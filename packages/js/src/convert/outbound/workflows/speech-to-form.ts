/**
 * Outbound request assembly for speech_to_form: dev camelCase options + the resolved `auth`
 * string → the flat sdk `SpeechToFormResolveRequestSdk` (create; a `resumeSessionId` sets the
 * top-level resume target) and `SpeechToFormGetRequestSdk` (get re-seed).
 *
 * Builder names mirror the wire type they produce (`…ResolveRequestSdk` / `…GetRequestSdk`);
 * one builder serves both form origins — `options.form.source` carries the origin and the
 * scope helpers in `_form.ts` switch on it.
 */

import type { SpeechToFormOptions } from '../../../types/public/workflows/speech-to-form.js';
import type {
  SpeechToFormGetRequestSdk,
  SpeechToFormResolveRequestSdk,
} from '../../../types/sdk/workflows/speech-to-form.js';
import { toFeatureScope, toStateScope, toWorkflowScope } from './_form.js';

/** The create request: `auth` + optional resume target + the three flat scopes. */
export function toSpeechToFormResolveRequestSdk(
  options: SpeechToFormOptions,
  auth: string,
  resumeSessionId?: string,
): SpeechToFormResolveRequestSdk {
  return {
    auth,
    ...(resumeSessionId ? { session_id: resumeSessionId } : {}),
    workflow: toWorkflowScope('speech_to_form', options.form),
    feature: toFeatureScope(options.form, options.spokenLanguage),
    state: toStateScope(options.initialValues, options.spokenLanguage),
  };
}

/** Get re-seed (auth-less, live-only): the target id + the restorable `state`. */
export function toSpeechToFormGetRequestSdk(
  options: SpeechToFormOptions,
  sessionId: string,
): SpeechToFormGetRequestSdk {
  return {
    session_id: sessionId,
    state: toStateScope(options.initialValues, options.spokenLanguage),
  };
}
