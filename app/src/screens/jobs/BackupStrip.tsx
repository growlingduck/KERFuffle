import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { Button } from '../../components/Button';
import { Sheet } from '../../components/Sheet';
import { backUpNow, jobsPhrase, refreshBackups, restoreBackup, useBackups } from '../../data/backups';
import { toStorageError } from '../../data/errors';
import type { BackupInfo } from '../../data/types';
import { cx, focusableIn, useDelayedFlag, useDismiss } from '../../lib/interaction';
import { calendarDaysBetween, formatEdited } from '../../lib/relativeDate';
import { showToast } from '../../state/toast';
import styles from './Jobs.module.css';

/** "today, 8:02 AM", "yesterday, 4:12 PM", "Oct 29, 8:01 AM". */
export function backupWhen(createdAt: string, now: Date = new Date()): string {
  const date = new Date(createdAt);
  const days = calendarDaysBetween(date, now);
  if (days === 0 || days === 1) return formatEdited(createdAt, now).replace(/^\p{Lu}/u, (c) => c.toLowerCase());
  const sameYear = date.getFullYear() === now.getFullYear();
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

/**
 * Backup strip under the register (interaction-design §6): when the last backup
 * was taken and how many are kept, Back up now (an inline bar if it takes over
 * 300 ms, then a toast) and Restore backup… (a popover: pick a backup, confirm,
 * toast). Restore and Import over an existing job are the only confirmations
 * in the app, because they replace data in bulk.
 */
export function BackupStrip() {
  const { overview, error } = useBackups();
  const [running, setRunning] = useState(false);
  const showBar = useDelayedFlag(running);
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    void refreshBackups();
  }, []);

  const newest = overview?.backups[0];
  const count = overview?.backups.length ?? 0;
  let status: string;
  if (error) status = `Backups couldn’t be read. ${error}`;
  else if (!overview) status = 'Checking backups…';
  else if (!newest) status = 'No backups yet. KERFuffle backs up your jobs every day it’s opened.';
  else status = `Last backup ${backupWhen(newest.createdAt)} · ${count === 1 ? '1 backup' : `${count} backups`} kept`;

  const runBackup = async () => {
    setRunning(true);
    try {
      const info = await backUpNow();
      showToast(`Backed up ${jobsPhrase(info.jobCount)}.`);
    } catch (e) {
      showToast(toStorageError(e).message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <Sheet padding="none" className={styles.backup} aria-label="Backups">
      {showBar ? (
        <div className={styles.backupStatus} role="status">
          <span>Backing up…</span>
          <span className={styles.backupBar} aria-hidden="true">
            <span />
          </span>
        </div>
      ) : (
        <p className={styles.backupStatus} role="status">
          {newest && !error && <span className={styles.backupCheck} aria-hidden="true">✓ </span>}
          {status}
        </p>
      )}
      <div className={styles.backupActions}>
        <Button busy={running} onClick={() => void runBackup()}>
          Back up now
        </Button>
        <div className={styles.restoreAnchor}>
          <Button ref={triggerRef} aria-haspopup="dialog" aria-expanded={open} disabled={running} onClick={() => setOpen((o) => !o)}>
            Restore backup…
          </Button>
          {open && <RestorePopover backups={overview?.backups ?? []} triggerRef={triggerRef} onClose={() => setOpen(false)} />}
        </div>
      </div>
    </Sheet>
  );
}

function RestorePopover({
  backups,
  triggerRef,
  onClose,
}: {
  backups: readonly BackupInfo[];
  triggerRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [pick, setPick] = useState<BackupInfo | null>(null);
  const [restoring, setRestoring] = useState(false);

  const close = (refocus = true) => {
    onClose();
    if (refocus) triggerRef.current?.focus();
  };
  useDismiss(!restoring, [panelRef, triggerRef], (reason) => close(reason === 'escape'));

  // Focus the first choice when the list or the confirm step appears.
  useEffect(() => {
    const panel = panelRef.current;
    if (panel) (panel.querySelector<HTMLElement>('[data-autofocus]') ?? focusableIn(panel)[0] ?? panel).focus();
  }, [pick]);

  const restore = async (backup: BackupInfo) => {
    setRestoring(true);
    try {
      await restoreBackup(backup.fileName);
      showToast(`Restored the backup from ${backupWhen(backup.createdAt)}. Your jobs from before were backed up first.`);
      close();
    } catch (e) {
      showToast(toStorageError(e).message);
      setRestoring(false);
    }
  };

  return (
    <div ref={panelRef} className={styles.restorePopover} role="dialog" aria-label="Restore a backup" tabIndex={-1}>
      {pick ? (
        <div className={styles.restoreConfirm}>
          <div className={styles.restoreTitle}>Restore the backup from {backupWhen(pick.createdAt)}?</div>
          <p>
            Your jobs go back to how they were then ({jobsPhrase(pick.jobCount)}). KERFuffle backs up the current jobs first, so you can undo this by
            restoring that backup.
          </p>
          <div className={styles.restoreButtons}>
            <Button disabled={restoring} onClick={() => setPick(null)}>
              Back
            </Button>
            <Button variant="primary" data-autofocus busy={restoring} onClick={() => void restore(pick)}>
              Restore
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className={cx('cap', styles.restoreHead)}>Choose a backup</div>
          {backups.length === 0 ? (
            <p className={styles.restoreEmpty}>No backups yet. Use Back up now to make one.</p>
          ) : (
            <ul className={styles.restoreList}>
              {backups.map((b) => (
                <li key={b.fileName}>
                  <button type="button" className={styles.restoreItem} onClick={() => setPick(b)}>
                    <span>{backupWhen(b.createdAt)}</span>
                    <span className="mono">{jobsPhrase(b.jobCount)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
