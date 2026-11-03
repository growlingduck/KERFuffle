# Prompt 14 — First Run: Shop Defaults and an Example Job

> Paste everything below the line into a fresh coding-agent session at the repo root.
> Prerequisites: prompts 01–13 are done.
> Prerequisite reading for the agent: `docs/interaction-design.md` (§6, Jobs).

---

## Goal

Make the first launch safe and less bare. Today a new user lands on an empty
Jobs screen ("No jobs yet. Start one with New job.") and never confirms the shop
defaults that every new job copies. If the shop's panel thickness or toe kick
differ from the built-in values, the first cut list is quietly wrong, and fixing
Settings afterwards doesn't fix that job, because it keeps its own copy.

## Part 1: check your shop defaults

- Store whether the shop's construction defaults have been confirmed. Add it to
  the shop settings with a forward migration (the schema is at v5). The
  migration marks it confirmed when the database already has jobs, so people
  already using KERFuffle are never asked.
- Until it's confirmed, the Jobs screen shows a banner above the register:
  *"Before your first job, check your shop's construction defaults: panel
  thickness, toe kick, countertop and the rest."* It has two actions:
  - **Check defaults** opens Settings → Construction;
  - **They're right** confirms without changing anything.
- Saving the Construction section in Settings also confirms.
- While not confirmed, the New job dialog's construction panel gets one line:
  *"Not checked yet: these are KERFuffle's built-in values."* with a link to
  Settings.
- The flag is part of shop settings, so backups and restore carry it.
  `.kerfjob` transfer doesn't (it's not job data).

## Part 2: an example job in release builds

The sample jobs already exist (`app/src-tauri/src/db/samples.rs`,
`memoryClient.ts`), but **Load sample jobs** only appears in development builds.

- Pick **one** sample that shows the most: base and wall cabinets, finished
  ends, a quantity above 1 and, if the shop default method uses runs, a run.
  Name it so it can't be mistaken for real work, like
  *"Example – Small kitchen"*, with customer *"Example"*.
- Add a release-safe command that adds that one job, built with the current
  shop defaults. Keep the existing development-only command that loads all
  the samples.
- The Jobs empty state (no jobs at all) gets **Open an example job** next to
  the existing hint. It creates the job and opens it in the workspace.
- Settings → About gets **Add the example job** as well, so someone can get it
  back after archiving it. It's an ordinary job: editable, archivable,
  exportable.

## Done when

- Fresh database: the banner shows. **They're right**, or saving Construction in
  Settings, hides it for good, including after a restart.
- A database from before this prompt that has jobs never shows the banner. A
  migration test covers both cases, and the pre-upgrade backup still runs.
- In a release build, **Open an example job** creates the example, opens it, and
  its cut list prints.
- Rust and app tests cover the new command and the flag. `cargo test` and the
  app tests pass.

## Out of scope

A multi-step setup wizard, and tours. Prompts 15–18 cover the rest of the
first-run experience.
