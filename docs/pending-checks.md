# Pending checks

Things built so far (prompts 01–13) that still need you to look at them, try
them, or make a call. Tick them off or delete lines as you go. Last updated
2026-11-02.

## 1. Try in the desktop app (`npm run dev`)

No one has opened the real Tauri window yet. Everything below passed automated
tests, but was never clicked through in the app itself.

If `npm run dev` says port 1420 is in use, an old Vite is still running
(last seen as PID 18396): stop it with `Stop-Process -Id <pid>` first.

- [ ] **The window opens** and the four screens (Jobs, Workspace, Cut list,
      Settings) look like the prototypes in `docs/wireframes/`.
- [ ] **Offline:** it still runs with the network turned off (prompt 02).
- [ ] **Jobs screen** matches `docs/wireframes/Home.dc.html`: click **Load
      sample jobs**, then try search, sort, the ⋯ menu, the hover preview
      and New job (prompt 04).
- [ ] **Workspace** looks and feels right: tracing highlights, △n revision
      marks, nudging with ↑/↓, undo/redo toasts. Animation timings were never
      seen (prompt 05).
- [ ] **Crash recovery:** load the samples, edit something, end the process in
      Task Manager within about 0.4 s, restart. You should see "Recovered your
      last changes to …" (prompt 03).
- [ ] **Closing the window** right after an edit keeps the edit (prompt 03).
- [ ] **Cut list → Print…** opens the Windows print dialog, and the printout
      matches the screen sheets (prompt 06).
- [ ] **Cut list → Save PDF** asks where to save, writes the PDF, shows "PDF
      saved ✓" and the toast's **Show in folder** opens Explorer on the file.
      This WebView2 code compiled but has never run (prompt 06).
- [ ] **Cut list → Export CSV** saves a file that opens cleanly in Excel: ″
      marks, fractions not turned into dates, cabinet lists in one cell.
- [ ] **File open in Excel:** with the CSV open in Excel, export again. You
      should get "is open in another program" with **Try again**.
- [ ] **Ctrl+P from the workspace** opens the cut list and prints it.
- [ ] **Print a real sheet** on the shop printer and check it's readable at
      the bench: 16px mono text, black only, checkboxes, Sheet n / N, DRAFT
      stamp on draft jobs. Sample PDFs from headless Edge, if you want to look
      first:
      `C:\Users\Owner\AppData\Local\Temp\claude\c--Users-Owner-Documents-websites-KERFuffle\05578874-763c-40a1-bec5-1486c409b3bb\scratchpad\out\sample-cut-list.pdf`
      (temporary folder; it may be cleaned up).
- [ ] **First launch of the day** writes a backup to
      `Documents\KERFuffle\Backups` (once there are jobs), and the Jobs screen
      shows "Last backup today, …" (prompt 07).
- [ ] **Back up now / Restore backup…** on the Jobs screen: back up, change a
      job, restore the backup, and the change is gone; restore the newer
      backup and it's back. Restore runs on the real database file, so try
      it with jobs you can lose, or after a fresh backup (prompt 07).
- [ ] **Settings → Backups → Change… / Open folder** open the Windows folder
      picker and File Explorer (prompt 07).
- [ ] **Move a job between the two PCs** by USB stick, following
      `docs/moving-jobs-between-pcs.md`: export from the ⋯ menu, import with
      Import job… and by dragging the file onto the Jobs screen, then again
      with Replace existing (prompt 07).
- [ ] **Settings → Round shown sizes to 1/8″**, save, and the workspace, cut
      list and printout all round to 1/8″ (prompt 07).

## 2. Confirm calculations against real builds

Only you can mark an example confirmed. Change `"status"` to `"confirmed"` in
the fixture file once you've checked it against a cabinet you've built.

- [ ] `engine/fixtures/01-base-30x36x24-left-end.json`: base 30 × 36 × 24
- [ ] `engine/fixtures/04-wall-30x30x12-both-ends.json`: wall 30 × 30 × 12
- [ ] `engine/fixtures/05-base-quantity-3.json`: base 18″, quantity 3
- [ ] `engine/fixtures/06-base-23-32-panel.json`: 23/32″ panels
- [ ] `engine/fixtures/cutlist/sample-job.json`: the 5-cabinet cut list (worked
      out by hand from the rules doc)
- [ ] `engine/fixtures/cutlist/stress-40-cabinets.json`: only checks the program
      handles a big job; no need to check its sizes by hand.

## 3. Open questions for the shop

- [ ] **Q7, shelf stock with 23/32″ panels:** shelves stay 3/4″ (or 1″) and a
      warning shows. You said "keep for now, flag it"; decide once you see how
      often it comes up (`docs/calculation-rules.md`).
