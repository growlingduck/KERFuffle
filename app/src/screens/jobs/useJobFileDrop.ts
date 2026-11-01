import { isTauri } from '@tauri-apps/api/core';
import { useEffect, useRef, useState } from 'react';
import { toStorageError } from '../../data/errors';
import { isJobFileName, readJobFileAt } from '../../platform/files';
import type { PickedFile } from '../../platform/files';
import { showToast } from '../../state/toast';

const ONLY_JOB_FILES = 'Only KERFuffle job files (.kerfjob) can be imported. Drop one file at a time.';

/**
 * Dropping a .kerfjob anywhere on the Jobs screen imports it. In the desktop
 * app the window gets the drop (with file paths) rather than the page, so
 * Tauri's drag-drop event is used there; a browser uses the DOM events.
 * Returns true while files are dragged over the window, for the drop target.
 */
export function useJobFileDrop(onFile: (file: PickedFile) => void, enabled: boolean): boolean {
  const [over, setOver] = useState(false);
  const onFileRef = useRef(onFile);
  useEffect(() => {
    onFileRef.current = onFile;
  });

  useEffect(() => {
    if (!enabled) return;
    const accept = (name: string, read: () => Promise<PickedFile>) => {
      if (!isJobFileName(name)) {
        showToast(ONLY_JOB_FILES);
        return;
      }
      read().then(
        (file) => onFileRef.current(file),
        (error: unknown) => showToast(toStorageError(error).message),
      );
    };

    if (isTauri()) {
      let unlisten: (() => void) | null = null;
      let live = true;
      void import('@tauri-apps/api/webview').then(({ getCurrentWebview }) =>
        getCurrentWebview()
          .onDragDropEvent(({ payload }) => {
            if (payload.type === 'enter' || payload.type === 'over') setOver(true);
            else if (payload.type === 'leave') setOver(false);
            else {
              setOver(false);
              const [path, ...more] = payload.paths;
              if (!path || more.length > 0) showToast(ONLY_JOB_FILES);
              else accept(path, () => readJobFileAt(path));
            }
          })
          .then((stop) => {
            if (live) unlisten = stop;
            else stop();
          }),
      );
      return () => {
        live = false;
        unlisten?.();
        setOver(false);
      };
    }

    let depth = 0;
    const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes('Files') ?? false;
    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth += 1;
      setOver(true);
    };
    const onOver = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setOver(false);
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setOver(false);
      const files = [...(e.dataTransfer?.files ?? [])];
      const [file] = files;
      if (!file || files.length > 1) showToast(ONLY_JOB_FILES);
      else accept(file.name, async () => ({ name: file.name, text: await file.text() }));
    };
    document.addEventListener('dragenter', onEnter);
    document.addEventListener('dragover', onOver);
    document.addEventListener('dragleave', onLeave);
    document.addEventListener('drop', onDrop);
    return () => {
      document.removeEventListener('dragenter', onEnter);
      document.removeEventListener('dragover', onOver);
      document.removeEventListener('dragleave', onLeave);
      document.removeEventListener('drop', onDrop);
      setOver(false);
    };
  }, [enabled]);

  return over && enabled;
}
