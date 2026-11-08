import { standsOnFloor } from '../cabinetTypes';
import { PART_NAMES } from '../parts';
import type { ConstructionRules, Part, PartRole } from '../types';
import { formatDimension, subtractTicks, ticks, type Ticks } from '../units';
import type { JobIssue, JobPart, JobPartsResult, ListedCabinet } from './types';

/**
 * Method A1's ladder base, made per run of base cabinets: a front and a back
 * rail (kick height tall) with sleepers between them, and a kick skin over
 * the front rail. docs/calculation-rules.md, "A1: ladder base".
 */

/** The cut-list reference for a run's parts. */
export function runRef(run: string): string {
  return `Run: ${run}`;
}

/** A cabinet's run name, trimmed; null when it has none. */
export function runOf(cabinet: { run?: string | null }): string | null {
  const name = cabinet.run?.trim() ?? '';
  return name === '' ? null : name;
}

interface Platform {
  /** Null for a cabinet's own platform. */
  run: string | null;
  ref: string;
  cabinetIndex: number | null;
  /** One entry per box, in list order (a cabinet of quantity 3 is three boxes). */
  widths: Ticks[];
  depths: Ticks[];
  /** For a cabinet's own platform: how many identical platforms. */
  count: number;
}

/**
 * Base and tall cabinets grouped into platforms, in list order: one per named
 * run, and one for each such cabinet without a run.
 */
function platforms(cabinets: readonly ListedCabinet[]): Platform[] {
  const out: Platform[] = [];
  const byRun = new Map<string, Platform>();
  for (const { index, cabinet } of cabinets) {
    if (!standsOnFloor(cabinet.type)) continue;
    const run = runOf(cabinet);
    if (run === null) {
      out.push({ run, ref: cabinet.id, cabinetIndex: index, widths: [cabinet.width], depths: [cabinet.depth], count: cabinet.quantity });
      continue;
    }
    let platform = byRun.get(run);
    if (!platform) {
      platform = { run, ref: runRef(run), cabinetIndex: null, widths: [], depths: [], count: 1 };
      byRun.set(run, platform);
      out.push(platform);
    }
    for (let i = 0; i < cabinet.quantity; i += 1) {
      platform.widths.push(cabinet.width);
      platform.depths.push(cabinet.depth);
    }
  }
  return out;
}

/**
 * Split a platform into sections no longer than `max`. A platform that fits
 * is one section. Otherwise it is cut into the fewest sections that fit, as
 * equal as possible, with each joint moved to the nearest cabinet seam that
 * still keeps every section within `max`. Where no seam works, the joint goes
 * at the equal-split point.
 */
export function splitPlatform(widths: readonly Ticks[], max: Ticks): Ticks[] {
  const total = widths.reduce((sum, w) => sum + w, 0);
  if (total <= max) return [ticks(total)];

  const count = Math.ceil(total / max);
  const seams: number[] = [];
  let at = 0;
  for (const width of widths.slice(0, -1)) {
    at += width;
    seams.push(at);
  }

  const joints: number[] = [];
  let previous = 0;
  for (let k = 1; k < count; k += 1) {
    const sectionsLeft = count - k + 1;
    const remaining = total - previous;
    const ideal = previous + remaining / sectionsLeft;
    const fits = (joint: number) => joint > previous && joint - previous <= max && total - joint <= max * (sectionsLeft - 1);
    let best: number | null = null;
    for (const seam of seams) {
      if (!fits(seam)) continue;
      if (best === null || Math.abs(seam - ideal) < Math.abs(best - ideal)) best = seam;
    }
    // ceil keeps this section within max and leaves the rest no longer than before.
    const joint = best ?? previous + Math.ceil(remaining / sectionsLeft);
    joints.push(joint);
    previous = joint;
  }

  const ends = [...joints, total];
  return ends.map((end, i) => ticks(end - (i === 0 ? 0 : ends[i - 1]!)));
}

/**
 * Sleepers under a section: one at each end, and enough between them that no
 * center-to-center gap is more than the maximum spacing.
 */
export function sleeperCount(sectionLength: Ticks, rules: ConstructionRules): number {
  const span = subtractTicks(sectionLength, rules.panelThickness); // end sleeper center to center
  return Math.max(1, Math.ceil(span / rules.method.sleeperSpacingMax)) + 1;
}

const show = (value: Ticks) => formatDimension(value, { inchMark: false }).text;

export function ladderBaseParts(cabinets: readonly ListedCabinet[], rules: ConstructionRules): JobPartsResult {
  const m = rules.method;
  const p = rules.panelThickness;
  const kick = rules.toeKickHeight;
  const parts: JobPart[] = [];
  const issues: JobIssue[] = [];
  // No kick, no base to build.
  if (kick <= 0) return { parts, issues };

  for (const platform of platforms(cabinets)) {
    // The base must not show past a shallower cabinet, so a run of mixed
    // depths gets a base sized for the shallowest.
    const depth = ticks(Math.min(...platform.depths));
    if (platform.depths.some((d) => d !== depth)) {
      issues.push({
        ref: platform.ref,
        issue: {
          field: 'depth',
          severity: 'warning',
          message: `The cabinets in this run are different depths. Its base is sized for the shallowest (${show(depth)}″).`,
        },
      });
    }
    const platformDepth = subtractTicks(depth, m.kickDepth);
    const sleeperLength = subtractTicks(platformDepth, p, p);
    if (sleeperLength <= 0) {
      issues.push({
        ref: platform.ref,
        issue: {
          field: 'method.kickDepth',
          severity: 'error',
          message: `A ${show(depth)}″ deep cabinet is too shallow for a ladder base with a ${show(m.kickDepth)}″ kick depth, so its base is left off.`,
        },
      });
      continue;
    }

    const made = new Map<string, Part>();
    const add = (role: PartRole, length: Ticks, width: Ticks, thickness: Ticks, quantity: number) => {
      const key = `${role}|${length}|${width}|${thickness}`;
      const found = made.get(key);
      if (found) {
        found.quantity += quantity;
        return;
      }
      const part: Part = {
        cabinetId: platform.ref,
        role,
        category: 'panel',
        name: PART_NAMES[role],
        length,
        width,
        thickness,
        quantity,
        optional: false,
      };
      if (platform.run !== null) part.run = platform.run;
      made.set(key, part);
    };

    const sections = splitPlatform(platform.widths, m.platformLengthMax);
    for (const role of ['base-rail-front', 'base-rail-back'] as const) {
      for (const length of sections) add(role, length, kick, p, platform.count);
    }
    for (const length of sections) add('base-sleeper', sleeperLength, kick, p, sleeperCount(length, rules) * platform.count);
    for (const length of sections) add('kick-skin', length, kick, m.kickSkinThickness, platform.count);

    for (const part of made.values()) parts.push({ part, cabinetIndex: platform.cabinetIndex });
  }
  return { parts, issues };
}
