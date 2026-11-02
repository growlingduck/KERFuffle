# Prompt 11 — Materials and Purchase Estimate

> Paste everything below the line into a fresh coding-agent session at the repo root.
> Prerequisites: prompts 01–10 are done.
> Prerequisite reading for the agent: `docs/plan-methods-optimizer-costing.md`
> (§3), `docs/interaction-design.md`.

---

## Goal

Know what every part is cut from, and what the job's materials cost to buy. This
is a **shop purchase estimate**: sheets × price, plus method hardware. There's no
markup, labor, tax or customer quote.

## Part 1: materials catalog

- Add a `materials` table in a forward migration. The kinds are sheet goods,
  laminate, edge banding and hardware. Each material has kind-specific fields
  (plan §3.1), supplier, SKU, notes, an optional **on hand** count, an archived
  flag, and a price that can be empty.
- Seed the standard materials from plan §3.1 on first run, with **no prices**.
  Don't invent prices.
- Settings → **Materials**:
  - a list filtered by kind;
  - **Add material** opens a form that shows only the fields for the chosen kind;
  - duplicate, edit and archive;
  - a material can't be deleted while a job uses it;
  - unpriced materials show "needs a price".
- Sheet sizes are the real size (49 × 97 is allowed). Grain is "none" or "along
  length".

## Part 2: material slots and job assignment

- The engine reports each part's **slot**, which the method from prompt 09
  declares.
- A job stores the material chosen for each slot (JSON on the job, like
  `rules_json`), starting from shop defaults set in Settings. It keeps a snapshot
  of each material's name, size, grain and price.
- Change materials from the Cut list screen, per slot.
- The cut list groups by **material** instead of by thickness. Group titles show
  the material name and thickness. Marks don't change.
- If a slot's material thickness doesn't match the rules (e.g. 23/32″ ply but a
  3/4″ panel rule), show a warning, the same way the shelf warning works.
- Backups and `.kerfjob` files carry the assignment and snapshot.

## Part 3: estimate (area-based)

- A pure engine function, `estimate(cutList, materials, options)`:
  - **Sheet goods and laminate:** total part area ÷ usable sheet area (sheet
    minus edge trim) × (1 + waste %), rounded up. The waste default is 15%, as a
    shop setting.
  - **Edge banding (methods A and B):** the exposed front edges the method
    declares (sides, top or stretchers, bottom, shelves), in feet, rounded up.
  - **Hardware (A2):** legs and kick clips per box from the method's rule.
  - **Never** hinges, slides, pulls, screws or glue.
- Each line shows material · needed · on hand · to buy · price · cost. A job
  total follows.
- Sheet counts are labeled **"≈ (area + 15% waste)"**. They are not exact. Prompt
  13 replaces them with counts from the layout.
- If any line uses an unpriced material, the total says "Incomplete: 2 materials
  need a price" instead of giving a number.
- Prices are snapshotted, with "prices as of …" shown. **Update prices** pulls
  current catalog prices and is never done silently.

## Part 4: output

- An **Estimate** panel on the Cut list screen.
- A printable one-page estimate with the same title block and print rules.
- An estimate CSV, in the same format as the cut-list CSV (UTF-8 with BOM,
  header comment row).

## Done when

- The catalog is seeded, and the add form works for each kind.
- The sample job's estimate matches a hand calculation recorded in a test.
- Existing jobs open with default materials, and their cut lists are unchanged
  apart from group titles.
- An older `.kerfjob` imports. A job exported with materials round-trips.

## Out of scope

Layout-based sheet counts (13), subtracting inventory automatically, offcut
inventory, markup or customer quotes.
