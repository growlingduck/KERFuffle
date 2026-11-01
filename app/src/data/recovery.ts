import type { StorageClient } from './client';
import type { RecoveredJob } from './types';

/** "Recovered your last changes to Kitchen remodel." */
export function recoveryMessage(recovered: readonly RecoveredJob[]): string | null {
  const [first] = recovered;
  if (!first) return null;
  if (recovered.length === 1) return `Recovered your last changes to ${first.jobName}.`;
  const others = recovered.length - 1;
  return `Recovered your last changes to ${first.jobName} and ${others} other ${others === 1 ? 'job' : 'jobs'}.`;
}

/**
 * At startup, apply any edits journaled before an unexpected shutdown and tell
 * the user. The database applies each journal entry once and removes it in the
 * same transaction, so calling this again finds nothing.
 */
export async function recoverPendingEdits(client: StorageClient, notify: (message: string) => void): Promise<RecoveredJob[]> {
  const recovered = await client.recoverPendingEdits();
  const message = recoveryMessage(recovered);
  if (message) notify(message);
  return recovered;
}
