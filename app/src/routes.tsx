import { lazy, Suspense, useSyncExternalStore } from 'react';
import { CutListScreen } from './screens/CutList';
import { JobsScreen } from './screens/Jobs';
import { SettingsScreen } from './screens/Settings';
import { WorkspaceScreen } from './screens/Workspace';

/**
 * Hash routing. Four screens; Workspace and Cut list take a job id.
 *   #/jobs · #/jobs/:id/workspace · #/jobs/:id/cut-list · #/settings
 * plus #/dev/gallery in development builds.
 */
export type Route =
  | { name: 'jobs' }
  | { name: 'workspace'; jobId: string }
  | { name: 'cutlist'; jobId: string }
  | { name: 'settings' }
  | { name: 'gallery' };

export type ScreenName = 'jobs' | 'workspace' | 'cutlist' | 'settings';

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  const [first, second, third] = parts;
  if (first === 'jobs' && second && third === 'workspace') return { name: 'workspace', jobId: second };
  if (first === 'jobs' && second && third === 'cut-list') return { name: 'cutlist', jobId: second };
  if (first === 'settings') return { name: 'settings' };
  if (first === 'dev' && second === 'gallery' && import.meta.env.DEV) return { name: 'gallery' };
  return { name: 'jobs' };
}

export function routeHref(route: Route): string {
  switch (route.name) {
    case 'jobs':
      return '#/jobs';
    case 'workspace':
      return `#/jobs/${encodeURIComponent(route.jobId)}/workspace`;
    case 'cutlist':
      return `#/jobs/${encodeURIComponent(route.jobId)}/cut-list`;
    case 'settings':
      return '#/settings';
    case 'gallery':
      return '#/dev/gallery';
  }
}

export function navigate(route: Route): void {
  const href = routeHref(route);
  if (window.location.hash !== href) window.location.hash = href;
}

/** The route for a screen tab. Job screens need a job; without one they fall back to Jobs. */
export function screenRoute(screen: ScreenName, jobId: string | null): Route {
  if ((screen === 'workspace' || screen === 'cutlist') && jobId) return { name: screen, jobId };
  if (screen === 'settings') return { name: 'settings' };
  return { name: 'jobs' };
}

export function routeJobId(route: Route): string | undefined {
  return route.name === 'workspace' || route.name === 'cutlist' ? route.jobId : undefined;
}

let current = parseHash(window.location.hash);
let currentHash = window.location.hash;

/**
 * A screen with unsaved work (Settings) can hold navigation. The guard sees
 * every route change (tabs, links, shortcuts, Back) and returns true to stop
 * it; it is given `proceed` to continue later (after Save or Discard).
 */
export type NavigationGuard = (to: Route, proceed: () => void) => boolean;

let guard: NavigationGuard | null = null;
/** A change the guard already let through (hashchange arrives later, as its own event). */
let allowedHash: string | null = null;

/** Install a guard until the returned function is called. One at a time. */
export function setNavigationGuard(next: NavigationGuard): () => void {
  guard = next;
  return () => {
    if (guard === next) guard = null;
  };
}

// Registered at load, before any subscriber, so a held change is undone before
// anything renders it. replaceState doesn't fire hashchange.
window.addEventListener('hashchange', () => {
  const hash = window.location.hash;
  if (hash === allowedHash) {
    allowedHash = null;
    return;
  }
  if (hash === currentHash || !guard) return;
  const proceed = () => {
    allowedHash = hash;
    window.location.hash = hash;
  };
  if (guard(parseHash(hash), proceed)) window.history.replaceState(window.history.state, '', currentHash || '#/jobs');
});

function subscribe(listener: () => void): () => void {
  const onHash = () => {
    if (window.location.hash === currentHash) return;
    currentHash = window.location.hash;
    current = parseHash(currentHash);
    listener();
  };
  window.addEventListener('hashchange', onHash);
  return () => window.removeEventListener('hashchange', onHash);
}

export function useRoute(): Route {
  return useSyncExternalStore(
    subscribe,
    () => {
      // Pick up hash changes made before any subscriber was attached (e.g. in tests).
      if (window.location.hash !== currentHash) {
        currentHash = window.location.hash;
        current = parseHash(currentHash);
      }
      return current;
    },
    () => current,
  );
}

const Gallery = import.meta.env.DEV ? lazy(() => import('./dev/Gallery')) : null;

export function RouteOutlet({ route }: { route: Route }) {
  switch (route.name) {
    case 'jobs':
      return <JobsScreen />;
    case 'workspace':
      return <WorkspaceScreen jobId={route.jobId} />;
    case 'cutlist':
      return <CutListScreen jobId={route.jobId} />;
    case 'settings':
      return <SettingsScreen />;
    case 'gallery':
      return Gallery ? (
        <Suspense fallback={null}>
          <Gallery />
        </Suspense>
      ) : (
        <JobsScreen />
      );
  }
}
