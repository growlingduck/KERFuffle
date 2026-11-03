import { ALGORITHM_VERSION, layoutKey } from '@kerfuffle/engine';
import type { JobLayout, LayoutInput, Sensitivity } from '@kerfuffle/engine';
import { handleRequest } from './protocol';
import type { LayoutAnswer, LayoutRequest } from './protocol';

/**
 * Runs sheet layouts in a Web Worker and keeps the results.
 *
 * - One layout runs at a time per runner. Asking for another (the inputs
 *   changed) cancels the one running: the optimizer is synchronous, so its
 *   worker is stopped and a fresh one started.
 * - Results are cached by `layoutKey`: a hash of the pieces, materials, saw
 *   profile, mode and seed, and ALGORITHM_VERSION. Asking again for the same
 *   input answers from the cache without starting a worker. The app's runners
 *   share one cache, so a mode laid out for comparison is there when it's
 *   chosen.
 */

/** The part of a Worker the runner uses, so tests can stand one in. */
export interface WorkerLike {
  postMessage(request: LayoutRequest): void;
  terminate(): void;
  onmessage: ((event: { data: LayoutAnswer }) => void) | null;
  onerror: ((event: { message?: string }) => void) | null;
}

export interface LayoutListener {
  /** The best layout so far (`final` false), then the finished one. */
  onLayout?: (layout: JobLayout, final: boolean) => void;
  onSensitivity?: (notes: Sensitivity) => void;
  onError?: (message: string) => void;
}

export interface RunOptions {
  /** False: the layout only, without the sensitivity notes. Default true. */
  notes?: boolean;
}

export interface LayoutRunner {
  /** Lay out `input`; returns a function that cancels it. */
  run(input: LayoutInput, listener: LayoutListener, options?: RunOptions): () => void;
  /** The cached result, if this exact input has been laid out. */
  cached(input: LayoutInput): CachedLayout | undefined;
  /** Stop everything (the screen closed). */
  dispose(): void;
}

export interface CachedLayout {
  layout: JobLayout;
  /** Null until the background sensitivity run has finished. */
  sensitivity: Sensitivity | null;
}

export type LayoutCache = Map<string, CachedLayout>;

export interface RunnerOptions {
  spawn: () => WorkerLike;
  /** Results kept, most recent first. */
  cacheSize?: number;
  /** A cache to share with other runners. Default: its own. */
  cache?: LayoutCache;
}

