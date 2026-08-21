/**
 * text-to-form sessions: the universal session only (no microphone, no streamed
 * connection); `extract` is a request/reply action that opens the session on first use
 * and merges its result into `values`.
 */

import {
  createTextToForm,
  deleteTextToForm,
  extractTextToForm,
  getTextToForm,
} from '../../api/workflows/text-to-form.js';
import type { SpeechineerClient } from '../../client.js';
import { fromFormDataResult } from '../../convert/inbound/workflows/text-to-form.js';
import {
  toTextToFormGetRequestSdk,
  toTextToFormResolveRequestSdk,
} from '../../convert/outbound/workflows/text-to-form.js';
import { isInlineForm } from '../../features/forms/identity.js';
import type {
  TextToFormOptions,
  TextToFormSession,
  TextToFormWorkflowSessionParams,
} from '../../types/public/workflows/text-to-form.js';
import type { TextToFormResolveResponseSdk } from '../../types/sdk/workflows/text-to-form.js';
import { createWorkflowSession } from '../base.js';
import {
  coreCallbackOptions,
  forwardFormValueCallbacks,
  forwardSessionCallbacks,
  type Holder,
  requireSessionId,
} from './_shared.js';

// --- Orchestration (internal) ---

/** @internal */
export function createTextToFormWorkflowSession(
  params: TextToFormWorkflowSessionParams,
): Omit<TextToFormSession, 'setOptions'> {
  const core = createWorkflowSession<TextToFormResolveResponseSdk>({
    connections: [],
    initialValues: params.initialValues,
    createWorkflowFn: (resumeSessionId) => params.createWorkflow(resumeSessionId),
    getWorkflowFn: (id) => params.getWorkflow(id),
    deleteWorkflowFn: (answer) => params.deleteWorkflow(answer),
    ...coreCallbackOptions<TextToFormResolveResponseSdk>(params),
  });

  const extract = async (text: string): Promise<Readonly<Record<string, unknown>>> => {
    if (!core.getState().sessionId) {
      await core.start();
      const { status, error } = core.getState();
      if (status === 'failed' && error) throw error;
    }
    const id = requireSessionId(core.getState().sessionId);
    try {
      const values = await params.extractText(id, text);
      core.setFieldValues(values);
      for (const [fieldId, value] of Object.entries(values)) params.onFieldValue?.(fieldId, value);
      return values;
    } catch (e) {
      throw core.fail(e, 'action');
    }
  };

  return {
    start: core.start,
    end: core.end,
    dispose: core.dispose,
    getState: core.getState,
    subscribe: core.subscribe,
    extract,
  };
}

// --- Public factory (reached through the client) ---

/**
 * Build a text-to-form session for a client: the options holder, the request runners
 * (auth resolved through the client on every create / resume), and the orchestration.
 *
 * @internal
 */
export function createTextToFormSession(client: SpeechineerClient, options: TextToFormOptions): TextToFormSession {
  const h: Holder<TextToFormOptions> = { current: options };
  const inline = isInlineForm(options.form);

  const session = createTextToFormWorkflowSession({
    initialValues: options.initialValues,
    createWorkflow: async (resumeSessionId) => {
      const auth = await client.resolveAuth(h.current.account);
      return createTextToForm(client.baseUrl, toTextToFormResolveRequestSdk(h.current, auth, resumeSessionId), inline);
    },
    getWorkflow: (id) => getTextToForm(client.baseUrl, toTextToFormGetRequestSdk(h.current, id)),
    deleteWorkflow: (answer) => deleteTextToForm(client.baseUrl, { session_id: answer.session_id }),
    extractText: async (sessionId, text) =>
      fromFormDataResult(await extractTextToForm(client.baseUrl, { session_id: sessionId, text })),
    ...forwardSessionCallbacks(h),
    ...forwardFormValueCallbacks(h),
  });

  return {
    ...session,
    setOptions: (next) => {
      h.current = next;
    },
  };
}
