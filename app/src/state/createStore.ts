import { useSyncExternalStore } from 'react';

/**
 * A minimal reducer store. Domain state lives here, outside components, so later
 * prompts can wrap `dispatch` (persistence in 03, undo history in 05) without
 * touching the screens.
 */
export interface Store<S, A> {
  getState: () => S;
  dispatch: (action: A) => void;
  subscribe: (listener: () => void) => () => void;
}

export type Reducer<S, A> = (state: S, action: A) => S;
export type Middleware<S, A> = (store: Store<S, A>) => (next: (action: A) => void) => (action: A) => void;

export function createStore<S, A>(reducer: Reducer<S, A>, initial: S, middleware: Middleware<S, A>[] = []): Store<S, A> {
  let state = initial;
  const listeners = new Set<() => void>();

  const store: Store<S, A> = {
    getState: () => state,
    dispatch: (action) => {
      const next = reducer(state, action);
      if (Object.is(next, state)) return;
      state = next;
      for (const listener of [...listeners]) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };

  // Compose middleware right to left so the first one listed sees the action first.
  let dispatch = store.dispatch;
  for (const mw of [...middleware].reverse()) dispatch = mw(store)(dispatch);
  store.dispatch = dispatch;
  return store;
}

/** Subscribe a component to a slice of a store. The selector must return a stable value. */
export function useStore<S, A, T>(store: Store<S, A>, selector: (state: S) => T): T {
  return useSyncExternalStore(
    store.subscribe,
    () => selector(store.getState()),
    () => selector(store.getState()),
  );
}
