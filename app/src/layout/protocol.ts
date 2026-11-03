import { layoutInput, sensitivity } from '@kerfuffle/engine';
import type { JobLayout, LayoutInput, Sensitivity } from '@kerfuffle/engine';

/**
 * Messages between the app and the layout worker (layout.worker.ts). One
 * request per job; the worker answers with the best layout so far as the
 * search improves it, the final layout, then the sensitivity notes.
 */

export interface LayoutRequest {
  /** Echoed on every answer, so a stale answer can be told apart. */
  id: number;
  input: LayoutInput;
  /** False: the layout only, no sensitivity notes (a comparison with another mode). Default true. */
  notes?: boolean;
}

export type LayoutAnswer =
  | { id: number; type: 'progress'; layout: JobLayout }
  | { id: number; type: 'layout'; layout: JobLayout }
  | { id: number; type: 'sensitivity'; notes: Sensitivity }
  | { id: number; type: 'error'; message: string };

/** The worker's whole job, in a form a test can run without a worker. */
export function handleRequest(request: LayoutRequest, post: (answer: LayoutAnswer) => void): void {
  const { id, input } = request;
  try {
    const layout = layoutInput(input, (p) => post({ id, type: 'progress', layout: p.layout }));
    post({ id, type: 'layout', layout });
    if (request.notes !== false) post({ id, type: 'sensitivity', notes: sensitivity(input, layout) });
  } catch (error) {
    post({ id, type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
}
