# KERFuffle

A Windows desktop app that turns cabinet sizes into a shop-ready cut list.
It replaces the old web calculator and the `CutList.xlsm` spreadsheet.

**Install → create a job → add cabinets → review parts → print the cut list.**

It runs fully offline, with no account and no Excel. It's used on two shop
PCs; each keeps its own jobs, and jobs move between them as `.kerfjob` files.

This page is for whoever develops and releases KERFuffle. For the people in the
shop, see [docs/install.md](docs/install.md) and
[docs/quick-start.md](docs/quick-start.md) (your first job in six steps; the
app has the same content under **Help**).

## What it does

- **Jobs screen:** a library of saved jobs with search, sort, preview, sample
  jobs, export and import.
- **Workspace:** add and edit base, tall and wall cabinets (sizes, shelves, finished
  ends, quantity), with a drawing and a live parts list. Every edit autosaves,
  and undo/redo cover the whole session.
- **Cut list:** parts and laminate for the whole job, as print, PDF or CSV.
- **Settings:** shop defaults (panel thickness, toe kick, countertop, laminate
  oversize, and so on), backups, About and Help (a first-job walkthrough, the
  shop vocabulary and a printable quick start).
- **Safety:** a daily rotating backup, crash recovery for the last few
  seconds of edits, and a backup before every database upgrade.
- **Updates:** checks GitHub Releases once a day, downloads in the
  background, installs when the app closes.

## How it's built

| Part | What it is |
|---|---|
| [engine/](engine/) | `@kerfuffle/engine`, the calculation rules in plain TypeScript (no UI). Turns a cabinet plus shop settings into parts, then a job into a cut list. Tested against the example cabinets in `engine/fixtures/`. |
| [app/](app/) | `@kerfuffle/app`, the desktop app. React 19 + Vite UI in `app/src/`, using the engine. |
| [app/src-tauri/](app/src-tauri/) | The Tauri 2 (Rust) side: SQLite job storage and migrations (`src/db/`), backups, `.kerfjob` export and import, PDF and CSV output, and the updater (`src/updates.rs`). |
| [scripts/](scripts/) | `version.mjs` (one version everywhere), `release.mjs` (build a release), `sign.mjs` (code signing). |
| [docs/](docs/) | Calculation rules, interaction design, wireframes, install, release and CI guides. |
| [prompts/](prompts/) | The build prompts the app was built from, in order. Finished ones are in [prompts/archive/](prompts/archive/). |
| `legacy/` | The old calculator and spreadsheet, kept for reference. Git-ignored, so it's only on the development PC. |

It's an npm workspace: run every command below from the repo root.

## Development

You need **Node 24**, **Rust stable** (with the MSVC build tools) and
**WebView2**, which Windows 11 already has.

```powershell
npm install
npm run dev          # the desktop app, with hot reload
npm run dev:web      # just the UI in a browser at http://localhost:1420 (no Rust side)
```

If `npm run dev` says port 1420 is in use, an old Vite is still running. Find
it with `Get-NetTCPConnection -LocalPort 1420` and stop it with
`Stop-Process -Id <pid>`.

Development builds never check for updates.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Run the desktop app in development. |
| `npm run dev:web` | Run only the UI, in a browser. |
| `npm run lint` | ESLint over the whole repo. |
| `npm test` | Type checks and Vitest, for the engine and the app. |
| `cd app/src-tauri; cargo test` | The Rust tests (storage, migrations, backups, transfer, updates). |
| `npm run build` | An **unsigned** installer, in `app/src-tauri/target/release/bundle/nsis/`. Good for trying a build on another PC. |
| `npm run version:check` | Fails if any file's version differs from the root `package.json`. |
| `npm run version:set -- 0.2.0` | Sets the version and copies it everywhere. Also takes `patch`, `minor` or `major`. |
| `npm run version:sync` | Copies the root `package.json` version everywhere (after editing it by hand). |
| `npm run release` | Builds a **signed** release into `release/v<version>/`. Needs code signing set up (below). |
| `npm run release:unsigned` | The same release build, without code signing. |

`npm run` passes anything after `--` on to the script. For example,
`npm run release -- patch --notes "Fixes shelf spacing"` bumps the version,
then builds.

## Versions

