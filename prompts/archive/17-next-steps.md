# Prompt 17 — Pointing to the Next Step

> Paste everything below the line into a fresh coding-agent session at the repo root.
> Prerequisites: prompts 01–16 are done.
> Prerequisite reading for the agent: `docs/interaction-design.md` (§5, §7).

---

## Goal

The workflow is **job → cabinets → parts → cut list → print**, but the screens
don't say where to go next. Each screen should make the next step obvious, and
every empty or blocked view should say what's missing and link straight to
where it gets fixed.

## Part 1: workspace → cut list

- The parts panel already has a small cut-list link. When the job has at least
  one valid cabinet, turn it into a clear **Cut list →** button showing Ctrl+L
  in its tooltip. While any cabinet needs a fix, say so next to it ("1 cabinet
  needs a fix"). Never block opening the cut list.

## Part 2: empty and blocked views on the cut list

Go through every empty or not-ready state on the Cut list, Layouts and Estimate
views, and in the materials and saw profile panels. For each one, name what's
missing and give a direct link or action:

- no cabinets → **Back to the workspace**;
- no materials in the catalog → **Settings → Materials** (already done in
  `MaterialsPanel`; use it as the pattern);
- parts with no material assigned → focus the materials panel;
- no saw profile → **Settings → Saw profiles**, or pick one;
- an estimate with no prices → say which materials have no price.

Settings links must open the right section, not just the Settings screen. List
every state you changed in your summary.

## Part 3: say what Ready to cut does

Construction locks once a job is no longer a draft (`constructionLocked`), and
right now people only find out from a disabled button.

- Wherever a draft job can be marked ready (the header status control, and
  **Mark as** on the Jobs screen), the **Ready to cut** item gets a hint line:
  *"Locks construction"*.
- The toast after marking a draft ready says *"Marked ready to cut. Construction
  is locked."* and keeps **Undo**.
- No confirmation dialog.

## Done when

- A job with one valid cabinet shows **Cut list →** in the parts panel, and
  Ctrl+L still works.
- Each empty state listed above has a test that checks its text and its link
  target.
- Marking a draft ready shows the lock hint and the new toast, and Undo restores
  the draft along with an unlocked construction.
- a11y tests pass.

## Out of scope

Guided tours and checklists. Help content is prompt 18.
