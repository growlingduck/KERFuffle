/**
 * Splits the cut list into printed sheets. Pure: it works from measured
 * heights, so the same pages are shown on screen, printed and saved as PDF.
 *
 * - Rows never split, a heading never ends a page without a row under it, and
 *   a group never carries a single row over to the next sheet.
 * - A group that won't fit moves whole to the next sheet when it fits there
 *   and less than half of it would fit here; otherwise it continues on the next
 *   sheet under a repeated heading marked "cont.".
 */

export interface MeasuredRow {
  key: string;
  height: number;
}

export interface MeasuredGroup {
  id: string;
  /** Heading plus column headers. */
  headHeight: number;
  rows: readonly MeasuredRow[];
}

export interface PageGroupPiece {
  kind: 'group';
  groupId: string;
  /** Continued from the previous sheet: the heading says "cont.". */
  cont: boolean;
  rowKeys: string[];
}

export type PagePiece = { kind: 'intro' } | PageGroupPiece;

export interface PageLayout {
  pieces: PagePiece[];
}

export interface PaginateInput {
  /** Usable body height of a sheet. */
  bodyHeight: number;
  /** The cabinet chips, first sheet only. */
  introHeight?: number;
  groups: readonly MeasuredGroup[];
}

export function paginate({ bodyHeight, introHeight, groups }: PaginateInput): PageLayout[] {
  const pages: PageLayout[] = [{ pieces: [] }];
  let used = 0;
  const page = () => pages[pages.length - 1]!;
  const newPage = () => {
    pages.push({ pieces: [] });
    used = 0;
  };

  if (introHeight !== undefined) {
    page().pieces.push({ kind: 'intro' });
    used += introHeight;
  }

  for (const group of groups) {
    if (group.rows.length === 0) continue;
    const total = group.headHeight + group.rows.reduce((sum, r) => sum + r.height, 0);
    let next = 0;
    let cont = false;

    if (used + total > bodyHeight && used > 0 && total <= bodyHeight) {
      const fitHere = rowsThatFit(group, 0, bodyHeight - used);
      if (fitHere < group.rows.length / 2) newPage();
    }

    while (next < group.rows.length) {
      let fit = rowsThatFit(group, next, bodyHeight - used);
      if (fit === 0) {
        if (used > 0) {
          newPage();
          continue;
        }
        // A row taller than a whole sheet: place it anyway rather than loop.
        fit = 1;
      }
      // Leave at least two rows for the next sheet, so one doesn't sit alone under "cont.".
      if (fit > 2 && group.rows.length - (next + fit) === 1) fit -= 1;
      const rows = group.rows.slice(next, next + fit);
      page().pieces.push({ kind: 'group', groupId: group.id, cont, rowKeys: rows.map((r) => r.key) });
      used += group.headHeight + rows.reduce((sum, r) => sum + r.height, 0);
      next += fit;
      if (next < group.rows.length) {
        newPage();
        cont = true;
      }
    }
  }
  return pages;
}

/** How many rows from `start` fit under a heading in `space`. */
function rowsThatFit(group: MeasuredGroup, start: number, space: number): number {
  let left = space - group.headHeight;
  let count = 0;
  for (let i = start; i < group.rows.length; i++) {
    left -= group.rows[i]!.height;
    if (left < 0) break;
    count += 1;
  }
  return count;
}
