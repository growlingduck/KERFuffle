import { useId } from 'react';
import type { SawProfile } from '@kerfuffle/engine';
import { InfoTip } from '../../components/InfoTip';
import { FIRST_CUT_NAMES, sameCutting } from '../../data/sawProfiles';
import { exactInches } from '../../lib/dimensions';
import { routeHref } from '../../routes';
import styles from './CutList.module.css';

export interface SawProfilePanelProps {
  /** The profile the job lays out with: its own copy, or the shop default. */
  profile: SawProfile;
  /** True when the job has no profile of its own yet. */
  usingDefault: boolean;
  /** The shop's profiles, from Settings. */
  profiles: readonly SawProfile[];
  onChoose: (id: string) => void;
}

/**
 * Screen only: the saw profile the job's sheet layouts use. Choosing one
 * copies it into the job; editing the profile in Settings never changes it.
 */
export function SawProfilePanel({ profile, usingDefault, profiles, onChoose }: SawProfilePanelProps) {
  const id = useId();
  const shop = profiles.find((p) => p.id === profile.id);
  // The job's copy is from another PC, or Settings has changed the profile since it was chosen.
  const known = shop !== undefined;
  const stale = shop !== undefined && !usingDefault && !sameCutting(shop, profile);
  const settingsHref = routeHref({ name: 'settings', section: 'saws' });
  return (
    <section className={styles.railPanel} aria-labelledby={`${id}-title`}>
      <h2 className={styles.sketchTitle}>
        <span id={`${id}-title`}>Saw profile</span> <InfoTip term="sawProfile" />
      </h2>
      {usingDefault ? (
        <p className={styles.railEmpty} style={{ marginTop: 6 }} data-empty="saw">
          No saw profile chosen for this job: layouts use the shop default, {profile.name}. Pick one below to keep a copy in the job, or set them up in{' '}
          <a href={settingsHref}>Settings → Saw profiles</a>.
        </p>
      ) : (
        <p className={styles.railHelp} style={{ marginTop: 6 }}>
          The job keeps a copy of its saw profile. Editing it in Settings never changes this job.
        </p>
      )}
      <div className={styles.slots}>
        <div className={styles.slot}>
          <label className={styles.slotLabel} htmlFor={`${id}-profile`}>
            Sheet layouts are cut on
          </label>
          <select id={`${id}-profile`} className={styles.select} value={profile.id} aria-describedby={`${id}-note`} onChange={(e) => onChoose(e.target.value)}>
            {!known && <option value={profile.id}>{profile.name} (not in this shop’s list)</option>}
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <div id={`${id}-note`} className={styles.slotNote}>
            <span className="mono">
              Kerf {exactInches(profile.kerf)} · trim {exactInches(profile.edgeTrim)} · {FIRST_CUT_NAMES[profile.firstCut].toLowerCase()}
            </span>{' '}
            <InfoTip term="kerf" />
            {stale && <span className={styles.slotWarn}>Settings has changed this profile since. Choose it again to copy the new values.</span>}
          </div>
        </div>
      </div>
      <p className={styles.railHelp}>
        Add and edit profiles in <a href={settingsHref}>Settings → Saw profiles</a>. Screen only: never printed.
      </p>
    </section>
  );
}
