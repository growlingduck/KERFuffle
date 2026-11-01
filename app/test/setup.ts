import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// axe probes <canvas> for icon fonts; jsdom has no canvas and logs "Not implemented" for each probe.
HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;

/**
 * jsdom has no matchMedia. This stand-in lets tests flip
 * `prefers-reduced-motion` and fires change events like a browser would.
 */
type Listener = (event: MediaQueryListEvent) => void;
const queries = new Map<string, { matches: boolean; listeners: Set<Listener> }>();

function entry(query: string) {
  let e = queries.get(query);
  if (!e) {
    e = { matches: false, listeners: new Set() };
    queries.set(query, e);
  }
  return e;
}

window.matchMedia = (query: string): MediaQueryList => {
  const e = entry(query);
  return {
    get matches() {
      return e.matches;
    },
    media: query,
    onchange: null,
    addEventListener: (_type: string, listener: Listener) => e.listeners.add(listener),
    removeEventListener: (_type: string, listener: Listener) => e.listeners.delete(listener),
    addListener: (listener: Listener) => e.listeners.add(listener),
    removeListener: (listener: Listener) => e.listeners.delete(listener),
    dispatchEvent: () => true,
  } as unknown as MediaQueryList;
};

/** Change a media query's result and notify listeners. */
export function setMediaQuery(query: string, matches: boolean): void {
  const e = entry(query);
  e.matches = matches;
  for (const listener of [...e.listeners]) listener({ matches, media: query } as MediaQueryListEvent);
}

afterEach(() => {
  cleanup();
  for (const e of queries.values()) e.matches = false;
});