The app has **one version**: `version` in the root [package.json](package.json).
`version:set` and `version:sync` copy it into `app/package.json`,
`package-lock.json`, `tauri.conf.json`, `Cargo.toml` and `Cargo.lock`. Don't
edit those by hand. The engine package keeps its own version.

Use patch for fixes and minor for features. A version that changes the
database schema also needs a migration in `app/src-tauri/src/db/migrations`
and a test.

## Releasing (runbook)

The full guide, including one-time setup, testing an update and rolling back,
is [docs/release.md](docs/release.md). The short version:

```powershell
# 1. On a clean master, set the version and commit it
npm run version:set -- minor          # or patch, or 0.2.0
git commit -am "Release 0.2.0"

# 2. Build: lint, tests, build, both signatures checked
npm run release                       # signed; needs KERFUFFLE_SIGN set
npm run release:unsigned              # until code signing is set up

# 3. Tag and push
git tag v0.2.0
git push; git push origin v0.2.0
```

4. On GitHub, go to **Releases → Draft a new release**, pick the tag and upload
   the four files from `release\v0.2.0\`: the installer, its `.sig`,
   `latest.json` and `SHA256SUMS.txt`.
5. Install from the draft over the previous version on a test PC. Check that
   the jobs are still there and **Settings → About** shows the new version.
6. Write the notes in shop terms, then **Publish**. Installed copies update
   within a day. Drafts and pre-releases are invisible to them.

What the release script needs:

- **The updater key**, at `%USERPROFILE%\.tauri\kerfuffle-updater.key` (or in
  `TAURI_SIGNING_PRIVATE_KEY`). It signs every update. **Keep a backup
  outside the repo.** If it's lost, installed copies can never update again.
- **Code signing** (`KERFUFFLE_SIGN` and its settings) for `npm run release`.
  See [docs/release.md](docs/release.md#2-code-signing-azure-artifact-signing-recommended).
  Without it, use `release:unsigned`. Updates still work because they're
  checked with the updater key, but Windows SmartScreen warns harder on a
  first install.
- A clean working tree. The script refuses to build with uncommitted changes.

**A bad release?** Mark it as a pre-release on GitHub (or delete it) so no
more PCs pick it up, then ship the fix as the next version up. Apps only ever
update forward. Details are in
[docs/release.md](docs/release.md#rolling-back-a-bad-release).

## CI

A GitHub Actions workflow (lint, tests, unsigned installer on every push;
signed draft release on `v*` tags) is **parked** at
`.github/workflows_parked/ci.yml.txt`, so it doesn't run. To turn it on, see
[docs/ci.md](docs/ci.md). Until then, run `version:check`, `lint`, `test` and
`cargo test` yourself before pushing, and build releases locally as above.

Pushing anything under `.github/workflows/` needs a token with the `workflow`
scope. If Sourcetree rejects the push, update its token.

## Where things live on a PC

| What | Where |
|---|---|
| The program | `%LOCALAPPDATA%\Programs\KERFuffle` (per user, no admin) |
| Jobs database and settings | `%APPDATA%\KERFuffle\kerfuffle.db` |
| Backup settings, update state | `%APPDATA%\KERFuffle\backup-settings.json`, `update-state.json` |
| Daily backups | `Documents\KERFuffle\Backups` (changeable in Settings → Backups) |
| Release builds | `release\v<version>\` in the repo (git-ignored) |

## Further reading

| Doc | For |
|---|---|
| [APPLICATION-VISION.md](APPLICATION-VISION.md) | Why the app exists, and the scope of the first release. |
| [docs/calculation-rules.md](docs/calculation-rules.md) | How every part is sized, and the shop's decisions about it. |
| [docs/interaction-design.md](docs/interaction-design.md), [docs/wireframes/](docs/wireframes/) | How the screens behave and look. |
| [docs/install.md](docs/install.md) | The shop users' guide: install, updates, uninstall. |
| [docs/moving-jobs-between-pcs.md](docs/moving-jobs-between-pcs.md) | Moving a job with a `.kerfjob` file. |
| [docs/release.md](docs/release.md) | Releasing, signing, testing updates, rolling back. |
| [docs/ci.md](docs/ci.md) | The parked CI workflow. |
| [docs/pending-checks.md](docs/pending-checks.md) | Things still to be tried by hand or decided. |
