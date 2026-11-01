import type { JobSession } from './jobSession';

/** The part of Tauri's window API the guard needs; tests pass a fake. */
export interface ClosableWindow {
  onCloseRequested(handler: () => Promise<void>): Promise<() => void>;
}

/**
 * Before the window closes, wait for pending saves. Tauri awaits the handler and
 * then destroys the window. A write that hangs can't keep the window open
 * forever: after `timeoutMs` it closes anyway, and the recovery journal (written
 * before every save) restores the edit at the next start.
 */
export function installCloseGuard(win: ClosableWindow, session: JobSession, timeoutMs = 5000): Promise<() => void> {
  return win.onCloseRequested(async () => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, timeoutMs);
    });
    await Promise.race([session.flush(), timeout]);
    clearTimeout(timer);
  });
}
