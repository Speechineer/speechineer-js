/**
 * A minimal observable store: one immutable value, `getState` / `setState` /
 * `subscribe`. Framework wrappers subscribe to it (React via `useSyncExternalStore`,
 * plain JavaScript directly). `setState` with an updater that returns the same
 * reference notifies nobody, so `getState` is a stable snapshot while nothing changed.
 *
 * @internal
 */

import { safely } from './safely.js';

export type StoreListener<T> = (state: T) => void;

export interface Store<T> {
  getState: () => T;
  /** Replace the value (or derive it from the current one). Same reference → no notification. */
  setState: (next: T | ((current: T) => T)) => void;
  /** Register a listener; returns the unsubscribe function. */
  subscribe: (listener: StoreListener<T>) => () => void;
}

export function createStore<T>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<StoreListener<T>>();

  const getState = (): T => state;

  const setState = (next: T | ((current: T) => T)): void => {
    const resolved = typeof next === 'function' ? (next as (current: T) => T)(state) : next;
    if (Object.is(resolved, state)) return;
    state = resolved;
    // Guarded per listener: one that throws must not stop the ones registered after it. A
    // framework binding and an app's own `subscribe()` coexist routinely, so an unguarded loop
    // was silent data loss for whichever happened to be second.
    for (const listener of Array.from(listeners)) safely(() => listener(state));
  };

  const subscribe = (listener: StoreListener<T>): (() => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  return { getState, setState, subscribe };
}
