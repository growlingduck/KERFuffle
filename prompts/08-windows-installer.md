# Prompt 08 — Windows Installer, Signing and Updates

> Paste everything below the line into a fresh coding-agent session at the repo root.
> Prerequisites: prompts 01–07 are done.
> Prerequisite reading for the agent: `APPLICATION-VISION.md` §5.

---

## Goal

Ship KERFuffle as a professional Windows application that both shop PCs can
install without admin rights, use fully offline, update safely, and uninstall
without losing jobs.

## Decisions already made

- **Installer**: Tauri's NSIS bundler, `installMode: "currentUser"`, installing
  per user to `%LOCALAPPDATA%\Programs\KERFuffle` with no UAC prompt. Start-menu
  entry; the desktop shortcut is a checkbox, off by default.
- **WebView2**: Windows 10 and 11 normally have it. Use the **embedded
  bootstrapper** so a PC without it is fixed at install time. If either shop PC
  is often offline at install time, switch to the offline installer and note the
  size cost.
- **Data is never in the install folder.** The database, backups and settings
  live in `%APPDATA%\KERFuffle` (prompt 03). Uninstall leaves them in place
  unless the user ticks "Also delete my jobs and backups" (default unticked,
  with a clear warning).
- **File association**: `.kerfjob` opens in KERFuffle and starts the import flow
  (prompt 07).
- **Version**: one version in the root `package.json`, mirrored into
  `tauri.conf.json` and `Cargo.toml` by a script. Shown in Settings → About.

## Code signing

- Sign the app executable and the installer. Recommended route: **Azure
  Trusted Signing** (low cost, no hardware token) through a custom `signCommand`
  in `tauri.conf.json`. An OV certificate with `signtool` also works. Document
  the setup steps in `docs/release.md`.
- Never commit certificates or credentials. Read them from environment
  variables in the release script.
- Note in `docs/release.md`: signing proves who published the app, but a new
  publisher may still see a SmartScreen warning until it builds reputation.

## Updates

- Use the Tauri updater plugin with its own signing key pair (separate from code
  signing). Keep the private key outside the repo.
- **Update host**: GitHub Releases on a private or public repo, or a static file
  host. Pick one and document it. The app checks at most once a day, never
  blocks start-up, and works normally when offline.
- **Never interrupt work**: show "Update ready, installs when you close
  KERFuffle" in the header. Install on exit, or immediately if the user chooses
  **Restart now** (after autosave flushes).
- After an update, the first start runs migrations with a backup first (prompt
  03 and 07 rules).

## Deliverables

- `tauri.conf.json` bundle and updater configuration.
- `scripts/release.(ps1|mjs)`: bump the version, build, sign, produce the
  installer and updater artifacts plus a `latest.json`, and print checksums.
- `docs/release.md`: one-time setup (certs, keys, host), the release checklist,
  and how to roll back a bad release.
- `docs/install.md`, written for the two shop users: install, first launch,
  where jobs are stored, updating, moving to a new PC, uninstalling.
- CI workflow (GitHub Actions, `windows-latest`): test, build an unsigned
  installer on every push, and on tags sign and publish a release (signing
  secrets only available to tagged builds).

## Done when

- On a clean Windows 11 VM with a standard (non-admin) user: install with no UAC
  prompt → launch offline → create a job → close → reopen → the job is there.
- Updating from version N to N+1 keeps all jobs, takes a backup, and never
  interrupts an open job.
- Uninstall keeps the data by default; reinstall finds the jobs.
- Double-clicking a `.kerfjob` file opens the import preview.
- The signed installer's properties show the publisher, and `signtool verify /pa`
  passes.
- A short summary reports the installer size, the update flow tested, and any
  manual steps left for the user.

## Out of scope

Microsoft Store distribution, MSI/enterprise deployment, macOS or Linux builds,
auto-start, telemetry.
