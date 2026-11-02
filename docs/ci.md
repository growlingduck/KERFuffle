# Continuous integration (CI)

What the GitHub Actions workflow does, why it's switched off for now, and how
to turn it back on. Written for whoever maintains the repo. Releasing is
covered in [release.md](release.md).

## Status: parked

The workflow lives at `.github/workflows_parked/ci.yml.txt`. GitHub only runs files
ending in `.yml` or `.yaml` in `.github/workflows/`, so in this folder, with a `.txt` extension, it is
kept in the repo but **never runs**. Nothing breaks while it's parked; every
step it performs can be run by hand (see [Without CI](#without-ci)).

## What it's for

CI is a second pair of hands that runs on GitHub's Windows machines each time
you push. It does two jobs:

1. **Catch mistakes early.** Every push and pull request is linted, tested and
   built on a clean machine, so a broken build or a failing test shows up as a
   red ✗ on the commit, not on the shop PCs.
2. **Make releases repeatable.** Pushing a `v*` tag (e.g. `v0.3.0`) produces a
   signed installer and a *draft* GitHub release, the same way every time,
   without the signing secrets ever being on your PC.

## What it does

### Job 1: `test-and-build` (every push, every branch, every pull request)

| Step | Why |
|---|---|
| Set up Node 24 and stable Rust, with caches | Same toolchain as development; caches keep runs fast. |
| `npm ci` | Clean install from `package-lock.json`. |
| `node scripts/version.mjs --check` | Fails if the version differs between `package.json`, `tauri.conf.json`, `Cargo.toml` and the others. |
| `npm run lint`, `npm test` | JavaScript lint and tests. |
| `cargo test --locked` in `app/src-tauri` | Rust tests; `--locked` fails if `Cargo.lock` is out of date. |
| `npm run build` | Builds an **unsigned** installer. |
| Upload the installer | Downloadable from the run's **Artifacts** for 14 days, handy for trying a branch on another PC. |

A newer push to the same branch cancels a run that's still going. Tag runs are
never cancelled.

### Job 2: `release` (only for `v*` tags, after job 1 passes)

| Step | Why |
|---|---|
| Check the tag matches `package.json` | Stops `v0.3.0` being pushed on a commit that says `0.2.9`. |
| Install the Azure Artifact Signing client | Needed to code-sign the `.exe` files. |
| `node scripts/release.mjs --skip-tests` | Builds, code-signs, signs the update, checks both signatures and writes `release/v<version>/`. Tests already ran in job 1. |
| `gh release create … --draft` | Creates a **draft** release with the installer, its `.sig`, `latest.json` and `SHA256SUMS.txt`. Installed apps can't see a draft until someone tests it and clicks **Publish**. |

This job runs in the GitHub **`release` environment**, which holds the signing
secrets and only accepts `v*` tags. Branch builds and pull requests never see
the secrets.

## What it needs before it's useful

- **Job 1:** nothing. It works as soon as the file is renamed back.
- **Job 2:** the one-time setup in [release.md](release.md#one-time-setup):
  the `release` environment, the Artifact Signing variables and Azure secrets,
  and the `TAURI_SIGNING_PRIVATE_KEY` secret. Until those exist, a tag build
  fails at "Build, sign and check". Branch builds are unaffected.

GitHub Actions is free for public repos. Windows runners count double against
the free minutes on private repos.

## Turning it on

```powershell
git mv .github/workflows_parked/ci.yml.txt .github/workflows/ci.yml
git commit -m "Turn on CI"
git push
```

Pushing a file under `.github/workflows/` needs a token with the `workflow`
scope. If the push is rejected, update the token in Sourcetree.

The run appears under the repo's **Actions** tab. To park it again, move it
back to `.github/workflows_parked/ci.yml.txt`.

## Without CI

Before pushing, run what job 1 would:

```powershell
node scripts/version.mjs --check
npm run lint; npm test
cd app/src-tauri; cargo test; cd ../..
```

To release, run `node scripts/release.mjs` with the signing variables set and
upload the four files from `release\v<version>\` to a new draft release by
hand, as in step 3 of the [release checklist](release.md#release-checklist).
