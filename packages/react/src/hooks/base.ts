/**
 * The React binding of a framework-agnostic session: `useSession` creates a session
 * once per component, refreshes its options every render (so callbacks see the latest
 * closures), disposes it on unmount, and `useSessionState` subscribes to its state with
 * `useSyncExternalStore`.
 *
 * Every public hook is a thin wrapper: `useSession(create, options)` + a memoized result
 * object with the controls and the state.
 *
 * @internal
 */

import type { SessionState } from '@speechineer/js';
import { useEffect, useRef, useSyncExternalStore } from 'react';

interface Observable {
  getState: () => SessionState;
  subscribe: (listener: (state: SessionState) => void) => () => void;
}

interface SessionLike<O> extends Observable {
  dispose: () => void;
  setOptions: (next: O) => void;
}

/** Create the session on first render, keep its options fresh, dispose on unmount. @internal */
export function useSession<O, S extends SessionLike<O>>(create: (options: O) => S, options: O): S {
  const ref = useRef<S | null>(null);
  if (ref.current === null) ref.current = create(options);
  const session = ref.current;
  useEffect(() => {
    session.setOptions(options);
  });
  useEffect(() => () => session.dispose(), [session]);
  return session;
}

/** Subscribe a component to a session's state. @internal */
export function useSessionState(session: Observable): SessionState {
  return useSyncExternalStore(session.subscribe, session.getState, session.getState);
}
