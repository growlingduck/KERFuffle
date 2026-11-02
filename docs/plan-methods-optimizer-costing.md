# Plan: Construction Methods, Sheet Optimizer, Material Estimate, CNC Output

Status: **decided, 2026-11-01.** The shop's answers are recorded in
[§6](#6-decisions). The build prompts are
[`prompts/09`–`14`](../prompts/README.md).

This plan covers four features that depend on each other:

1. Construction methods (chosen when a job is started)
2. Cut-list sheet optimizer (yield, grain, or time; with offset sensitivity)
3. Material purchase estimate
4. A path from the optimizer to CNC files (DXF now, machine code later)

They share two foundations that don't exist yet: **materials** (what each part
is cut from) and **richer parts** (parts that know their material, and later
their machining). Those come first.

---

## 0. What the app does today

The current formulas already describe a specific construction:

- **Frameless box**: full-width 3/4″ back, sides in front of the back, top and
  bottom between the sides, full top panel.
- **Detached toe kick**: base box height = overall − toe kick − countertop, and
  the sides stop at the box. The kick base itself is **not** on the cut list.
- Fronts are full-overlay door blanks the size of the box face, with no reveals.

So "frameless on a separate base" is the method the shop uses now. Existing jobs
are given that method without changing a single number (see §1.4).

---

## 1. Construction methods

### 1.1 Methods

