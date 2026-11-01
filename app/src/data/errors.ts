/** Error kinds sent by the Rust side (`DbError::kind` in app/src-tauri/src/db/error.rs). */
export type StorageErrorKind =
  | 'notFound'
  | 'invalid'
  | 'busy'
  | 'diskFull'
  | 'readOnly'
  | 'corrupt'
  | 'newerDatabase'
  | 'unavailable'
  | 'backup'
  | 'storage';

const KINDS: readonly string[] = [
  'notFound',
  'invalid',
  'busy',
  'diskFull',
  'readOnly',
  'corrupt',
  'newerDatabase',
  'unavailable',
  'backup',
  'storage',
];

/** A storage failure with a message written for the person using the app. */
export class StorageError extends Error {
  readonly kind: StorageErrorKind;
  /** Technical detail for logs; never shown as the main message. */
  readonly detail: string | undefined;

  constructor(kind: StorageErrorKind, message: string, detail?: string) {
    super(message);
    this.name = 'StorageError';
    this.kind = kind;
    this.detail = detail;
  }
}

/** Normalize anything a storage call rejects with into a StorageError. */
export function toStorageError(error: unknown): StorageError {
  if (error instanceof StorageError) return error;
  if (typeof error === 'object' && error !== null) {
    const { kind, message } = error as { kind?: unknown; message?: unknown };
    if (typeof kind === 'string' && KINDS.includes(kind) && typeof message === 'string') {
      return new StorageError(kind as StorageErrorKind, message);
    }
  }
  // Tauri reports arguments it couldn't decode (e.g. an unknown enum value) as a string.
  const detail = typeof error === 'string' ? error : error instanceof Error ? error.message : String(error);
  return new StorageError(
    'storage',
    'KERFuffle couldn’t save this change because the data was in an unexpected form. Try again; if it keeps happening, restart KERFuffle.',
    detail,
  );
}
