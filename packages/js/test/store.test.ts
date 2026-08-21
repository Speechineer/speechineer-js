import { describe, expect, it, vi } from 'vitest';
import { createStore } from '../src/session/store.js';

describe('createStore', () => {
  it('notifies subscribers with the new value and stops after unsubscribe', () => {
    const store = createStore({ n: 0 });
    const seen: number[] = [];
    const off = store.subscribe((s) => seen.push(s.n));
    store.setState({ n: 1 });
    store.setState((s) => ({ n: s.n + 1 }));
    off();
    store.setState({ n: 3 });
    expect(seen).toEqual([1, 2]);
    expect(store.getState()).toEqual({ n: 3 });
  });

  it('does not notify when the updater returns the same reference', () => {
    const store = createStore({ n: 0 });
    const listener = vi.fn();
    store.subscribe(listener);
    store.setState((s) => s);
    expect(listener).not.toHaveBeenCalled();
    expect(store.getState()).toBe(store.getState());
  });
});