- [ ] **Front laminate goes with the Front:** turning fronts off also hides
      front laminate. Should front laminate always print?
- [ ] **Back and Front merge into one cut-list line** ("Back / Front") because
      they're always the same size. OK, or keep them as separate lines?
- [ ] **Short names on the sheet:** rows say "Front" (note 4 explains it) and
      laminate rows drop "Laminate,". OK?
- [ ] **Page breaks:** a group moves to the next sheet when less than half of
      it fits; otherwise it continues under "…, cont.". In By-cabinet mode a
      cabinet can split across sheets (keeping each whole used 40 sheets for 40
      cabinets). OK?
- [ ] **Fronts switch** is remembered per job on this computer only, not saved
      in the job or a `.kerfjob` file. OK?
- [ ] **Paper size:** Letter only for now. Do you need A4? Prompt 07 didn't
      ask for it, so Settings doesn't offer it yet (the cut list is ready for it).
- [ ] **Label stock and other shop output** (APPLICATION-VISION.md §7): any
      label printing or other formats wanted?
- [ ] **Remaining vision decisions** (APPLICATION-VISION.md §7): Windows
      versions to support, and whether jobs are only transferred or ever
      edited by two people at once.

## 4. Choices made in earlier prompts. Keep or change?

- [ ] **Copy from a job** (New job dialog) also copies that job's rules, and
      leaves a "… (copy)" job behind if the rename fails (prompt 04).
- [ ] **Restore from archive** brings a job back as Draft, not its old status.
- [ ] **"Yesterday"** shows a time ("Yesterday, 4:12 PM").
- [ ] **Header tabs:** all four tabs are always shown, not only Jobs and
      Settings.
- [ ] **New cabinet IDs** take the lowest free number: delete B2 and the next
      base cabinet is B2 again, not B4 (prompt 05).
- [ ] **Undo** puts back the selection from when the step was taken (prompt 05).
- [ ] **Status changed on the Jobs screen** isn't in the workspace's undo
      history; status changed in the header is.
- [ ] **No conflict check on save:** one writer per job is assumed; the app's
      copy wins (prompt 03).
- [ ] **Database location** is `%APPDATA%\KERFuffle\kerfuffle.db`, as the prompt
      said, not Tauri's default `%APPDATA%\com.kerfuffle.app`.
- [ ] **Disabled text** uses `#6F7177` instead of the prototype's `#8E9095`,
      which was too faint (prompt 02).
- [ ] **Dev sample jobs:** the kitchen's second B3 was renamed B4; "Cut-list
      sample" (J-0015) and "Stress test: 40 cabinets" (J-0016) were added for
      prompt 06.

## 5. Small fixes and loose ends

- [ ] `docs/interaction-design.md` §5.5 dependency table: the `p` row should add
      bottom/top **W** (their width is D − p). The code already follows the
      formula.
- [ ] Engine warnings use `"` for inches while the screens use `″`, so the
      shelf-thickness warning mixes both.
- [ ] `reorderCabinet` exists and is tested, but nothing in the UI uses it yet.
- [ ] No test measures that only the edited row re-renders while typing.
- [ ] `prompts/README.md` still shows a blank status for 02–07. Mark them done
      once you're happy with section 1.
- [ ] Prompts 02–07 were committed together on the `prompts-02-07` branch, not
      yet merged into `master`.
- [ ] `npm audit` reports a moderate minimatch advisory inside ESLint (dev only,
      never shipped).
- [ ] ESLint parses with TypeScript 6.0.3 because typescript-eslint doesn't
      support TS 7 yet; revisit when it does.

## 6. Choices made in prompt 07. Keep or change?

- [ ] **Backups go to `Documents\KERFuffle\Backups`**, as in the Settings
      prototype, so they're easy to find and copy. The job database stays in
      `%APPDATA%\KERFuffle`.
- [ ] **The backup folder and count are kept outside the database**
      (`%APPDATA%\KERFuffle\backup-settings.json`), so restoring an old
      backup can't move the backup folder. Rounding and construction defaults
      are in the database, so a restore brings back the ones from then.
- [ ] **Changing the backup folder** doesn't move old backups; they stay in the
      old folder and no longer show in Restore. A smaller "keep" deletes old
      backups at the next backup, not when you save.
- [ ] **No backup on the first day there are no jobs yet** (nothing to back up).
- [ ] **Rotation:** keeps the newest n, plus the newest backup of each week
      (Monday to Sunday) in the last 31 days.