export function createLayoutRunner({ spawn, cacheSize = 24, cache = new Map() }: RunnerOptions): LayoutRunner {
  let worker: WorkerLike | null = null;
  let current: { id: number; key: string; listener: LayoutListener; notes: boolean } | null = null;
  let nextId = 1;

  const remember = (key: string, entry: CachedLayout) => {
    cache.delete(key);
    cache.set(key, entry);
    while (cache.size > cacheSize) cache.delete(cache.keys().next().value!);
  };

  const stop = () => {
    // A worker mid-layout can't be interrupted: stop it; the next run starts a fresh one.
    if (current && worker) {
      worker.terminate();
      worker = null;
    }
    current = null;
  };

  const ensureWorker = (): WorkerLike => {
    if (worker) return worker;
    const w = spawn();
    w.onmessage = ({ data }) => {
      if (!current || data.id !== current.id) return; // a cancelled run's last words
      const { key, listener, notes } = current;
      switch (data.type) {
        case 'progress':
          listener.onLayout?.(data.layout, false);
          break;
        case 'layout': {
          // Keep notes another runner already has for the same input.
          const had = cache.get(key);
          remember(key, { layout: data.layout, sensitivity: had?.sensitivity ?? null });
          if (!notes) current = null;
          listener.onLayout?.(data.layout, true);
          break;
        }
        case 'sensitivity': {
          const entry = cache.get(key);
          if (entry) remember(key, { ...entry, sensitivity: data.notes });
          current = null;
          listener.onSensitivity?.(data.notes);
          break;
        }
        case 'error':
          current = null;
          listener.onError?.(data.message);
          break;
      }
    };
    w.onerror = (event) => {
      const listener = current?.listener;
      current = null;
      worker?.terminate();
      worker = null;
      listener?.onError?.(event.message ?? 'The layout stopped unexpectedly.');
    };
    worker = w;
    return w;
  };

  return {
    run(input, listener, { notes = true } = {}) {
      stop();
      let key: string;
      try {
        key = layoutKey(input);
      } catch (error) {
        listener.onError?.(error instanceof Error ? error.message : String(error));
        return () => {};
      }
      const hit = cache.get(key);
      if (hit && hit.layout.algorithmVersion === ALGORITHM_VERSION) {
        listener.onLayout?.(hit.layout, true);
        if (!notes) return () => {};
        if (hit.sensitivity) {
          listener.onSensitivity?.(hit.sensitivity);
          return () => {};
        }
      }
      const id = nextId++;
      // A cached layout without its notes yet: run again for the notes only.
      const notesOnly: LayoutListener = {};
      if (listener.onSensitivity) notesOnly.onSensitivity = listener.onSensitivity;
      if (listener.onError) notesOnly.onError = listener.onError;
      current = { id, key, listener: hit ? notesOnly : listener, notes };
      ensureWorker().postMessage(notes ? { id, input } : { id, input, notes: false });
      return () => {
        if (current?.id === id) stop();
      };
    },
    cached(input) {
      return cache.get(layoutKey(input));
    },
    dispose() {
      stop();
      worker?.terminate();
      worker = null;
    },
  };
}

/**
 * The worker's code run in this thread, a tick later, the way a real worker
 * answers. For tests, and a browser without module workers. It can't be
 * interrupted mid-layout; a stopped one just keeps quiet.
 */
export function inlineWorker(): WorkerLike {
  let stopped = false;
  const worker: WorkerLike = {
    onmessage: null,
    onerror: null,
    postMessage(request) {
      setTimeout(() => {
        if (stopped) return;
        handleRequest(request, (answer) => {
          if (!stopped) worker.onmessage?.({ data: answer });
        });
      }, 0);
    },
    terminate() {
      stopped = true;
    },
  };
  return worker;
}

function spawnWorker(): WorkerLike {
  if (typeof Worker === 'undefined') return inlineWorker();
  return new Worker(new URL('./layout.worker.ts', import.meta.url), { type: 'module', name: 'layout' }) as unknown as WorkerLike;
}

const sharedCache: LayoutCache = new Map();
const runners = new Map<string, LayoutRunner>();
let spawnOverride: (() => WorkerLike) | null = null;

function named(name: 'screen' | 'compare' | 'background'): LayoutRunner {
  let runner = runners.get(name);
  if (!runner) {
    runner = createLayoutRunner({ spawn: () => (spawnOverride ?? spawnWorker)(), cache: sharedCache });
    runners.set(name, runner);
  }
  return runner;
}

/** The app's runner for the layout on screen, with its sensitivity notes. */
export function layoutRunner(): LayoutRunner {
  return named('screen');
}

/** Lays out the other modes for the stats strip's comparison, one after another. */
export function comparisonRunner(): LayoutRunner {
  return named('compare');
}

/** Lays out a job marked Ready to cut away from the cut list, to keep its layouts. */
export function backgroundRunner(): LayoutRunner {
  return named('background');
}

/** Forget every result and stop every run (tests). */
export function resetLayoutRunners(): void {
  for (const runner of runners.values()) runner.dispose();
  runners.clear();
  sharedCache.clear();
}

/** Lay out with these workers from now on; null for the real ones (tests). Forgets every result. */
export function setLayoutWorkers(spawn: (() => WorkerLike) | null): void {
  resetLayoutRunners();
  spawnOverride = spawn;
}
