/**
 * Ctrl+P from the workspace opens the cut list and prints it. The workspace
 * leaves a request here; the cut list takes it once its sheets are laid out.
 */
let pending = false;

export function requestPrintOnOpen(): void {
  pending = true;
}

/** True once per request. */
export function takePrintRequest(): boolean {
  const was = pending;
  pending = false;
  return was;
}
