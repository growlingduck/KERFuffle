import { lazy, Suspense, useSyncExternalStore } from 'react';
import { CutListScreen } from './screens/CutList';
import { JobsScreen } from './screens/Jobs';
import { SettingsScreen } from './screens/Settings';
import { WorkspaceScreen } from './screens/Workspace';

/**
 * Hash routing. Four screens; Workspace and Cut list take a job id.
 *   #/jobs · #/jobs/:id/workspace · #/jobs/:id/cut-list · #/settings[/:section]
 * plus #/jobs/new (Jobs, with New job open) and #/dev/gallery in development builds.
 */
export type Route =
  | { name: 'jobs'; newJob?: true }
  | { name: 'workspace'; jobId: string }
  | { name: 'cutlist'; jobId: string }
  | { name: 'settings'; section?: SettingsSection }
  | { name: 'gallery' };

/** Settings sections a link can open at, e.g. #/settings/materials. */
export const SETTINGS_SECTIONS = ['construction', 'materials', 'saws', 'display', 'backups', 'about', 'help'] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

function isSettingsSection(value: string | undefined): value is SettingsSection {
  return (SETTINGS_SECTIONS as readonly (string | undefined)[]).includes(value);
}

export type ScreenName = 'jobs' | 'workspace' | 'cutlist' | 'settings';

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  const [first, second, third] = parts;
  if (first === 'jobs' && second === 'new' && !third) return { name: 'jobs', newJob: true };
  if (first === 'jobs' && second && third === 'workspace') return { name: 'workspace', jobId: second };
  if (first === 'jobs' && second && third === 'cut-list') return { name: 'cutlist', jobId: second };
  if (first === 'settings') return isSettingsSection(second) ? { name: 'settings', section: second } : { name: 'settings' };
  if (first === 'dev' && second === 'gallery' && import.meta.env.DEV) return { name: 'gallery' };
  return { name: 'jobs' };
}

export function routeHref(route: Route): string {
  switch (route.name) {
    case 'jobs':
      return route.newJob ? '#/jobs/new' : '#/jobs';
    case 'workspace':
      return `#/jobs/${encodeURIComponent(route.jobId)}/workspace`;
    case 'cutlist':
      return `#/jobs/${encodeURIComponent(route.jobId)}/cut-list`;
    case 'settings':
      return route.section ? `#/settings/${route.section}` : '#/settings';
    case 'gallery':
      return '#/dev/gallery';
  }
}

export function navigate(route: Route): void {
  const href = routeHref(route);
  if (window.location.hash !== href) window.location.hash = href;
}

/** Change the address without a new history entry, so Back skips the old one. No guard asks. */
export function replaceRoute(route: Route): void {
  const href = routeHref(route);
  if (window.location.hash === href) return;
  window.history.replaceState(window.history.state, '', href);
  allowedHash = href;
  window.dispatchEvent(new HashChangeEvent('hashchange'));
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
 * it; it is given `proceed` to continue later (after Save or Discard). `to` is
 * null when the app is closing.
 */
export type NavigationGuard = (to: Route | null, proceed: () => void) => boolean;

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

/**
 * Run `proceed` once the guard (if any) lets the user go, as leaving the
 * screen would: at once when nothing is unsaved, after Save or Discard
 * otherwise, never if they cancel. Used before closing the app for an update.
 */
export function whenFreeToLeave(proceed: () => void): void {
  if (!guard?.(null, proceed)) proceed();
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
      return <JobsScreen newJob={route.newJob ?? false} />;
    case 'workspace':
      return <WorkspaceScreen jobId={route.jobId} />;
    case 'cutlist':
      return <CutListScreen jobId={route.jobId} />;
    case 'settings':
      return <SettingsScreen section={route.section} />;
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
