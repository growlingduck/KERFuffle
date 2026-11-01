import { useEffect } from 'react';
import { isTauri } from '@tauri-apps/api/core';

/**
 * Set the window title. In the Tauri window this is the native title bar; in a
 * browser (dev:web, tests) it is document.title. Size and position are
 * remembered natively by tauri-plugin-window-state.
 */
export async function setWindowTitle(title: string): Promise<void> {
  document.title = title;
  if (!isTauri()) return;
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  await getCurrentWindow().setTitle(title);
}

export function useWindowTitle(title: string): void {
  useEffect(() => {
    setWindowTitle(title).catch((error: unknown) => console.error('Could not set the window title', error));
  }, [title]);
}
