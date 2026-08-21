/**
 * Outbound request assembly for text_to_form: dev camelCase options + the resolved `auth`
 * string → the flat sdk `TextToFormResolveRequestSdk` (create) and `TextToFormGetRequestSdk`
 * (get re-seed). No spoken language — nothing is recorded.
 */

import type { TextToFormOptions } from '../../../types/public/workflows/text-to-form.js';
import type {
  TextToFormGetRequestSdk,
  TextToFormResolveRequestSdk,
} from '../../../types/sdk/workflows/text-to-form.js';
import { toFeatureScope, toStateScope, toWorkflowScope } from './_form.js';

/** The create request: `auth` + optional resume target + the three flat scopes. */
export function toTextToFormResolveRequestSdk(
  options: TextToFormOptions,
  auth: string,
  resumeSessionId?: string,
): TextToFormResolveRequestSdk {
  return {
    auth,
    ...(resumeSessionId ? { session_id: resumeSessionId } : {}),
    workflow: toWorkflowScope('text_to_form', options.form),
    feature: toFeatureScope(options.form),
    state: toStateScope(options.initialValues),
  };
}

/** Get re-seed (auth-less, live-only): the target id + the restorable `state`. */
export function toTextToFormGetRequestSdk(options: TextToFormOptions, sessionId: string): TextToFormGetRequestSdk {
  return {
    session_id: sessionId,
    state: toStateScope(options.initialValues),
  };
}
