# How KERFuffle Sizes Cabinet Parts

This page explains, in shop terms, how KERFuffle works out every part of a
cabinet, and records the decisions the shop has made about it.

The formulas started from the two old calculators: the web page and the
`CutList.xlsm` spreadsheet. Where the two disagreed, or where something was
hard-coded with no explanation, KERFuffle turned it into a named setting and
asked the shop. Your answers from 31 October 2026 are recorded under
[Resolved](#resolved).

**What we still need from you:** check the [example cabinets](#checked-examples)
against real builds, keep an eye on the one item still being watched (shelf
thickness with non-3/4" panels, see [Open Questions](#open-questions)), and
answer the [construction-method judgment calls](#construction-methods-judgment-calls-to-check)
(sleeper count, platform splits and the rest).

---

## Words used on this page

| Word | Meaning |
|---|---|
| **Length** | The measurement that runs **with the grain**. Up and down for the back, sides, front, and all laminate. Side to side for the top, bottom, and shelves. |
| **Width** | The measurement across the grain. |
| **Thickness** | Material thickness. Laminate never shows one; it is too thin to matter. |
| **Box height** | For a **base** cabinet: overall height − toe kick − countertop. For a **tall** cabinet: overall height − toe kick. For a **wall** cabinet: the full height. |
| **Tall cabinet** | A pantry, oven, utility or broom cabinet. It stands on the floor like a base cabinet but has no countertop, and fills the base and the wall rows of the wall. See [Tall cabinets](#tall-cabinets). |
| **Fixed shelf** | A structural shelf in a tall cabinet, fastened like the bottom. Adjustable shelves sit on pins between the fixed ones. |
| **Construction method** | How the job's cabinets are built: **A** frameless on a separate base, or **B** frameless with an integral toe kick. Chosen once per job. See [Construction methods](#construction-methods). |
| **Run** | A straight row of base (and tall) cabinets that stand on one shared base, e.g. "Sink wall". Separate from the room: a room can hold several runs. |
| **Kick depth** | How far the toe-kick face sits back from the cabinet front. |

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

## Construction methods

Every job has one construction method, and every cabinet in the job is built
that way. The formulas above are **method A with the standard box**: an
applied back, a full top, and the base not on the cut list. Jobs made before
methods existed open as exactly that, so their cut lists do not change by a
single number. New jobs start with method A on a ladder base (A1), and **list
the base**.

All methods build the same frameless box. They differ in how far the sides
run, what goes under the box, and what that does to the end laminate.

Extra symbols used below: **k** = toe-kick height, **kd** = kick depth,
**c** = countertop thickness, **tb** = back thickness, **g** = back groove depth,
**i** = dado inset.

### The box, in every method

**Back.** Three ways to fit it:

| Back | Back size | Sides, top, bottom depth | Shelves stop at |
|---|---|---|---|
| **Applied** (default) | box height × W, **tb** thick | D − tb | D − tb |
| **Inset in a rabbet** | (box height − 2p + 2g) × (W − 2p + 2g) | D (full depth) | D − tb |
| **Inset in a dado** | (box height − 2p + 2g) × (W − 2p + 2g) | D (full depth) | D − i − tb |

- Back thickness is **the same as the panels** unless it is set. With 3/4"
  panels that is the 3/4" applied back the formulas above use.
- An inset back sits in a groove **g** deep (default 1/4") cut in the sides,
  top and bottom: a rabbet at the back edge, or a dado set in **i** (default
  3/4") from it. The back is the opening between the box members plus one
  groove depth at each edge.
- Shelves are still 1/8" short of whatever they stop at (the shelf setback).

**Nailer.** An inset back is too thin to screw through, so the box gets a
nailer (hanging rail) under the top: **W − 2p** long × the nailer width
(default 4") × p. With a dado back it sits behind the back, in the inset; with
a rabbet back, in front of it. Applied backs have no nailer.

**Base top.** A base cabinet's top is either a **full panel** (default, the
Top above) or **two stretchers**, front and back, each **W − 2p** long × the
stretcher width (default 4") × p. Wall cabinets always have a full top.

*Example, inset back:* base 30 W × 36 H × 24 D, 1 shelf, a 1/4" back in a
1/4" dado set in 3/4", two stretchers; and wall 30 W × 30 H × 12 D, 2 shelves,
the same back.

| Part | Base: length × width × thickness | Wall: length × width × thickness |
|---|---|---|
| Back | 30 1/2 − 1 1/2 + 1/2 = **29 1/2** × 28 1/2 + 1/2 = **29** × 1/4 | 30 − 1 1/2 + 1/2 = **29** × **29** × 1/4 |
| Bottom | 28 1/2 × **24** × 3/4 | 28 1/2 × **12** × 3/4 |
| Left and right side | 30 1/2 × **24** × 3/4 | 30 × **12** × 3/4 |
| Top | two stretchers, 28 1/2 × 4 × 3/4 | 28 1/2 × 12 × 3/4 |
| Nailer | 28 1/2 × 4 × 3/4 | 28 1/2 × 4 × 3/4 |
| Shelf | 28 1/4 × (24 − 1 − 1/8) = **22 7/8** × 3/4 | 28 1/4 × (12 − 1 − 1/8) = **10 7/8** × 3/4, two |

The front and laminate do not change with the back. The base still gets its
own ladder base (A1, below).

### Method A: frameless on a separate base (the default)

The base box is a plain rectangle, **box height = H − k − c**, standing on a
base that is built separately. The sides stop at the box, and end laminate
covers **the box only** (box height + 2"), exactly as in the formulas above.
Wall cabinets are the same as everywhere else.

*Worked examples:* the base cabinet at the top of this page and the
[wall cabinet table](#wall-cabinets) are both method A.

The shop picks one of two bases per job. **A1 is the default.**

#### A1: ladder base

A ladder base is a front rail and a back rail, **k** tall, with sleepers
between them. It is built **per run**, not per cabinet:

- The base and tall cabinets that share a run name, in list order, stand on
  one platform. Its length is their widths added up (a cabinet with quantity 3
  counts three times). Wall cabinets never get a base, even if they have a run.
- A base or tall cabinet with **no run** gets its own platform, its own width long.
- A platform longer than the maximum (default **96"**) is cut into the fewest
  sections that fit. The joints aim for equal sections, but each one moves to
  the nearest **cabinet seam** that keeps every section within the maximum.
  Where no seam works, the joint goes at the equal-split point.

For each section of length **L**:

| Part | Length | Width | Thickness | How many |
|---|---|---|---|---|
| Base rail, front | L | k | p | 1 |
| Base rail, back | L | k | p | 1 |
| Base sleeper | D − kd − 2p (fits between the rails) | k | p | see below |
| Kick skin | L | k | kick skin thickness (default 1/4") | 1 |

- The front rail is set back **kd** (default 3") from the cabinet fronts; the
  kick skin covers its face.
- **Sleepers:** one at each end of the section, then enough between that no
  gap, center to center, is more than the sleeper spacing (default 24"). The
  end sleepers' centers are L − p apart, so sleepers = (L − p) ÷ spacing,
  **rounded up**, + 1.
- If a run mixes cabinet depths, the base is sized for the **shallowest**, so
  it never shows past a cabinet front. The cut list says so.

*Example, one run:* B1 30", B2 36" and B3 18" in the run "Sink wall", all 24"
deep. The platform is 30 + 36 + 18 = **84"**, under 96", so one section.

| Part | Length | Width | Thickness | Qty | From |
|---|---|---|---|---|---|
| Base rail, front | 84 | 4 | 3/4 | 1 | Run: Sink wall |
| Base rail, back | 84 | 4 | 3/4 | 1 | Run: Sink wall |
| Base sleeper | 24 − 3 − 1 1/2 = **19 1/2** | 4 | 3/4 | (84 − 3/4) ÷ 24 = 3.5 → 4, + 1 = **5** | Run: Sink wall |
| Kick skin | 84 | 4 | 1/4 | 1 | Run: Sink wall |

*Example, a run over the maximum:* 36 + 36 + 30 + 24 = 126", so 2 sections.
An equal split would join at 63"; the nearest seam is 72" (after the second
cabinet), and 72 and 54 are both within 96", so the sections are **72" and
54"**. Each gets 4 sleepers ((72 − 3/4) ÷ 24 = 2.97 → 3, + 1; (54 − 3/4) ÷ 24
= 2.2 → 3, + 1).

Run parts appear on the cut list with the run as their reference
("Run: Sink wall") instead of a cabinet label. Listed by cabinet, each run gets
its own section after the cabinets; a cabinet's own platform is listed with
that cabinet.

#### A2: leveling legs

Each base box stands on leveling legs, with a clip-on kick board in front.
There are no rails or sleepers to cut.

- **Kick board:** W long × k × p, one per base cabinet (it covers the cabinet's
  full width).
- **Legs:** 4 per box, or 6 on a box **wider than 36"** (both settings), times
  the quantity. One **kick clip** per front leg (half the legs). These are
  hardware, not on the cut list.

*Example:* the base cabinet at the top of this page on legs has the same box
parts plus a kick board **30 × 4 × 3/4**, 4 legs and 2 clips. A 42" cabinet
gets 6 legs and 3 clips. Wall cabinets: no change.

### Method B: frameless with an integral toe kick

The base cabinet's **sides run to the floor**: side length = **H − c**. Each
side has a notch at the front bottom, **k tall × kd deep**, for the toe kick.
The bottom still sits at the top of the kick, so the back, bottom, top, front
and shelves are the same as method A. A **kick board** fits between the sides:
**W − 2p** long × k × p, set back kd.

A finished end runs to the floor too, so **its laminate is full height**:
(H − c) + 2" long × D + 2" wide, with the same k × kd notch. (The laminate's
outline is 1" past every edge, and so is its notch, so the notch keeps the same
size.) The front laminate still covers the box only.

*Example:* base 30 W × 36 H × 24 D, 1 shelf, left end finished.

| Part | Length | Width | Thickness | Qty | Note |
|---|---|---|---|---|---|
| Back | 30 1/2 | 30 | 3/4 | 1 | |
| Bottom | 28 1/2 | 23 1/4 | 3/4 | 1 | |
| Left side | 36 − 1 1/2 = **34 1/2** | 23 1/4 | 3/4 | 1 | notched 4 × 3 |
| Right side | 34 1/2 | 23 1/4 | 3/4 | 1 | notched 4 × 3 |
| Top | 28 1/2 | 23 1/4 | 3/4 | 1 | |
| Kick board | 30 − 1 1/2 = **28 1/2** | 4 | 3/4 | 1 | |
| Front (door/laminate size) | 30 1/2 | 30 | 3/4 | 1 | |
| Shelf | 28 1/4 | 23 1/8 | 3/4 | 1 | |
| Laminate, left side | 34 1/2 + 2 = **36 1/2** | 26 | none | 1 | notched 4 × 3 |
| Laminate, front | 32 1/2 | 32 | none | 1 | |

*Wall cabinets* are the same as method A: the 30 × 30 × 12 [wall cabinet
table](#wall-cabinets) holds for method B unchanged.

The cut list shows the notch on the line ("Left side / Right side (notched
4 × 3)"). A notched part never merges with a plain part of the same size,
because it is a different cut.

### Where a notch is measured from

Notches (and later dadoes and holes) are stored in **part coordinates**, which
the drawing and the DXF files read:

- The part lies flat. **Length** runs along x, from 0 to the part's length;
  **width** along y, from 0 to its width.
- x = 0 is the part's **start**: the bottom edge of a part that stands up in
  the cabinet (sides, back, laminate), the left end of one that lies across it.
- y = width is the **front** edge, the one facing the room; y = 0 is the back.
- Left and right parts use the same coordinates; a drawing of a part's outside
  face mirrors one of them.

Method B's notch is at the **start-front** corner: x from 0 to k, y from
(width − kd) to width.

### Choosing a method

The method is chosen when a job is created (prompt 10 adds the choice to the
New job dialog and Settings). Settings a method doesn't use are kept, so
switching back restores them.

---

## Tall cabinets

A tall cabinet (pantry, oven, utility, broom closet) **stands on the floor**
like a base cabinet but **has no countertop**. Two facts decide everything
about a cabinet's type:

| Type | Stands on the floor | Has a countertop | Box height |
|---|---|---|---|
| Base | yes | yes | H − k − c |
| Tall | yes | no | **H − k** |
| Wall | no | no | H |

The overall height must be more than the toe kick.

The box is built with the same formulas as every other cabinet (back, bottom,
sides, front, shelves, laminate), using the tall box height. Differences:

- **The top is always a full panel.** Two stretchers are for base cabinets
  only, under a countertop.
- **Under the box**, the tall cabinet is treated exactly like a base cabinet:
  - **A1, ladder base:** it stands on its run's platform with the base
    cabinets, and counts in the platform length. A tall cabinet with no run
    gets its own platform. A run that mixes depths gets a base sized for the
    shallowest, as before.
  - **A2, legs:** legs and kick clips per tall box, as for base, and a
    W × k × p kick board.
  - **B, integral kick:** the sides run the **full overall height H**
    (there is no countertop to stop under), notched k × kd at the front
    bottom, with a W − 2p kick board between them. A finished end's laminate
    runs to the floor too: H + 2" long × D + 2", notched the same way. The
    front laminate covers the box only.

### Fixed shelves

A tall cabinet can have **fixed shelves**: structural panels fastened like the
bottom, which keep the sides straight over the height and split the cabinet
into sections.

- **Length** = W − 2p (between the sides, like the bottom). No shelf clearance.
- **Width** = from the cabinet front to the face of the back: **D − tb** with
  an applied back or a rabbet back, **D − i − tb** with a dado back. No setback.
  (With an applied back this is the same as the bottom.) The back sits in
  grooves in the sides, top and bottom only; the fixed shelf has **no groove**
  and stops at the back.
- **Thickness** = p, the box panels (not the shelf thickness, and the
  wide-shelf rule does not apply). Cut from the **Box** material.
- **Where they go:** spaced evenly. The inside of the box is box height − 2p
  tall; take away p for each fixed shelf and divide the rest equally among
  the **sections** (n fixed shelves make n + 1 sections). Sections are rounded
  down to 1/64"; the top section takes what is left over.
- Every section must be **taller than two panel thicknesses**.
- **How many to start with:** a new tall cabinet whose **box is taller than
  72"** (the setting *fixed shelf above*) starts with 1 fixed shelf; otherwise
  0. You can change the count on any tall cabinet, and changing the height
  later never changes it.
- **Adjustable shelves** keep the usual shelf size. They are shared evenly
  among the sections; when they don't divide evenly, the extra ones go in the
  lowest sections (5 shelves and 1 fixed shelf: 3 below, 2 above).

### Mid nailer (inset backs)

With an inset back and at least one fixed shelf, a tall cabinet gets a
**second nailer**, under the lowest fixed shelf, so the back can be screwed at
mid-height too. It is the same size as the top nailer: **W − 2p** × nailer
width × p. It can be turned off per cabinet. Applied backs have no nailers.

### Split back

A tall back can be longer than the back material's sheet. A **split back** is
cut as **two pieces that join at the middle of the lowest fixed shelf**, so
each piece has half the shelf's thickness to fasten to. It needs at least one
fixed shelf.

Let **s** = the height of one section, and **J** = p + s + p/2 (the joint,
measured up from the bottom of the box, rounded down to 1/64").

| Back | Lower piece | Upper piece | Width |
|---|---|---|---|
| Applied | **J** | box height − J | W |
| Inset (dado or rabbet) | J − p + g | box height − p + g − J | W − 2p + 2g |

Each inset piece sits in its own groove at its outer end (the bottom or the
top); the joint itself is a butt joint behind the shelf. Either way the two
pieces add up to the one-piece back.

KERFuffle warns when any part of a tall cabinet is longer than the sheet of the
material it is cut from, and suggests a split back when the part is the back.

### Worked example

Tall 18 W × 84 H × 24 D, 4 adjustable shelves, 1 fixed shelf, left end
finished, method A1, 3/4" applied back. Box height = 84 − 4 = **80"**.
Inside = 80 − 1 1/2 = 78 1/2; less the fixed shelf, 77 3/4, so each section
is **38 7/8"**.

| Part | Length | Width | Thickness | Qty |
|---|---|---|---|---|
| Back | 80 | 18 | 3/4 | 1 |
| Bottom | 16 1/2 | 23 1/4 | 3/4 | 1 |
| Left side | 80 | 23 1/4 | 3/4 | 1 |
| Right side | 80 | 23 1/4 | 3/4 | 1 |
| Top | 16 1/2 | 23 1/4 | 3/4 | 1 |
| Front (door/laminate size) | 80 | 18 | 3/4 | 1 |
| Shelf | 16 1/4 | 23 1/8 | 3/4 | 4 (2 in each section) |
| Fixed shelf | 16 1/2 | 23 1/4 | 3/4 | 1 |
| Laminate, left side | 82 | 26 | none | 1 |
| Laminate, front | 82 | 20 | none | 1 |

Its own ladder base (no run): rails 18 × 4 × 3/4, sleepers 19 1/2 × 4 × 3/4
((18 − 3/4) ÷ 24 = 0.7 → 1, + 1 = **2**), kick skin 18 × 4 × 1/4.

*With a split back:* J = 3/4 + 38 7/8 + 3/8 = **40**, so the back is two
pieces, 40 × 18 and 80 − 40 = 40 × 18.

*With a 1/4" back in a 1/4" dado set in 3/4":* the back is 80 − 1 1/2 + 1/2 =
**79** × 16 1/2 + 1/2 = **17**; sides, top and bottom are 24 deep; the fixed
shelf stops at the back, 24 − 3/4 − 1/4 = **23** wide; shelves are 22 7/8 wide;
two nailers 16 1/2 × 4. Split, the back is 40 − 3/4 + 1/4 = **39 1/2** and
80 − 3/4 + 1/4 − 40 = **39 1/2**.

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
| Construction method | A, frameless on a separate base | Plan decision D1. Jobs from before methods are A1 with the base left off. |
| Back | Applied, full width | Today's box. Or inset in a dado, or in a rabbet. |
| Back thickness | Same as the panels (3/4") | Today's box. Set it (e.g. 1/4") for an inset back. |
| Back groove depth (inset backs) | 1/4" | KERFuffle's starting value; please confirm. |
| Back dado inset (dado backs) | 3/4" | KERFuffle's starting value, room for a nailer behind the back; please confirm. |
| Nailer width (inset backs) | 4" | KERFuffle's starting value; please confirm. |
| Base top | Full panel | Today's box. Or two stretchers. |
| Stretcher width | 4" | Plan decision D5 |
| Kick depth | 3" | Plan decision D5 |
| Base type (method A) | A1, ladder base | Plan decision D2. Or A2, leveling legs. |
| Sleeper spacing, most (A1) | 24" center to center | Plan §1.3 |
| Platform length, most (A1) | 96" | Plan §1.3 |
| Kick skin thickness (A1) | 1/4" | KERFuffle's starting value; please confirm. |
| Legs per box (A2) | 4, or 6 on boxes over 36" wide | Plan §1.3 |
| Fixed shelf above (tall cabinets) | A new tall cabinet with a box taller than 72" starts with 1 fixed shelf | Prompt 20; please confirm. Only sets the starting count. |

The toe-kick height above is also the kick height for every method: rail and
sleeper height (A1), kick board height (A2, B) and notch height (B).

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

### Construction methods: judgment calls to check

KERFuffle had to decide these to build the methods. Each one is a guess at
shop practice until you confirm it.

| # | Question | What KERFuffle does now |
|---|---|---|
| M1 | **Sleeper count:** is "no gap over 24" center to center, one at each end" how you lay out sleepers? Do you also want one under every cabinet seam? | End sleepers flush with the rail ends; (L − p) ÷ 24, rounded up, + 1. No extra sleepers at seams. |
| M2 | **Platform splits:** a long run is cut into the fewest sections within 96", each joint moved to the nearest cabinet seam that still fits. Is a seam always better than an equal split, however far it moves? | Always prefers a seam that fits; e.g. 126" splits 72 + 54, not 63 + 63. |
| M3 | **Kick skin:** one piece per platform section, joints at the same place as the platform's? Thickness 1/4"? Does it wrap a finished end? | One skin per section, section length, 1/4" thick, no return at the ends. |
| M4 | **Ladder base ends:** flush with the outside of the end cabinets, even at a finished end? | Flush; platform length = the widths added up. |
| M5 | **Mixed depths in one run:** size the base for the shallowest cabinet? | Shallowest, with a warning on the cut list. |
| M6 | **A2 kick board:** full cabinet width per cabinet, cut on site to fit? | W × k × p per base cabinet. |
| M7 | **A2 kick clips:** one per front leg? | Half the legs, rounded up. |
| M8 | **B kick board:** between the sides (W − 2p), the same panel stock? | Yes. |
| M9 | **Inset backs:** groove cut in all four members (sides, top and bottom), top and bottom full depth? Groove 1/4", dado inset 3/4", nailer 4"? | Yes, with those defaults. The nailer is the only one; walls get no second rail at the bottom. |
| M10 | **Method B back:** stops at the bottom (box height), not at the floor? | Box height, the same as method A. |
| T1 | **Fixed shelf spacing:** fixed shelves spaced evenly up the inside of a tall box? Or at a set height (e.g. counter height)? | Evenly spaced; the top section takes the 1/64" left over. |
| T2 | **Fixed shelf depth:** stops at the face of the back, no groove, no setback? | Yes. Banded on its front edge like the bottom. |
| T3 | **Split back joint:** the two pieces meet at the middle of the lowest fixed shelf? An inset back gets one groove allowance on each piece (at its outer end), not a groove in the shelf? | Yes to both; the pieces add up to the one-piece back. |
| T4 | **Mid nailer:** one, under the lowest fixed shelf, only with an inset back? | Yes, on by default; can be turned off per cabinet. |

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
| A1, one run of three base cabinets (84") | Ladder base per run: rails, 5 sleepers, kick skin; a wall cabinet in the run gets no base | unconfirmed |
| A1, a 126" run plus a cabinet with no run | Splitting at a cabinet seam (72 + 54); a cabinet's own platform | unconfirmed |
| A2, base on legs | Clip-on kick board; 4 legs, or 6 over 36" | unconfirmed |
| B, base with a finished end | Sides to the floor with the kick notch; full-height notched end laminate; kick board | unconfirmed |
| Inset back with stretchers | Dado back, full-depth members, nailer, stretchers instead of a top, shelf depth | unconfirmed |
| Tall cabinets, A1 | Tall box height, fixed shelves (0, 1, 2), split back, inset back with a mid nailer; one ladder base under a run of base and tall cabinets | unconfirmed |
| Tall cabinets, A2 | Legs and kick board under a tall box | unconfirmed |
| Tall cabinets, B | Sides and end laminate the full height, notched; kick board | unconfirmed |

The construction-method examples live in `engine/fixtures/methods/`.
