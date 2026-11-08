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

/**
 * Match the native title bar to the app theme; null follows the OS. Nothing to
 * do in a browser, where the page's color-scheme covers it.
 */
export async function setWindowTheme(theme: 'light' | 'dark' | null): Promise<void> {
  if (!isTauri()) return;
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  await getCurrentWindow().setTheme(theme);
}

/**
 * The desktop window starts hidden (tauri.conf.json) so WebView2's white
 * never shows before the page: this shows it once the themed paper has
 * painted. lib.rs shows it anyway after a few seconds if this never runs.
 */
export function showWindowAfterPaint(): void {
  if (!isTauri()) return;
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      void import('@tauri-apps/api/window')
        .then(({ getCurrentWindow }) => getCurrentWindow().show())
        .catch((error: unknown) => console.error('Could not show the window', error));
    }),
  );
}

export function useWindowTitle(title: string): void {
  useEffect(() => {
    setWindowTitle(title).catch((error: unknown) => console.error('Could not set the window title', error));
  }, [title]);
}
