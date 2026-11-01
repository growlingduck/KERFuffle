# How KERFuffle Sizes Cabinet Parts

This page explains, in shop terms, how KERFuffle works out every part of a
cabinet, and records the decisions the shop has made about it.

The formulas started from the two old calculators: the web page and the
`CutList.xlsm` spreadsheet. Where the two disagreed, or where something was
hard-coded with no explanation, KERFuffle turned it into a named setting and
asked the shop. Your answers from 31 October 2026 are recorded under
[Resolved](#resolved).

**What we still need from you:** check the [example cabinets](#checked-examples)
against real builds, and keep an eye on the one item still being watched (shelf
thickness with non-3/4" panels, see [Open Questions](#open-questions)).

---

## Words used on this page

| Word | Meaning |
|---|---|
| **Length** | The measurement that runs **with the grain**. Up and down for the back, sides, front, and all laminate. Side to side for the top, bottom, and shelves. |
| **Width** | The measurement across the grain. |
| **Thickness** | Material thickness. Laminate never shows one; it is too thin to matter. |
| **Box height** | For a **base** cabinet: overall height − toe kick − countertop. For a **wall** cabinet: the full height. |

Sizes are kept exact to 1/64" internally. Screens and printouts show the
nearest 1/16", so 28 7/16" shows as 28 7/16". When a size falls between 1/16"
marks it is rounded to the nearest 1/16" and marked with **≈**, so you know it
is not exact. For example, 23/32" plywood shows as ≈ 3/4". A size exactly
halfway between two marks rounds up.

---

## The formulas

Symbols: **W** = cabinet width, **H** = overall height, **D** = depth,
**p** = panel thickness.

All the worked examples use the same **base cabinet**: 30" wide, 36" high,
24" deep, 3/4" panels, 4" toe kick, 1 1/2" countertop, 1 shelf, left end
finished. Its **box height** is 36 − 4 − 1 1/2 = **30 1/2"**.

### Back
- **Length** = box height. **Width** = W. **Thickness** = p. One per cabinet.
- The back is full width; the sides sit in front of it.
- *Example:* 30 1/2" long × 30" wide.

### Bottom and Top (same size)
- **Length** = W − 2p (fits between the sides). **Width** = D − p (stops at
  the back). **Thickness** = p. One of each.
- *Example:* 30 − 1 1/2 = **28 1/2"** long × 24 − 3/4 = **23 1/4"** wide.

### Left side and Right side
- **Length** = box height. **Width** = D − p. **Thickness** = p. One of each.
- *Example:* 30 1/2" long × 23 1/4" wide.

### Front (door/laminate size)
- **Length** = box height. **Width** = W. **Thickness** = p.
- This is **not a box part**. It is the full face size, used to cut doors from
  or to size the front laminate. It is always calculated. The cut list will
  have a switch (on by default) to show or hide fronts.
- *Example:* 30 1/2" long × 30" wide.

### Shelf
- **Length** = W − 2p − 1/8" clearance at **each** side (1/4" in all).
- **Width** = D − p − 1/8" setback from the front.
- **Thickness** = 3/4", or 1" when the cabinet is **36" wide or more**.
- **How many:** the shelf count. With 0 shelves, no shelf line appears.
- *Example:* 28 1/2 − 1/4 = **28 1/4"** long × 23 1/4 − 1/8 = **23 1/8"** wide
  × 3/4" thick. The cabinet is 30" wide, under 36", so the shelf is 3/4".
- If the panels are not 3/4" (for example 23/32" plywood), shelves are still
  listed as 3/4", and KERFuffle shows a **warning** so you can check which
  stock the shelves come from.

### Side laminate (one per finished end)
- **1" extra all around:** 1" past every edge, so each measurement gets 2".
- **Length** = box height + 2". **Width** = D + 2".
- Left end finished gives a left piece, right gives a right piece, both gives
  two pieces.
- *Example:* 30 1/2 + 2 = **32 1/2"** long × 24 + 2 = **26"** wide.

### Front laminate (always one)
- **Length** = box height + 2". **Width** = W + 2".
- *Example:* 32 1/2" long × 32" wide.

### Wall cabinets
Wall cabinets use the same formulas with one difference: **box height is the
full height**. Toe kick and countertop do not apply, and the program will hide
those boxes for wall cabinets.

*Example:* wall cabinet 30" wide × 30" high × 12" deep, 2 shelves, both ends
finished:

| Part | Length | Width | Thickness | Qty |
|---|---|---|---|---|
| Back | 30 | 30 | 3/4 | 1 |
| Bottom | 28 1/2 | 11 1/4 | 3/4 | 1 |
| Left side | 30 | 11 1/4 | 3/4 | 1 |
| Right side | 30 | 11 1/4 | 3/4 | 1 |
| Top | 28 1/2 | 11 1/4 | 3/4 | 1 |
| Front (door/laminate size) | 30 | 30 | 3/4 | 1 |
| Shelf | 28 1/4 | 11 1/8 | 3/4 | 2 |
| Laminate, left side | 32 | 14 | none | 1 |
| Laminate, right side | 32 | 14 | none | 1 |
| Laminate, front | 32 | 32 | none | 1 |

### Quantity
If you enter a quantity of 3, every count is multiplied by 3. For example,
2 shelves per cabinet × 3 cabinets = 6 shelves.

### How the old calculators labeled Top and Bottom
The old calculators listed the Top and Bottom with their W and L swapped:
the Bottom said "W 28 1/2, L 23 1/4" and the Top said "W 23 1/4, L 28 1/2".
They are the same piece. KERFuffle always lists **length with the grain**,
so the Top and Bottom now read the same way: 28 1/2 long × 23 1/4 wide.

---

## Settings and where each came from

These are the shop settings. Each one has a default. Jobs will keep their own
copy, so changing a default later will not change old jobs.

| Setting | Default | Where it came from |
|---|---|---|
| Panel thickness | 3/4" | Entered by hand in both old versions |
| Toe-kick height (base only) | 4" | Shop decision (Q9). The old web page pre-filled 1 1/2". |
| Countertop thickness (base only) | 1 1/2" | Shop decision (Q9). The old web page pre-filled 3/4". |
| Shelf thickness | 3/4" | Hard-coded in both old versions; kept (Q7) |
| Wide-shelf thickness | 1" | Hard-coded in both old versions; kept |
| Wide-shelf width | 36" and over | Shop decision (Q1), same as the old web page |
| Shelf clearance | 1/8" at each side | Shop decision (Q2). Both old versions took 1/8" in total. |
| Shelf setback | 1/8" | Shop decision (Q3). Adjustable. Neither old version had one. |
| Laminate oversize | 1" past each edge | Shop decision (Q4). Both old versions added 1" in total per measurement. |

Laminate thickness is not a setting: laminate never shows a thickness (Q5).

Two extra presets, **Legacy web** and **Legacy spreadsheet**, reproduce each
old calculator exactly, mistakes and old values included. They exist only so we
can prove the new program matches the old one wherever we did not deliberately
change it. Do not use them for real jobs.

---

## Open Questions

| # | Question | Web version | Spreadsheet | What KERFuffle does now | Shop answer |
|---|---|---|---|---|---|
| Q7 | **Shelf thickness with other panel stock:** with 23/32" panels, shelves stay 3/4" (or 1"). Keep as is, but flag it for now. Revisit once we see how often the warning comes up. | Always 3/4" or 1" | Always 3/4" or 1" | Lists 3/4" or 1" and shows a warning when panels differ | Keep for now, flag the mismatch |

---

## Resolved

Decisions the shop has made. The program follows these.

1. **Wall cabinets never use toe kick or countertop.** Every wall-cabinet
   height (back, sides, front, and laminate) is the full cabinet height. This
   fixes two mistakes in the old calculators:
   - The spreadsheet took toe kick and countertop off the **wall back**.
   - Both versions took them off the **wall laminate**.

   With a 30" wall cabinet, the old laminate came out 25 1/2" long. It is now
   32" (full height plus 1" all around).
2. **The Front is a reference size, not a box part.** It gives the size for
   cutting doors or sizing front laminate. It is always calculated and labeled
   "Front (door/laminate size)". The cut list will let you show or hide fronts
   (shown by default).
3. **Top and Bottom are listed the same way.** The old W/L swap between them
   was a labeling difference, not a different part. See
   [How the old calculators labeled Top and Bottom](#how-the-old-calculators-labeled-top-and-bottom).
4. **Q1, 36" wide cabinets get 1" shelves.** Anything 36" or wider gets 1"
   shelves (the web version's rule).
5. **Q2, shelf clearance is 1/8" at each side**, 1/4" in all. The old
   calculators took 1/8" in total, so shelves are now 1/8" shorter than before.
6. **Q3, shelves sit back 1/8" from the front by default.** The setback can be
   changed in settings.
7. **Q4, laminate is 1" oversize all around**, meaning 1" past every edge
   (+2" on each measurement). The old calculators added only 1" per
   measurement, so laminate is now 1" bigger each way than before.
8. **Q5, laminate has no thickness.** It is too thin to matter and is not a
   setting.
9. **Q6, grain direction is as described:** up and down on backs, sides,
   fronts, and laminate; side to side on tops, bottoms, and shelves.
10. **Q8, display:** show sizes like 28 7/16" exactly. When a size cannot be
    shown exactly in 1/16ths, round to the nearest 1/16" and mark it with ≈.
    (The old spreadsheet only showed one-digit fractions, so 28 7/16" appeared
    as "28 4/9".)
11. **Q9, new jobs start with a 4" toe kick and a 1 1/2" countertop.**

---

## Checked examples

KERFuffle keeps a set of example cabinets with their expected parts. It checks
them automatically every time the program is built. Each one is marked:

- **unconfirmed**: follows the shop rules above, but not yet checked by you
  against a real build;
- **confirmed**: checked by you. Only you can mark one confirmed;
- **legacy-derived**: a record of what an old calculator did, kept for
  comparison. These are not meant to be confirmed.

| Example | What it checks | Status |
|---|---|---|
| Base 30 W × 36 H × 24 D, 1 shelf, left end | The basic base-cabinet formulas (the worked example above) | unconfirmed |
| Base 36 W, old web rules | Exactly-36" cabinet got a 1" shelf in the old web page | legacy-derived |
| Base 36 W, old spreadsheet rules | Same cabinet got a 3/4" shelf in the old spreadsheet | legacy-derived |
| Wall 30 W × 30 H × 12 D, 2 shelves, both ends | Wall cabinets use full height, including laminate | unconfirmed |
| Base 18 W, quantity 3 | Quantities multiply | unconfirmed |
| Base with 23/32" panels | Exact 1/64" sizes, the ≈ mark, and the shelf-thickness warning | unconfirmed |
