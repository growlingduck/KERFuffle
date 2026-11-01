import { createStore, useStore } from './createStore';

export interface ToastAction {
  label: string;
  run: () => void;
}

export interface ToastMessage {
  /** Increments with every toast so a replacement restarts its timer and animation. */
  id: number;
  message: string;
  action?: ToastAction;
}

type ToastStateAction = { type: 'toast/show'; toast: ToastMessage } | { type: 'toast/dismiss'; id: number };

/** At most one toast at a time; a new one replaces the old (interaction-design §4). */
export const toastStore = createStore<ToastMessage | null, ToastStateAction>((state, action) => {
  switch (action.type) {
    case 'toast/show':
      return action.toast;
    case 'toast/dismiss':
      return state?.id === action.id ? null : state;
  }
}, null);

let nextId = 1;

export function showToast(message: string, action?: ToastAction): number {
  const id = nextId++;
  toastStore.dispatch({ type: 'toast/show', toast: action ? { id, message, action } : { id, message } });
  return id;
}

export function dismissToast(id: number): void {
  toastStore.dispatch({ type: 'toast/dismiss', id });
}

export function useToast(): ToastMessage | null {
  return useStore(toastStore, (s) => s);
}
