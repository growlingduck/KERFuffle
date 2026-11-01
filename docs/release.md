# Releasing KERFuffle

How a new version gets from this repo to the two shop PCs: one-time setup,
the checklist for each release, testing an update before shipping it, and
rolling back a bad one. Written for whoever cuts releases. The shop users'
guide is [install.md](install.md).

## How it fits together

| Piece | Where | Notes |
|---|---|---|
| Version | `version` in the root `package.json` | `node scripts/version.mjs` copies it into `app/package.json`, `package-lock.json`, `tauri.conf.json`, `Cargo.toml` and `Cargo.lock`. CI fails if they disagree. Shown in Settings → About. |
| Installer | `app/src-tauri/tauri.conf.json` → `bundle` | Tauri's NSIS installer, per user (`%LOCALAPPDATA%\Programs\KERFuffle`), no admin prompt. About 4.7 MB, including the WebView2 bootstrapper. |
| Installer tweaks | `app/src-tauri/windows/installer-hooks.nsh`, `English.nsh` | Install folder under `Programs`, desktop shortcut unticked, "Also delete my jobs and backups" on uninstall. Recheck these after upgrading `@tauri-apps/cli` (written against 2.12.4). |
| Code signing | `scripts/sign.mjs`, env vars | Signs `kerfuffle.exe`, `uninstall.exe` and the installer. |
| Update signing | Tauri updater key pair | Separate from code signing. The public key is in `tauri.conf.json` → `plugins.updater.pubkey`; the private key never enters the repo. |
| Update host | GitHub Releases on `growlingduck/KERFuffle` (public) | Apps read `https://github.com/growlingduck/KERFuffle/releases/latest/download/latest.json`. Only a *published*, non-prerelease release counts as "latest". Drafts are invisible to the apps. |
| Release build | `scripts/release.mjs` | Builds, signs, checks both signatures, writes `release/v<version>/`. |
| CI | `.github/workflows/ci.yml` | Every push: lint, tests, unsigned installer (in the run's Artifacts). A `v*` tag: signed build, then a **draft** release. |

How the app updates (code in `app/src-tauri/src/updates.rs`):

- A release build checks at most once a day, 20 seconds after start-up, and
  never blocks start-up. Offline, the check fails quietly and it tries again
  at the next start. **Settings → About → Check for updates** checks at once.
- A newer version is downloaded in the background and checked against the
  update public key. Then the header shows **Update ready · Installs when you
  close KERFuffle · Restart now**. Nothing interrupts the open job.
- Closing KERFuffle (after autosave flushes) runs the installer, with a small
  progress window and no questions. **Restart now** asks about unsaved
  Settings first, writes the open job, installs, and reopens KERFuffle.
- The first start of the new version backs up the jobs (a normal rotating
  backup in the backup folder), then upgrades the database if the schema
  changed, with its own backup first. It shows "Updated to KERFuffle x.y.z".
- Development builds (`npm run dev`) never check for updates.

## One-time setup

### 1. The updater key pair (done 2026-11-01)

A key pair was generated with `npx -w app tauri signer generate`:

- Private key: `%USERPROFILE%\.tauri\kerfuffle-updater.key` on the
  development PC. **No password.**
- Public key: already in `tauri.conf.json`.

To do now:

1. **Back up the private key** somewhere safe that isn't the repo, like a
   password manager or an encrypted USB stick. If it's lost, installed copies
   can never update again; the shop would have to reinstall by hand.
2. Add it to GitHub: repo → Settings → Environments → `release` (create it,
   see step 4) → secret `TAURI_SIGNING_PRIVATE_KEY`, set to the file's
   *contents*. Leave `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` unset, or empty.

To replace it with a password-protected key **before the first public
release** (afterwards, a new key strands existing installs):

```powershell
npx -w app tauri signer generate -w "$env:USERPROFILE\.tauri\kerfuffle-updater.key" -f
# paste the new .pub file's contents into tauri.conf.json → plugins.updater.pubkey
```

`scripts/release.mjs` refuses to finish if the installer's update signature
doesn't match the public key in `tauri.conf.json`.

### 2. Code signing: Azure Artifact Signing (recommended)

Microsoft renamed Trusted Signing to **Artifact Signing**. It's a monthly
subscription (Basic tier, about US$10/month), with no hardware token, and it
works from CI. The steps:

1. In the Azure portal, create an **Artifact Signing account**. Note its
   region endpoint, e.g. `https://eus.codesigning.azure.net`.
2. Complete **identity validation** (organization, or individual where
   Microsoft offers it). Approval can take a few days. The validated name is
   the "Publisher" Windows shows.
3. Create a **certificate profile** (Public Trust).
4. Create an **app registration** (service principal) for CI and give it the
   **Certificate Profile Signer** role on the account (named "Trusted Signing
   Certificate Profile Signer" in older docs). Make a
   client secret.
5. In GitHub, create the **`release` environment** (repo → Settings →
   Environments). Under *Deployment branches and tags*, choose **Selected
   branches and tags** and add the tag rule `v*`, so only tag builds can use
   it. Add:
   - Variables: `ARTIFACT_SIGNING_ENDPOINT`, `ARTIFACT_SIGNING_ACCOUNT`,
     `ARTIFACT_SIGNING_PROFILE`
   - Secrets: `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`,
     `TAURI_SIGNING_PRIVATE_KEY`
   - Optional: **Required reviewers** (yourself), so each signed release waits
     for a click.

To sign on your own PC instead of in CI:

```powershell
# once: the Windows SDK "Signing Tools" (signtool.exe), the .NET 8 runtime,
# and the signing client DLL:
nuget install Microsoft.ArtifactSigning.Client -OutputDirectory C:\Tools\signing
az login   # an account with the Signer role

$env:KERFUFFLE_SIGN = "artifact"
$env:ARTIFACT_SIGNING_ENDPOINT = "https://eus.codesigning.azure.net"
$env:ARTIFACT_SIGNING_ACCOUNT = "<account>"
$env:ARTIFACT_SIGNING_PROFILE = "<profile>"
$env:ARTIFACT_SIGNING_DLIB = "C:\Tools\signing\Microsoft.ArtifactSigning.Client.<ver>\bin\x64\Azure.CodeSigning.Dlib.dll"
```

**Alternative: an OV certificate.** These now come on a USB token or a
cloud HSM, so they're awkward in CI. Plug in the token, then sign locally:

```powershell
$env:KERFUFFLE_SIGN = "certificate"
$env:SIGN_CERT_THUMBPRINT = "<SHA-1 thumbprint>"
$env:SIGN_TIMESTAMP_URL = "<your CA's timestamp URL>"   # optional
```

**Never commit certificates, keys, secrets or a `metadata.json` with real
values.** Everything above is read from environment variables.

> **SmartScreen.** Signing proves who published KERFuffle and that nobody
> changed it. A *new* publisher can still get "Windows protected your PC" for
> a while, until Microsoft's reputation system has seen enough installs. On
> the shop PCs: **More info → Run anyway**, once. Updates install from inside
> the app, so they don't hit SmartScreen.

## Release checklist

1. **Decide the version.** Patch for fixes, minor for features. A version
   that changes the database schema needs a migration in
   `app/src-tauri/src/db/migrations` (prompt 03 rules) and a test.
2. On a clean `master`:
   ```powershell
   node scripts/version.mjs minor     # or patch, or 0.3.0
   npm run lint; npm test; cd app/src-tauri; cargo test; cd ../..
   git commit -am "Release 0.3.0"
   git tag v0.3.0
   git push; git push origin v0.3.0
   ```
3. **CI** runs the tests, signs the build and creates a **draft** release
   `v0.3.0` with `KERFuffle_0.3.0_x64-setup.exe`, its `.sig`, `latest.json`
   and `SHA256SUMS.txt`. (Without CI: run `node scripts/release.mjs` with the
   signing variables set, then upload those four files from
   `release\v0.3.0\` to a new draft release.)
4. **Test the draft** on a PC or VM with the previous version installed:
   - Download the installer from the draft. In its Properties → Digital
     Signatures, the publisher should be your validated name.
     `signtool verify /pa KERFuffle_0.3.0_x64-setup.exe` should pass. The
     release script already ran it, but check the downloaded file.
   - Install it over the old version: jobs are still there, Settings → About
     shows 0.3.0.
5. Edit the draft's notes (what changed, in shop terms), then **Publish**.
   From now on, installed copies pick it up within a day.
6. Tell the shop, if the change is visible. They don't need to do anything.

The release script prints the installer size and SHA-256 checksums, and
writes them to `SHA256SUMS.txt`.

## Testing an update on one PC

To try the whole update flow (download, "Update ready", install on close,
Restart now, backups) without publishing anything:

```powershell
# two test builds that update from a local folder over http
node scripts/release.mjs --test-feed http://127.0.0.1:8765 --skip-tests --allow-dirty   # builds N
node scripts/version.mjs 0.1.1
node scripts/release.mjs --test-feed http://127.0.0.1:8765 --skip-tests --allow-dirty   # builds N+1
node scripts/version.mjs 0.1.0                                                          # back to N

release\v0.1.0-test\KERFuffle_0.1.0_x64-setup.exe        # install N
npx http-server release\v0.1.1-test -a 127.0.0.1 -p 8765  # serve N+1
```

Start KERFuffle. Within about 30 seconds the header says **Update ready**.
Close it: N+1 installs. Start it again: a new backup appears in
`Documents\KERFuffle\Backups`. Test builds are unsigned and point at
`127.0.0.1`, so **never publish one**. Uninstall it when you're done.
Delete `%APPDATA%\KERFuffle\update-state.json` too, or the next real install
will think it was updated from the test version.

## Rolling back a bad release

Installed apps only move **forward**: they install a version newer than their
own. So a rollback is a new, higher version.

1. **Stop the spread right away.** On GitHub, edit the bad release and tick
   **Set as a pre-release**, or delete it. `latest/download/latest.json` then
   points back at the previous release. PCs that already have the bad version
   keep it, and PCs that don't won't get it.
2. **Ship the fix as the next version.** Revert the bad commits (or fix
   forward), bump the version (bad 0.3.0 → good 0.3.1), and release as usual.
   Every PC moves to 0.3.1 within a day, or at once with Settings → About →
   Check for updates.
3. **If the bad release changed the database schema**, an older KERFuffle
   refuses to open it ("This job database was made by a newer version of
   KERFuffle"). Either keep the new schema in the fixed version (best), or on
   each PC restore the backup taken just before the upgrade. Every upgrade
   backs up first; use **Restore backup…** on the Jobs screen (prompt 07).
   Edits made since that backup are lost.
4. **Urgent, by hand:** download an earlier installer from its GitHub release
   and run it. It installs over the bad version, and the jobs stay as they
   are, subject to the schema note in step 3.

## Still to do by hand

- Back up the updater private key (above).
- Set up Artifact Signing and the `release` environment. Until then, a tag
  build fails at "Build, sign and check". Branch builds are unaffected.
- The first signed release: test on a clean Windows 11 VM with a standard
  (non-admin) user. Install (no UAC prompt), launch offline, create a job,
  close, reopen, then uninstall with and without "Also delete my jobs and
  backups".