- [ ] **Pre-migration copies** are now ordinary rotating backups. Any old
      `%APPDATA%\KERFuffle\backups\kerfuffle-pre-migration-*.db` files are left
      where they are.
- [ ] **Changed / Default marks** in Settings compare with the built-in
      defaults (3/4″ panels…), and **Reset** goes back to them. The dirty bar
      compares with what's saved.
- [ ] **Settings are checked on a 30″ × 34 1/2″ × 24″ base cabinet** with one
      shelf; a size problem shows beside the rule you changed.
- [ ] **Import as a copy** keeps the file's status (not Draft, unlike
      Duplicate) and adds "(copy)" to the name. A plain import keeps
      everything as exported, including its revision and dates.
- [ ] **Job numbers:** an imported job keeps its number unless this PC
      already uses it; then it gets the next free one. Replace keeps this PC's
      number if the file's is taken.
- [ ] **Leaving Settings** with unsaved changes asks Save / Discard / Cancel.
      Closing the whole window doesn't ask yet.

## 7. Installer, signing and updates (prompt 08)

Tested on this PC on 2026-11-01 with unsigned test builds and a local update
feed. Install, update, Restart now, uninstall and reinstall all worked; see
`docs/release.md`. Still needs you:

- [ ] **Back up the updater private key**
      (`%USERPROFILE%\.tauri\kerfuffle-updater.key`, no password). Without it,
      installed copies can never update again. Or replace it with a
      password-protected key before the first release (`docs/release.md`).
- [ ] **Code signing:** set up Azure Artifact Signing (or buy an OV
      certificate) and the GitHub `release` environment. Until then, tag
      builds stop at signing; branch builds still make unsigned installers.
- [ ] **First signed release on a clean Windows 11 VM**, standard user:
      install (no UAC prompt), launch offline, create a job, close, reopen.
      Then check the installer's Properties → Digital Signatures and
      `signtool verify /pa`.
- [ ] **Uninstall with the box ticked** ("Also delete my jobs and backups"):
      the second warning appears, and the jobs and default backups are gone.
      Only the unticked (keep) path was tested.
- [ ] **Double-click a `.kerfjob` with KERFuffle closed.** It was only tested
      with KERFuffle already open, where it came to the front with the import
      preview.
- [ ] **Look at the installer pages**: the desktop shortcut box unticked on the
      last page, the install folder shown as `…\Programs\KERFuffle`. These were
      only checked with silent installs.
- [ ] **Left open for a day** (added after review): with a test build
      (`--test-feed`), set `lastCheck` in `%APPDATA%\KERFuffle\update-state.json`
      to 25 hours ago, start KERFuffle, wait 20 s for the first check, then
      publish a newer `latest.json` to the feed. Within the hour, without
      restarting, the header should say "Update ready". (Before the fix,
      KERFuffle only checked once per launch.)
- [ ] **Check for updates during the start-up check:** start a test build with
      a newer version on the feed, and click Settings → About → Check for
      updates about 20 s after start, while the download runs. It should say
      "Checking for updates…" (no "up to date" toast), then switch to
      "Version … is downloaded" when the download finishes.
- [ ] **WebView2 offline:** the installer embeds the small WebView2
      bootstrapper, which downloads WebView2 if a PC lacks it. Windows 10/11
      normally have it. If a shop PC is offline at install time *and* lacks
      it, switch `webviewInstallMode` to `offlineInstaller` (adds about
      130 MB).

Choices made. Keep or change?

- [ ] **Update host: GitHub Releases on this repo.** It has to stay public
      for the apps to read it. CI creates a *draft*; nothing reaches the shop
      until you click Publish.
- [ ] **Updates install with a small progress window** (Tauri's "passive"
      mode) when KERFuffle closes, and don't reopen it. Restart now reopens it.
- [ ] **The first start after an update always takes a backup**, even when
      the database doesn't change.
- [ ] **One KERFuffle window:** opening KERFuffle again (or a `.kerfjob`)
      brings the open window forward instead of starting a second copy.
- [ ] **A silent install (`/S`) still creates a desktop shortcut** (Tauri's
      behavior; `/NS` skips all shortcuts). The normal installer leaves the box
      unticked.

## 8. Construction methods in the app (prompt 10)

Try in the desktop app:

- [ ] **New job → Construction:** the three choices and their diagrams read
      right to you, and the shop default is picked to start with.
- [ ] **Load sample jobs** adds two jobs to try: *Integral toe kick sample*
      (method B) and *Ladder base: two runs* (A1, with a 102″ run that splits).
- [ ] **Workspace:** the drawings for B (sides to the floor, notched), A1 (kick
      skin, rails, sleeper) and A2 (legs, clip-on board) look like how you
      build. They are small at the panel's size; say if they need to be bigger.
