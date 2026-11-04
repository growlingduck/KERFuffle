import { createStore, useStore } from './createStore';

/**
 * Whether the shop has checked its construction defaults (prompt 14). Null
 * until shop settings are read, so nothing asks before it knows. Until it's
 * true, the Jobs screen asks the shop to check them, and the New job dialog
 * says its values are the built-in ones.
 */
export const defaultsCheckedStore = createStore<boolean | null, boolean | null>((_state, next) => next, null);

export function setDefaultsChecked(checked: boolean | null): void {
  if (checked !== defaultsCheckedStore.getState()) defaultsCheckedStore.dispatch(checked);
}

/** True once checked; false while not; null while unknown. */
export function useDefaultsChecked(): boolean | null {
  return useStore(defaultsCheckedStore, (s) => s);
}
