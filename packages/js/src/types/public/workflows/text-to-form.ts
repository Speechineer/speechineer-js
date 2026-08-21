/**
 * Dev-facing camelCase types for the text-to-form capability: the options every binding
 * takes (`client.textToForm()` / `useTextToForm()` / `injectTextToForm()`), the session they
 * return, and the internal orchestration params.
 *
 * A form-data-extraction-only capability — no audio, no streamed connection. The session
 * opens only the main connection; extraction is a request/reply action (`extract`).
 */

import type { FormDefinition } from '../../../features/forms/identity.js';
import type { SessionState } from '../../../session/state.js';
import type { TextToFormResolveResponseSdk } from '../../sdk/workflows/text-to-form.js';
import type { Account } from '../common/auth.js';
import type { FormValueCallbacks, SessionCallbacks } from '../common/callbacks.js';

/**
 * What you pass to extract field values from text. The same options work in every
 * framework; only the function that takes them differs.
 *
 * @group Capability: Text to form
 */
export interface TextToFormOptions extends SessionCallbacks, FormValueCallbacks {
  /** Which form to fill: the one configured in Speechineer, or one defined right here. */
  form: FormDefinition;
  /**
   * Values you already captured, keyed by field id. They appear in `values`
   * immediately and Speechineer treats them as the baseline for the next extraction.
   */
  initialValues?: Record<string, unknown>;
  /**
   * The end user this session is for, when it differs from the client's default
   * `account`. Ignored when the client authenticates with a signed token.
   */
  account?: Account;
}

/**
 * A text-to-form session: call `extract` as often as you like; every result is
 * merged into `values` (and reaches `onFieldValue`).
 *
 * @group Capability: Text to form
 */
export interface TextToFormSession {
  /**
   * Open the session ahead of time. Optional — `extract` opens it on first use; call
   * `start()` yourself to pay the connection cost before the user's first text.
   */
  start: () => Promise<void>;
  /**
   * Extract field values from the given text. Resolves with the values recognized in
   * this call, keyed by field id; the same values are merged into `values`.
   */
  extract: (text: string) => Promise<Readonly<Record<string, unknown>>>;
  /**
   * Finish the session and release everything. `values` return to `initialValues`.
   */
  end: () => Promise<void>;
  /**
   * Release the connection without finishing the session (leaving the page). The
   * React and Angular bindings call this for you when the component goes away.
   */
  dispose: () => void;
  /** The current session state. */
  getState: () => SessionState;
  /** Be told about every state change; returns the unsubscribe function. */
  subscribe: (listener: (state: SessionState) => void) => () => void;
  /**
   * Swap the options the session reads its callbacks from — the framework
   * bindings use it to keep the latest closures. `form.source` stays with the
   * session; the rest of `form` is read when the next session starts.
   */
  setOptions: (next: TextToFormOptions) => void;
}

/**
 * Params of the internal orchestration. The public session factory builds these and
 * delegates to it. Only the universal session callbacks + the value callback apply.
 *
 * @internal
 */
export interface TextToFormWorkflowSessionParams extends SessionCallbacks, FormValueCallbacks {
  initialValues?: Record<string, unknown>;
  createWorkflow: (resumeSessionId?: string) => Promise<TextToFormResolveResponseSdk>;
  getWorkflow: (sessionId: string) => Promise<TextToFormResolveResponseSdk>;
  deleteWorkflow: (answer: TextToFormResolveResponseSdk) => Promise<void>;
  /** Run the extract action against the live session. */
  extractText: (sessionId: string, text: string) => Promise<Readonly<Record<string, unknown>>>;
}
