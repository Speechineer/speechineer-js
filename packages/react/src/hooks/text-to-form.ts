/**
 * `useTextToForm` — the React binding of the text-to-form session.
 */

import type { SessionState, SpeechineerClient, TextToFormOptions } from '@speechineer/js';
import { useCallback, useMemo, useState } from 'react';
import { useClient } from '../context.js';
import { useSession, useSessionState } from './base.js';

/**
 * The options of `useTextToForm`: the session options every framework shares, plus
 * an optional `client` to use instead of the provider's.
 *
 * @group Capability: Text to form
 */
export interface UseTextToFormOptions extends TextToFormOptions {
  /** Use this client instead of the nearest `SpeechineerProvider`'s. */
  client?: SpeechineerClient;
}

/**
 * What `useTextToForm` returns: the session state spread out for rendering, the
 * controls, `isExtracting` while a call is in flight, and the full `state` object.
 *
 * @group Capability: Text to form
 */
export interface UseTextToFormResult extends SessionState {
  /** Extract field values from text — see `TextToFormSession.extract`. */
  extract: (text: string) => Promise<Readonly<Record<string, unknown>>>;
  /** Open the session ahead of time — see `TextToFormSession.start`. */
  start: () => Promise<void>;
  /** Finish the session — see `TextToFormSession.end`. */
  end: () => Promise<void>;
  /** An `extract` call is in flight. */
  isExtracting: boolean;
  /** The whole state object (the same values as the spread fields). */
  state: SessionState;
}

/**
 * Extract field values from text the user typed or pasted. `extract` opens the
 * session on first use and merges every result into `values`. `form.source` is fixed
 * for the component's lifetime; the rest of `form` is read each time a session
 * starts, so a change applies to the next session after `end()`.
 *
 * @example
 * ```tsx
 * const { extract, values, isExtracting } = useTextToForm({
 *   form: { source: "workspace", key: "patient-intake", version: "1", language: "en" },
 * });
 * await extract("Patient Jane Doe, born 1990-03-28.");
 * ```
 *
 * @group Capability: Text to form
 */
export function useTextToForm(options: UseTextToFormOptions): UseTextToFormResult {
  const client = useClient(options.client);
  const session = useSession((o: UseTextToFormOptions) => client.textToForm(o), options);
  const state = useSessionState(session);
  const [inFlight, setInFlight] = useState(0);
  const extract = useCallback(
    async (text: string) => {
      setInFlight((n) => n + 1);
      try {
        return await session.extract(text);
      } finally {
        setInFlight((n) => n - 1);
      }
    },
    [session],
  );
  return useMemo(
    () => ({ ...state, state, extract, start: session.start, end: session.end, isExtracting: inFlight > 0 }),
    [session, state, extract, inFlight],
  );
}
