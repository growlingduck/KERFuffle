# Installing KERFuffle

For the people using KERFuffle in the shop. It covers installing, where your
jobs are kept, updates, moving to a new PC and uninstalling.

## Install

1. Download **`KERFuffle_x.y.z_x64-setup.exe`** from the KERFuffle releases
   page: <https://github.com/growlingduck/KERFuffle/releases/latest>.
2. Double-click it. You don't need an administrator password: KERFuffle
   installs for you only, in `%LOCALAPPDATA%\Programs\KERFuffle`.
3. Click through the installer. On the last page:
   - **Create desktop shortcut** is unticked. Tick it if you want one.
     KERFuffle is always in the Start menu.
   - **Run KERFuffle** opens it right away.

If Windows says **"Windows protected your PC"**, click **More info → Run
anyway**. This can happen for a while with a new program, even a signed one.
To check it's the real installer, right-click it → **Properties → Digital
Signatures**: the publisher should be KERFuffle's.

If the PC is missing a part Windows uses to draw the KERFuffle window
(WebView2), the installer adds it. That one step needs the internet.

## First launch

KERFuffle opens on the **Jobs** screen. It works fully offline. The only time
it uses the internet is a quick check for updates, once a day.

On the first day you use it, and each day after, KERFuffle makes a backup of
all your jobs when it starts (once there are jobs to back up).

## Where your jobs are kept

| What | Where |
|---|---|
| Your jobs and settings | `%APPDATA%\KERFuffle` (the job database, `kerfuffle.db`) |
| Daily backups | `Documents\KERFuffle\Backups`, unless you chose another folder in **Settings → Backups** |
| The program | `%LOCALAPPDATA%\Programs\KERFuffle` |

Your jobs are kept **apart from the program**, so updating, reinstalling or
uninstalling KERFuffle doesn't touch them.

(To open `%APPDATA%\KERFuffle`, paste it into File Explorer's address bar.)

## Updates

KERFuffle updates itself, and never in the middle of your work.

- Once a day it checks for a new version and downloads it quietly.
- When one is ready, the top bar says **Update ready · Installs when you
  close KERFuffle**. Keep working; nothing changes yet.
- When you close KERFuffle, the update installs (a small progress window
  shows for a few seconds). The next time you open it, you have the new
  version, with all your jobs.
- To update straight away, click **Restart now**. KERFuffle saves your work,
  installs the update and opens again.
- Before using a new version for the first time, KERFuffle backs up your jobs.

**Settings → About** shows the version you have. **Check for updates** checks
right now instead of waiting for the daily check.

No internet? KERFuffle works as usual and checks again another day.

## Moving to a new PC

**Everything at once** (all jobs and settings):

1. On the old PC, on the **Jobs** screen, click **Back up now**.
2. Copy the newest file from `Documents\KERFuffle\Backups` (named like
   `kerfuffle-20261101-094100.db`) to a USB stick.
3. Install KERFuffle on the new PC and open it once.
4. Copy the file into `Documents\KERFuffle\Backups` on the new PC.
5. On the **Jobs** screen, click **Restore backup…** and pick that backup.

**One job at a time:** use **Export job file…** and **Import job…**. See
[Moving jobs between PCs](moving-jobs-between-pcs.md). Double-clicking a
`.kerfjob` file also opens it in KERFuffle, ready to import.

## Uninstall

Windows **Settings → Apps → Installed apps → KERFuffle → ⋯ → Uninstall**.

The uninstaller has a box: **"Also delete my jobs and backups (can't be
undone)"**.

- **Leave it unticked** (the default) and your jobs, settings and backups
  stay on the PC. Install KERFuffle again later and everything is still
  there.
- **Tick it** only if you're sure. KERFuffle asks once more, then deletes the
  job database and the backups in `Documents\KERFuffle\Backups`. A backup
  folder you chose yourself in Settings is left alone. Export any job you
  want to keep first.

## If something goes wrong

- **"This job database was made by a newer version of KERFuffle"**: this PC
  has an older KERFuffle than the one that last opened the jobs. Install the
  latest version from the releases page.
- **A job looks wrong after an update**: on the **Jobs** screen, **Restore
  backup…** lists the backups by date. KERFuffle made one just before the
  update. Restoring puts all jobs back as they were then (your current jobs
  are backed up first).
