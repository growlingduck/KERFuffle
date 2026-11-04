import { useEffect } from 'react';
import { requestPrintOnOpen } from '../cutlist/printRequest';
import { useShortcut, useShortcutScope } from '../keyboard/shortcuts';
import { isTypingTarget } from '../keyboard/shortcuts';
import { jobSession } from '../data/storage';
import { navigate } from '../routes';
import { useStore } from '../state/createStore';
import { useJob } from '../state/jobs';
import type { FieldKey } from '../workspace/calc';
import { canRedo, canUndo, redoWithToast, undoWithToast } from '../workspace/history';
import { requestFocus, selectCabinet, selectedCabinetId, takeStartTyping, useSelectedCabinetId } from '../workspace/ui';
import { MissingJob } from './MissingJob';
import styles from './Screen.module.css';
import { addCabinet, CabinetList, duplicateCabinet, removeCabinet, selectedCabinet } from './workspace/CabinetList';
import { DrawingPanel } from './workspace/DrawingPanel';
import { Editor } from './workspace/Editor';
import { useCabinet, useEvaluation, useRules } from './workspace/hooks';
import { PartsPanel } from './workspace/PartsPanel';
import ws from './workspace/Workspace.module.css';

/** A field with typing that hasn't been committed: Ctrl+Z belongs to it (§9). */
function fieldIsDirty(): boolean {
  const el = document.activeElement;
  return el instanceof HTMLElement && isTypingTarget(el) && el.dataset.dirty === 'true';
}

/** The editor field that has focus, so Alt+↑/↓ can put focus back in the same column. */
function focusedField(): FieldKey | null {
  const el = document.activeElement;
  const holder = el instanceof HTMLElement ? el.closest<HTMLElement>('[data-field]') : null;
  return (holder?.dataset.field as FieldKey | undefined) ?? null;
}

function listHasFocus(): boolean {
  const el = document.activeElement;
  return el instanceof HTMLElement && !isTypingTarget(el) && el.closest('[data-cabinet-list]') !== null;
}

function useWorkspaceShortcuts(jobId: string) {
  const cabinets = () => jobSession.getJob()?.cabinets ?? [];

  const step = (delta: 1 | -1) => {
    const list = cabinets();
    const index = list.findIndex((c) => c.id === selectedCabinetId());
    const next = list[index + delta];
    if (!next) return;
    const field = focusedField();
    // Blur first so a half-typed size commits on the cabinet it was typed for.
    if (field && document.activeElement instanceof HTMLElement) document.activeElement.blur();
    selectCabinet(next.id);
    if (field) requestFocus(field);
  };

  // Undo in a field: blur it first, so it shows the restored value.
  const blurField = () => {
    const el = document.activeElement;
    if (el instanceof HTMLElement && isTypingTarget(el)) el.blur();
  };

  useShortcut({
    id: 'ws.undo',
    keys: ['Ctrl+Z'],
    scope: 'workspace',
    label: 'Undo',
    allowWhileTyping: true,
    enabled: () => canUndo() && !fieldIsDirty(),
    run: () => {
      blurField();
      undoWithToast();
    },
  });
  useShortcut({
    id: 'ws.redo',
    keys: ['Ctrl+Shift+Z', 'Ctrl+Y'],
    scope: 'workspace',
    label: 'Redo',
    allowWhileTyping: true,
    enabled: () => canRedo() && !fieldIsDirty(),
    run: () => {
      blurField();
      redoWithToast();
    },
  });
  useShortcut({
    id: 'ws.add',
    keys: ['Ctrl+N'],
    scope: 'workspace',
    label: 'Add cabinet',
    run: () => addCabinet(cabinets(), selectedCabinet(cabinets())?.type ?? 'base'),
  });
  useShortcut({
    id: 'ws.duplicate',
    keys: ['Ctrl+D'],
    scope: 'workspace',
    label: 'Duplicate selected cabinet',
    enabled: () => selectedCabinetId() !== null,
    run: () => {
      const id = selectedCabinetId();
      if (id) duplicateCabinet(id);
    },
  });
  useShortcut({
    id: 'ws.remove',
    keys: ['Delete'],
    scope: 'workspace',
    label: 'Remove selected cabinet (in the list)',
    enabled: () => listHasFocus() && cabinets().length > 1,
    run: () => {
      const cabinet = selectedCabinet(cabinets());
      if (cabinet) removeCabinet(cabinet.id, cabinet.label);
    },
  });
  useShortcut({ id: 'ws.list', keys: ['ArrowUp', 'ArrowDown'], display: [['↑', '↓']], scope: 'workspace', label: 'Previous / next cabinet (in the list)' });
  useShortcut({
    id: 'ws.prev',
    keys: ['Alt+ArrowUp'],
    scope: 'workspace',
    label: 'Previous cabinet, same field',
    allowWhileTyping: true,
    run: () => step(-1),
  });
  useShortcut({
    id: 'ws.next',
    keys: ['Alt+ArrowDown'],
    scope: 'workspace',
    label: 'Next cabinet, same field',
    allowWhileTyping: true,
    run: () => step(1),
  });
  useShortcut({
    id: 'job.cutlist',
    keys: ['Ctrl+L'],
    scope: 'job',
    label: 'Open the cut list',
    run: () => navigate({ name: 'cutlist', jobId }),
  });
  useShortcut({
    id: 'job.print',
    keys: ['Ctrl+P'],
    scope: 'job',
    label: 'Print the cut list',
    run: () => {
      requestPrintOnOpen();
      navigate({ name: 'cutlist', jobId });
    },
  });
}

function Panels({ jobId }: { jobId: string }) {
  const id = useSelectedCabinetId();
  const cabinet = useCabinet(id);
  const rules = useRules();
  const evaluation = useEvaluation(cabinet, rules);

  // A job just made from New job opens on its first cabinet, Width selected, so typing replaces it.
  useEffect(() => {
    if (!rules || !takeStartTyping(jobId)) return;
    const first = jobSession.getJob()?.cabinets[0];
    if (!first) return;
    selectCabinet(first.id);
    requestFocus('width');
  }, [jobId, rules]);

  if (!rules) return null;
  return (
    <div className={styles.row}>
      <CabinetList />
      <Editor />
      <div className={`${styles.column} ${ws.drawColumn}`}>
        <DrawingPanel cabinet={cabinet} evaluation={evaluation} rules={rules} />
        <PartsPanel cabinet={cabinet} evaluation={evaluation} rules={rules} jobId={jobId} />
      </div>
    </div>
  );
}

/** Job workspace (interaction-design §5): cabinets, editor, drawing and parts, tied together by tracing. */
export function WorkspaceScreen({ jobId }: { jobId: string }) {
  useShortcutScope('job');
  useShortcutScope('workspace');
  useShortcutScope('fields');
  useWorkspaceShortcuts(jobId);
  const job = useJob(jobId);
  const status = useStore(jobSession.store, (s) => (s.jobId === jobId ? s.status : 'loading'));
  const loadError = useStore(jobSession.store, (s) => (s.jobId === jobId ? s.loadError : null));
  if (!job || status === 'missing') return <MissingJob jobId={jobId} />;

  return (
    <div className={styles.page}>
      <h1 className="visually-hidden">Workspace: {job.name}</h1>
      {status === 'ready' ? (
        <Panels jobId={jobId} />
      ) : (
        <p className={ws.loading} role="status">
          {status === 'failed' ? (loadError ?? 'This job couldn’t be opened.') : 'Opening the job…'}
        </p>
      )}
    </div>
  );
}
