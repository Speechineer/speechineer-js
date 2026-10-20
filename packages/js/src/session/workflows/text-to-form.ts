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
import { fromEvent } from '../../convert/inbound/common/event.js';
import { fromFormDataResult } from '../../convert/inbound/workflows/text-to-form.js';
import {
  toTextToFormGetRequestSdk,
  toTextToFormResolveRequestSdk,
} from '../../convert/outbound/workflows/text-to-form.js';
import { negotiateSdkLanguage, type SdkLanguage } from '../../errors/manifest.js';
import { isInlineForm } from '../../features/forms/identity.js';
import type {
  TextToFormOptions,
  TextToFormSession,
  TextToFormWorkflowSessionParams,
} from '../../types/public/workflows/text-to-form.js';
import type { TextToFormResolveResponseSdk } from '../../types/sdk/workflows/text-to-form.js';
import { createWorkflowSession } from '../base.js';
import { safely } from '../safely.js';
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
    language: params.language,
    createWorkflowFn: (resumeSessionId) => params.createWorkflow(resumeSessionId),
    getWorkflowFn: (id) => params.getWorkflow(id),
    deleteWorkflowFn: (answer) => params.deleteWorkflow(answer),
    ...coreCallbackOptions<TextToFormResolveResponseSdk>(params),
  });

  const extract = async (text: string): Promise<Readonly<Record<string, unknown>>> => {
    if (!core.getState().sessionId) {
      await core.start();
      const { status, errors } = core.getState();
      // `errors[0]` is the root cause — the informative one. The rest is the context it arrived
      // with, and it is all in `state.errors` for a caller who wants it.
      if (status === 'failed' && errors.length > 0) throw errors[0];
    }
    const id = requireSessionId(core.getState().sessionId);
    try {
      const values = await params.extractText(id, text);
      core.setFieldValues(values);
      // Guarded per field: one throwing handler must not stop the rest of the result from
      // being delivered, and `values` is returned to the caller regardless.
      for (const [fieldId, value] of Object.entries(values)) {
        safely(() => params.onFieldValue?.(fieldId, value));
      }
      return values;
    } catch (e) {
      throw core.fail(e);
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

  /** The language that **travels** — absent means "Speechineer, negotiate it". */
  const wireLanguage = (): SdkLanguage | undefined => h.current.uiLanguage ?? client.uiLanguage;

  /** The language the SDK renders its **own** messages in — always concrete. */
  const language = (): SdkLanguage => wireLanguage() ?? negotiateSdkLanguage();

  const current = (): TextToFormOptions => ({ ...h.current, uiLanguage: wireLanguage() });

  const session = createTextToFormWorkflowSession({
    initialValues: options.initialValues,
    language,
    // `wireLanguage()` for every REQUEST, not `language()` (FLY-503): the transport asks
    // Speechineer for this language with `Accept-Language`, so an unnamed one must stay unnamed
    // — a resolved guess would override the browser's own q-weighted list. The api layer falls
    // back for its own sentences at render time.
    createWorkflow: async (resumeSessionId) => {
      // `language()` so a credential failure speaks the SESSION's language, not the
      // client's — the per-session `uiLanguage` was ignored here before (FLY-503). Resolved,
      // because nothing but the SDK translates that one.
      const auth = await client.resolveAuth(h.current.account, language());
      return createTextToForm(
        client.baseUrl,
        toTextToFormResolveRequestSdk(current(), auth, resumeSessionId),
        inline,
        wireLanguage(),
      );
    },
    getWorkflow: (id) => getTextToForm(client.baseUrl, toTextToFormGetRequestSdk(current(), id), wireLanguage()),
    deleteWorkflow: (answer) => deleteTextToForm(client.baseUrl, { session_id: answer.session_id }, wireLanguage()),
    extractText: async (sessionId, text) => {
      const answer = await extractTextToForm(client.baseUrl, { session_id: sessionId, text }, wireLanguage());
      // An action is a request/reply the caller awaited, so a failure is a rejection here —
      // `errors[0]` is the root cause. The session's own `state.errors` keeps the whole list.
      if (!answer.ok) throw fromEvent(answer.errors[0]);
      return fromFormDataResult(answer.data);
    },
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