| # | Method | Base cabinet | Wall cabinet |
|---|---|---|---|
| A | **Frameless on a separate base** (today's method, the default) | Plain rectangular box on a detached base. Box height = H − kick − countertop. | Plain box, full height. |
| B | **Frameless with integral toe kick** | Sides run to the floor with a kick notch at the front bottom (kick height × kick depth). Bottom sits above the kick. A kick board fits between the sides. | Same as A. |
| C | *Face frame*: **deferred** | — | — |

Method A has two base options. The shop picks one per job, and **A1 is the
default**:

- **A1, ladder base**: front rail and back rail (kick height tall), with
  sleepers between them at a set maximum spacing. The front rail is set back by
  the kick depth. A finished kick skin is listed for the exposed face.
- **A2, adjustable legs**: leveling legs (a set number per box, more over a set
  width) with a clip-on kick board. No rails to cut. The legs and clips are
  counted as method hardware (§3.3).

**Face frame later.** Methods are written as a registry: each method is one
module that declares its settings, part generators, material slots, visible
parts and hardware. Adding C later means adding one module plus a 1D lumber
optimizer (§2.8). Nothing in A or B should assume every part is sheet goods. The
part category type already allows a third value.

### 1.2 Per job, not per cabinet

The method is chosen once, when the job is created, and every cabinet in the job
uses it. Base and wall cabinets each have their own settings inside the method.

- The engine takes the method as an input for each cabinet, so an override per
  cabinet could be added later with only UI work. That UI is not built now.
- The method can be changed while the job is in **Draft**, as one undoable step
  that reports how many parts changed. From **Ready to cut** onward it's locked.
  Duplicate the job to try another method.

### 1.3 Settings and parts

Every structural choice is a setting with a default:

| Setting | Options | Default |
|---|---|---|
| Back | applied full width · inset in a dado · inset in a rabbet | applied |
| Back thickness | any | 3/4″ |
| Base top | full panel · two stretchers | full panel |
| Stretcher width | any | 4″ |
| Kick height | any | 4″ (today) |
| Kick depth | any | 3″ |
| Base type (A only) | ladder base (A1) · legs (A2) | A1 |
| Sleeper spacing, max (A1) | any | 24″ |
| Platform length, max (A1) | any | 96″ |
| Legs per box, legs over width (A2) | any | 4, 6 over 36″ |

A thin back (dado or rabbet) adds a **nailer/hanging rail** at the top of the
box, with a settable width.

New part roles (lengths still run with the grain):

| Role | When |
|---|---|
| `stretcher-front`, `stretcher-back` | Base top = stretchers |
| `nailer` | Back is inset |
| `kick-board` | B, and A2 (the clip-on board) |
| `base-rail-front`, `base-rail-back`, `base-sleeper` | A1, generated **per run** |
| `kick-skin` | A1 |

**Runs.** A run is a straight row of base cabinets that shares one ladder base.
A room can contain several runs, so runs are their own field, not `room`.

- Each cabinet gets an optional **run** label (e.g. "Sink wall"). The cabinet
  list can group by run.
- The base cabinets in a run, in list order, share one platform. Its length is
  the sum of their widths.
- A platform longer than the maximum length is split into equal sections, with
  joints at cabinet seams where possible.
- A base cabinet with no run gets its own platform.
- Run parts appear in the cut list with the run as their reference
  (e.g. "Run: Sink wall") instead of a cabinet label.

**Laminate follows the method.** With an integral kick (B), a finished end runs
to the floor, so its laminate is the full height with the notch. With a detached
base (A), the end laminate covers the box only, and the kick skin or kick board
is listed separately.

### 1.4 Engine and data changes

- `ConstructionRules` gains a `method` block holding the settings above. It
  stays inside the job's rules snapshot, so it is versioned, backed up and moved
  with `.kerfjob` files automatically.
- `RULES_VERSION` goes from 1 to 2 (TypeScript and Rust). Version 1 jobs are
  upgraded to **A1, with the base left off, applied 3/4″ back and a full top**.
  "Base left off" is a v1-only flag that reproduces today's cut list exactly. The
  existing golden fixtures must pass unchanged after the upgrade.
- `calculate.ts` becomes one shared box calculator plus a part generator per
  method.
- A job-level step, `jobParts(cabinets, rules)`, makes the run parts.
  `buildCutList` merges cabinet parts and run parts.
- `Part` gains an optional `features` list. Method B's toe-kick notch is the
  first entry. The saw output ignores features. They exist for the drawing and
  for DXF (§4).
- `docs/calculation-rules.md` gets a section per method, with worked examples and
  golden fixtures marked *unconfirmed*.

### 1.5 UI

- **New job dialog**: a Construction choice with a small diagram per method.
  It defaults to the shop default.
- **Settings**: the default method and every setting above, with a detail
  drawing.
- **Workspace**: a run field on base cabinets. The drawing shows the kick notch,
  stretchers, inset back or base.
- The cut list title block and CSV header name the method.

---

## 2. Sheet optimizer

### 2.1 What it does

It takes the cut list, expands it into individual pieces, groups them by
material, and lays them out on stock sheets. The output is one layout per
material: sheets, where each piece goes, the cut sequence, and the offcuts.

The first version is for **table saws and panel saws**: every cut is a
**guillotine** cut (rip to strips, crosscut the strips, trim if needed). Router
nesting comes later (§4).

### 2.2 Saw profiles

Cutting settings are kept as **saw profiles** in Settings. A job picks one, and
keeps a copy of it, like the rules.

| Field | Table saw default | Panel saw default |
|---|---|---|
| Kerf | 1/8″ | 1/8″ |
| Edge trim, each sheet edge | 1/4″ | 1/4″ |
| Smallest piece that can be cut safely | 2″ | 2″ |
| Smallest offcut worth keeping | 12″ × 12″ | 12″ × 12″ |
| First cut | rip along length | either |

All of these can be changed, and the shop can add more profiles. Both kerfs start
at 1/8″ and should be checked against the real blades.

### 2.3 The three modes

| Mode | Optimizes for | Rules |
|---|---|---|
| **Cost** | Fewest sheets, then the largest reusable offcuts, then fewest cuts. | Pieces may rotate unless their material has grain. |
| **Grain** | Grain direction is correct on every grained piece. | Rotation locked for grained materials. Visible pieces are placed first. |
| **Time** | Fewest **fence settings** (distinct rip widths), fewest crosscut stop settings, fewest **distinct sheet patterns**, fewest cuts. | Strip layouts only. May use more sheets than Cost mode, up to a limit in the profile (default: 1 extra sheet per material). |

Every result shows all the measures (sheets, yield %, fence settings, patterns,
cuts), whichever mode is chosen.

**Grain sequencing** (keeping a run's fronts together and in order so the grain
flows) is a **later follow-up**. Leave room for it: each piece already knows its
cabinet, run and visibility.

### 2.4 Offset sensitivity

Small allowances (kerf, edge trim, laminate oversize, shelf clearance) add up
across a strip, and a 1/16″ can decide whether 4 pieces fit across a sheet or 3.

**Example:** wall cabinets 12 3/4″ deep have 12″ wide sides. Four of them are
exactly 48″, so with any kerf only **3 fit across a sheet**. At 12 1/2″ deep the
sides are 11 3/4″: 4 × 11 3/4 + 3 kerfs + trim = 47 7/8″, so **4 fit**.

After the main result is shown, the optimizer re-runs in the background:

1. **Near misses (could save a sheet):** each allowance is reduced in small steps
   (1/64″ up to 1/8″), and the tightest pieces are shrunk slightly. A saving is
   reported in plain words, e.g. *"Reducing edge trim from 1/4″ to 3/16″ saves 1
   sheet of 3/4″ birch ply."* These are suggestions only. Nothing changes on its
   own.
2. **Fragile layouts (could cost a sheet):** strips with almost no slack are
   flagged, e.g. *"Strip 3 on sheet 2 has 1/32″ left. A kerf over 5/32″ won't
   fit."* This is checked by re-running with each allowance increased.
3. **Light last sheet:** e.g. *"Last sheet is 18% used (3 pieces)."*

### 2.5 Engine design

- New pure module `engine/src/nesting/`. It's deterministic: a seeded random
  number generator means the same inputs always give the same layout.
- Algorithm:
  - A fast first layout: guillotine best-fit for Cost and Grain, strip packing
    for Time.
  - Then a time-limited improvement search that keeps the best result. The best
    so far is reported as it improves.
- Every sheet keeps an explicit **cut tree** (rip → crosscut → trim). It gives
  the saw's cut order and the fence-setting count, and later the DXF and toolpath
  order.
- Runs in a **Web Worker**. Target: first layout for the 40-cabinet stress
  fixture in under 1 s, final result in under 5 s. The interface allows a later
  move to Rust if needed.
- Property tests on every result:
  - no overlaps;
  - everything inside the trimmed sheet;
  - kerf between neighbors;
  - grain respected;
  - every piece placed once;
  - the same output for the same input.

### 2.6 Layouts are kept once a job is Ready to cut

In **Draft**, layouts are recalculated freely, and the result is cached by input.
When the job is marked **Ready to cut** (or a layout is printed), the layout is
saved with the job, along with the algorithm version. Reopening shows the saved
layout. If the inputs have changed since, the screen says so and offers
**Recalculate**.

### 2.7 Screen and printout

- A new **Layouts** tab on the Cut list screen ("Sheets" already means printed
  pages there).
- The tab has:
  - a mode switch (Cost · Grain · Time);
  - a saw profile picker;
  - one diagram per sheet pattern, with "× N";
  - the sensitivity notes.
- Pieces are labeled with their cut-list marks and trace back to the cut list
  on hover.
- Printout: dimensioned rips in cut order, tick boxes per sheet, black and white,
  the same page rules as the cut list.

### 2.8 Solid stock (face frame, later)

When face frame is added, its lumber needs a 1D optimizer: lengths from boards,
with kerf and end trim. It goes in the same module.

---

## 3. Material purchase estimate

This is a **shop estimate**: what the job's materials cost to buy. It is not a
customer quote, so there's no markup, labor, tax or used-area costing.

### 3.1 Materials catalog

The materials catalog lives in Settings, and new installs start with standard
materials already filled in:

| Material | Kind | Size | Grain |
|---|---|---|---|
| Birch plywood 3/4″ | sheet | 48 × 96 | along length |
| Birch plywood 1/2″ | sheet | 48 × 96 | along length |
| Birch plywood 1/4″ | sheet | 48 × 96 | along length |
| Maple plywood, prefinished 3/4″ | sheet | 48 × 96 | along length |
| Melamine, white 3/4″ | sheet | 49 × 97 | none |
| MDF 3/4″ | sheet | 49 × 97 | none |
| Plywood 1″ (shelves) | sheet | 48 × 96 | along length |
| HPL laminate | laminate | 48 × 96 | along length |
| HPL laminate | laminate | 60 × 144 | along length |
| PVC edge banding 15/16″ | banding | per foot | — |
| Leveling leg, kick clip | hardware | each | — |

The seeded materials have **no price**. Prices vary too much by supplier and
region to guess, so each material shows "needs a price". An estimate that uses an
unpriced material says so instead of showing a wrong total.

**Adding a material** uses a form that asks only for what matters to its kind:

| Kind | Fields |
|---|---|
| Sheet goods | name, thickness, sheet length × width (the real size), grain (none / along length), price per sheet |
| Laminate | name, sheet length × width, grain/pattern direction, price per sheet |
| Edge banding | name, width, price per foot (or roll length and roll price) |
| Hardware | name, unit, price each |
| All kinds | supplier, SKU, notes, **sheets on hand** (optional) |

Materials can be duplicated (to make "same ply, different supplier" quick),
edited, and archived. A material can't be deleted while a job uses it.

**On hand (inventory).** Each sheet material has an optional count of full
sheets in stock. The estimate shows *needed*, *on hand* and *to buy*, and costs
only the sheets to buy. The count is edited by hand. Automatically subtracting
sheets when a job is completed, and tracking offcuts, are later features. The
data model leaves room for both.

### 3.2 Which material each part uses

Each method declares **material slots**:

- **box**: sides, top or stretchers, bottom;
- **back**;
- **shelves**;
- **base/kick**: rails, sleepers, kick board;
- **kick face**: the kick skin;
- **laminate**.

Each part role maps to one slot. A job assigns one catalog material to each slot,
starting from the shop's defaults, and keeps the assignment as a snapshot. The
cut list then groups by material instead of by thickness. Thickness is still
shown.

The job's material thickness must match the rules: if the box slot uses 23/32″
ply, the panel thickness rule should agree. A mismatch is shown as a warning,
the same way the shelf-thickness warning works today.

### 3.3 What gets counted

- **Always:** sheet goods and laminate.
- **When the method needs it:**
  - Edge banding (frameless, A and B): by length, on the exposed front edges of
    sides, top or stretchers, bottom and shelves, rounded up to the foot.
  - A2: legs and kick clips, per box.
- **Never:** hinges, slides, pulls, screws, glue.

### 3.4 Counting sheets

| Basis | When | Shown as |
|---|---|---|
| **From the layout** | The optimizer has run (prompt 13 onward) | "7 sheets." Exact for that layout. |
| **From area** | Before that, or as a quick check | "≈ 7 sheets (area + 15% waste)." Clearly marked as an estimate. |

Each material line shows: sheets needed · on hand · to buy × price = cost. A
total for the job follows.

### 3.5 Prices change

A job keeps the prices it was estimated with and shows "prices as of
2026-11-01". **Update prices** pulls the current catalog prices into the job.
It's never done silently.

### 3.6 Output

The estimate appears as an **Estimate** panel on the Cut list screen, a
printable one-page estimate, and a CSV.

---

## 4. Path to CNC output

There's no CNC now. The goal is that CNC can be added later without a rewrite,
with DXF as the first output.

These are built in from the start:

1. **Parts carry features** (§1.4): notches now; dadoes, rabbets and hole
   patterns as methods need them.
2. **The optimizer's output doesn't depend on any machine.** Sheets → placed
   parts → outlines + features + cut tree. The saw printout and DXF are both just
   readers of it, and a G-code post-processor would be a third.
3. **Layouts are saved with the algorithm version** (§2.6), so a file can always
   be regenerated exactly.
4. **Spacing is a function of the cutting mode.** Saw mode uses the kerf. A
   future router mode would use bit diameter plus clearance and allow
   non-guillotine nesting. Only saw mode is built now, but nothing assumes kerf
   is the only spacing rule.

**DXF export (prompt 14):** one DXF per sheet, in real units, with named layers:

| Layer | Contents |
|---|---|
| `SHEET` | Sheet outline and trim line |
| `OUTSIDE_CUT` | Part outlines, including notches |
| `POCKET_<depth>` | Dadoes and rabbets (when a method has them) |
| `DRILL_<dia>` | Holes (when a method has them) |
| `LABEL` | Part mark and cabinet as text |

The DXF must open correctly in common CAD/CAM viewers. It's also useful without
a CNC, as a cutting diagram for other tools.

**Later, not planned in detail:** part labels with barcodes, router mode, G-code
post-processors per controller (tool library, feeds, tabs, bed and safe-Z
checks, toolpath preview), and free-form nesting.

---

## 5. Build order

| # | Prompt | Delivers |
|---|---|---|
| 09 | [Construction methods: engine](../prompts/09-construction-methods-engine.md) | Method registry, A1/A2/B, settings, rules v2 + upgrade, run parts, `features`, fixtures, rules doc |
| 10 | [Construction methods: UI](../prompts/10-construction-methods-ui.md) | New job choice, Settings, run field, drawings, change method in Draft |
| 11 | [Materials and estimate](../prompts/11-materials-and-estimate.md) | Catalog + form + on hand, slots, group by material, area-based estimate, edge banding, hardware |
| 12 | [Sheet optimizer: engine](../prompts/12-sheet-optimizer-engine.md) | `nesting/`, saw profiles, three modes, cut tree, sensitivity, worker |
| 13 | [Layouts: screen and print](../prompts/13-layouts-screen-and-print.md) | Layouts tab, printout, saved layouts, estimate switches to layout counts |
| 14 | [DXF export](../prompts/14-dxf-export.md) | DXF per sheet from the saved layout |

**Database:** prompts 09–13 each add a forward migration as needed. All of it
must be carried by backups and `.kerfjob` transfer, and an older app must refuse
a newer file with the existing "made by a newer version" message. The migrations
add:

- a `run` column on cabinets (09);
- the `materials` catalog and saw profiles (11, 12);
- the job's material assignment and saw profile, as JSON on the job like
  `rules_json` (11, 12);
- a `layouts` table: job, material, input hash, algorithm version, layout JSON
  (13).

---

## 6. Decisions

Answered by the shop on 2026-11-01.

| # | Question | Decision |
|---|---|---|
| D1 | Which methods? | A and B now. C (face frame) maybe later, so keep methods pluggable. |
| D2 | Detached base type? | Both ladder base (A1) and legs (A2), as an option. A1 is the default. |
| D3 | Platforms per run or per cabinet? | Per **run**, up to a maximum length. Runs are their own field, because a room can have several runs. |
| D4 | Back and top? | Configurable. Defaults: full top, 3/4″ applied back. |
| D5 | Kick depth, stretcher width? | Configurable. Defaults: 3″, 4″. |
| D6 | Saw and kerf? | Table saw and panel saw. Kerf and trim configurable, with defaults (saw profiles). |
| D7 | Materials? | Seed standard materials, with a form to add more and an optional on-hand count. |
| D8 | Grain mode? | Direction first. Sequencing is a later follow-up. |
| D9 | Estimate type? | Material purchase cost (sheets × price) for the shop, not a customer quote. |
| D10 | CNC? | DXF first. Keep CNC easy to add later. No machine now. |
