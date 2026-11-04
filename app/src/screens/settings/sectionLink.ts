import type { MouseEvent } from 'react';
import { useReducedMotion } from '../../motion';
import { routeHref } from '../../routes';
import type { SettingsSection } from '../../routes';

/** Scroll a section to the top and move focus to its heading. */
export function goToSection(id: SettingsSection, reduced: boolean): void {
  const target = document.getElementById(id);
  target?.scrollIntoView?.({ block: 'start', behavior: reduced ? 'auto' : 'smooth' });
  const heading = target?.querySelector<HTMLElement>('h2');
  if (!heading) return;
  if (!heading.hasAttribute('tabindex')) heading.tabIndex = -1;
  heading.focus({ preventScroll: true });
}

/**
 * href and onClick for a link to a Settings section (the header's Help, the
 * Help steps). A new address opens Settings there; when the address already
 * names that section and the reader has scrolled away, the click goes back to it.
 */
export function useSectionLink(section: SettingsSection): { href: string; onClick: (event: MouseEvent) => void } {
  const reduced = useReducedMotion();
  const href = routeHref({ name: 'settings', section });
  return {
    href,
    onClick: (event) => {
      if (window.location.hash !== href) return;
      event.preventDefault();
      goToSection(section, reduced);
    },
  };
}