- [ ] **Printouts.** Grayscale PDFs of both samples from headless Edge, if you
      want to look first (temporary folder; it may be cleaned up):
      `C:\Users\Owner\AppData\Local\Temp\claude\c--Users-Owner-Documents-websites-KERFuffle\bbd076d3-df5b-408d-a121-ad491f3b7ab5\scratchpad\prints\`

Choices made. Keep or change?

- [ ] **Changing a job made before construction methods lists its base.**
      Those jobs print without a base. Choosing any construction for one in
      the workspace (even the one it shows) adds the base parts from then on.
      Undo puts it back.
- [ ] **A copy keeps its source's construction** in the New job dialog
      unless you pick another.
- [ ] **Settings checks every method setting as all three constructions
      would use it**, not only the default, because each job can pick its
      own. A kick depth too deep for method B blocks Save even while A1 is the
      default.
- [ ] **The Run field only shows for A1** (ladder base). Runs typed while a
      job is A1 are kept if it changes to A2 or B, and come back if it
      changes back.
- [ ] **Group by run** is a view setting that resets when you open another
      job.

## 9. Materials and the purchase estimate (prompt 11)

Automated tests cover the catalog, the add form for each kind, the cut list by
material, the estimate and its CSV. The sample job's estimate is worked out by
hand in `engine/test/estimate.test.ts` ($812.50 with test prices). Checked in
headless Edge in the browser preview only, not in the desktop window.

- [ ] **Try it in the desktop app:** Settings → Materials (add one of each
      kind, edit, duplicate, archive, delete), then a job's Cut list → Show:
      Estimate. Print it, Save PDF and Export CSV (file names end
      "– estimate"), and open the CSV in Excel.
- [ ] **Delete is refused** for a material a job uses, and for one that's a
      default for new jobs. The message says to archive it instead.
- [ ] **Enter your real prices.** The standard materials start with none, so
      every estimate says "Incomplete: n materials need a price" until they're
      priced.
- [ ] **Update prices** on a job after changing a catalog price: it updates
      only when clicked, and the toast offers Undo.

Choices made. Keep or change?

- [ ] **The estimate follows the Include fronts switch.** With fronts on, door
      and front-laminate blanks count toward the sheets, since they're cut
      from the box material (Front is in the Box slot). Turn fronts off to
      leave them out.
- [ ] **Wide shelves have their own slot** ("Wide shelves", default Plywood
      1″), because one Shelves slot can't be both 3/4″ and 1″. The plan
      listed one shelves slot.
- [ ] **Edge banding and the A2 hardware are slots too** (Edge banding,
      Leveling legs, Kick clips), set in Settings like the others.
- [ ] **Method B sides are banded above the kick notch only**, not along the
      notch.
- [ ] **Edge trim for the estimate is a shop setting** (1/4″ each edge, the
      plan's saw-profile default) until prompt 12 adds saw profiles.
- [ ] **A job made before materials** shows the shop defaults (and today's
      prices) until a material is picked or prices are updated; only then is
      a copy saved in the job. Just opening it changes nothing.
- [ ] **"Prices as of"** is the oldest price copy among the materials the job
      uses.
- [ ] **On hand is not copied into the job**: it's the shop's stock, read from
      the catalog. It isn't subtracted when a job is completed (later).
- [ ] **The two seeded HPL sheets are named with their sizes** ("HPL laminate
      48 × 96", "… 60 × 144") so they can be told apart.
- [ ] **New default slot materials** don't check thickness: a 1/4″ inset back
      starts on Birch 3/4″ and shows the thickness warning until you pick
      Birch 1/4″ (or change the Back default in Settings).
- [ ] **`.kerfjob` files are now format 2** (they carry the materials). An
      older KERFuffle refuses them with "made by a newer KERFuffle"; update
      both PCs together. Format 1 files still import.

## 10. Sheet optimizer and saw profiles (prompt 12)

The engine lays the job out on sheets; the screen that shows it is prompt 13,
so for now you can only see the saw profiles. How the optimizer works, what
each measure means and the benchmark numbers: `docs/sheet-optimizer.md`.
Settings → Saw profiles and the cut list's Saw profile picker were checked in
headless Edge in the browser preview only, not in the desktop window.

- [ ] **Check both kerfs against the real blades.** Table saw and Panel saw
      both start at 1/8″ kerf and 1/4″ trim (plan §2.2).
- [ ] **Try it in the desktop app:** Settings → Saw profiles (edit, duplicate,
      Use for new jobs, Remove, Save defaults), then a job's Cut list → Saw
      profile: choose one, Undo, and reopen the job.
- [ ] **The stress fixture has pieces too big for a trimmed 48 × 96 sheet:**
      backs and fronts 48″ wide (and their laminate) don't fit in 47 1/2″.
      They're listed with the reason, not dropped. A real job like that needs
      bigger stock, or less trim on that material.

Choices made. Keep or change?

- [ ] **Fence settings are counted per cutting stage.** All strips of one
      width are ripped before the fence moves; a width that comes up again at
      the trim stage counts again. With grained stock, counting each width once
      would give every layout the same number. Crosscut stops are counted the
      same way.
- [ ] **Grain mode turns nothing,** even on stock without grain (melamine,
      MDF), and places visible pieces (fronts, laminate, kick faces) first.
      Cost mode turns pieces only on stock without grain.
- [ ] **Time mode, over its allowance,** cuts the emptiest few strip sheets
      best-fit to get back within it; if it still can't, it shows the Cost
      layout. On the stress fixture's 3/4″ birch it uses 45 sheets (Cost: 44)
      with 23 fence settings (Cost: 31).
- [ ] **Yield is against the full sheet,** not the trimmed area, since that's
      what's paid for.
- [ ] **Edge trim includes the trim cut's kerf** (so 4 × 11 3/4″ fits across
      48″, as in the plan's example), and the trim cuts aren't counted as cuts.
- [ ] **The smallest safe piece flags, it doesn't refuse.** Narrower pieces
      are laid out and listed so they're cut with care.
- [ ] **Sensitivity tries pieces up to 1/4″ smaller** (allowances up to 1/8″,
      as planned), so the plan's 12 3/4″ wall example is found: it suggests
      the sides 7/32″ narrower (11 25/32″, exactly 4 across), the smallest
      change that saves the sheet.
- [ ] **A light last sheet** is one under 50% used.
- [ ] **The estimate's own edge trim** (Settings → Materials) stays separate
      from the saw profiles' until prompt 13 switches the estimate to layout
      counts.
- [ ] **`.kerfjob` files are now format 3** (they carry the saw profile).
      An older KERFuffle refuses them with "made by a newer KERFuffle";
      update both PCs together. Format 1 and 2 files still import.
- [ ] **The database is now schema 4** (a saw profile copy on each job). The
      shop's profiles are a shop setting. An older app refuses the newer
      database with its usual message.

## 11. Layouts tab, printout and saved layouts (prompt 13)

Cut list → Show: **Layouts**. Checked in headless Edge in the browser preview
(sample job and stress fixture, screen, print and PDF), not in the desktop
window.

- [ ] **Try it in the desktop app:** open a job's Layouts tab, switch Cost ·
      Grain · Time, pick a material and a saw, point at pieces, then Print
      layouts… and Save PDF. Print one on the shop printer in black and white.
- [ ] **Mark a job Ready to cut, restart the app, reopen it:** the Layouts tab
      says "Kept with the job …". Change a cabinet: the banner says "Cut list
      changed since this layout was saved"; Recalculate, then Undo.
- [ ] **Check the printed drawing size.** It's about 4.4″ wide beside the cut
      sequence, so a 96″ sheet is roughly 1:22. Narrow strips (under ~3″) get
      no mark; their pieces are still in the cut sequence.

Choices made. Keep or change?

- [ ] **A draft keeps a layout too, when it's printed or saved as PDF.** It's
      shown again only while the job is unchanged; after any change the draft
      lays itself out again, with no banner.
- [ ] **Ready to cut, Completed and Archived all keep their layouts.** Undoing
      Ready back to Draft keeps the saved layout but stops holding the screen
      to it.
- [ ] **Changing the mode or saw on a Ready job** doesn't replace the kept
      layout: the banner names what changed ("Layout mode changed …") and the
      stats strip shows the other numbers until Recalculate.
- [ ] **Recalculate replaces every material's kept layout** with the one for
      the job as it is now; Undo puts all of them back.
- [ ] **Print layouts prints every material**, not just the one on screen,
      material by material. Two patterns share a page when both cut sequences
      are 12 steps or fewer.
- [ ] **The estimate counts from the layout** once it's finished (saved, or
      worked out for the current mode); until then it's "≈" from area. On the
      sample job, 3/4″ birch drops from ≈ 7 to 6 sheets.
- [ ] **The layout follows "Include fronts"** like the cut list, so the
      estimate and the layout count the same pieces.
- [ ] **A duplicated job doesn't copy the kept layouts** (it's a draft).
- [ ] **`.kerfjob` files are now format 4** (they carry kept layouts). The
      database is schema 5 (`layouts` table). Update both PCs together.
