# Moving a job to the other PC

Each PC keeps its own jobs. They don't sync. To work on a job on the other PC,
you move it there in a **job file**: one job, in a file that ends in
`.kerfjob`. A USB stick or an email works.

## 1. On the PC that has the job: export it

1. On the **Jobs** screen, click **⋯** on the job's row, then **Export job file…**
   (If the job is open, you can use the export button at the top right, next to
   Undo and Redo.)
2. Choose where to save it. It suggests your **Documents\KERFuffle** folder,
   but you can save straight to the USB stick. The file is named after the job,
   like `Kitchen remodel (J-0014).kerfjob`.
3. Copy the file to the USB stick, or attach it to an email.

Any edits you just made are saved into the file first.

## 2. On the other PC: import it

1. Put the file somewhere you can find it (or leave it on the USB stick).
2. On the **Jobs** screen, click **Import job…** and pick the file. You can also
   drag the file from File Explorer onto the Jobs screen.
3. KERFuffle shows you what's in the file: the job name, number, number of
   cabinets, and when it was exported. Click **Import**.

The job shows up in the list, and a message offers to **Open** it.

## If the job is already on this PC

When you move a job back and forth, it will already be on the PC you're
importing to. KERFuffle asks what to do:

- **Import as a copy** (the usual choice): you get both. The one from the file
  is added as "… (copy)", and the one already here isn't touched.
- **Replace existing**: the job on this PC becomes the one in the file.
  KERFuffle asks you to confirm, and backs up all your jobs first. If you
  replace the wrong one, use **Restore backup…** at the bottom of the Jobs
  screen to get it back.

**Tip:** edit a job on one PC at a time. When you switch PCs, export it, import
it on the other PC with **Replace existing**, and carry on there. If a job got
changed on both PCs, import it **as a copy** and compare the two before you
delete one.

## Messages you might see

| Message | What to do |
|---|---|
| "This job was made by a newer KERFuffle. Update this PC first." | The other PC has a newer version. Install the same version on this PC, then import again. |
| "This job file was changed or damaged after it was exported…" | The file got changed on the way. Export it again on the other PC. Don't open the file in other programs. |
| "J-0014 is already used on this PC, so the job gets the next free number." | Nothing to do. Each PC numbers its own jobs, so the job gets a new number here. |
| "2 cabinets need attention." | Those cabinets had a problem on the other PC too, such as a missing size. They come across as they are. Fix them in the job, the same as on the other PC. |
| "Only KERFuffle job files (.kerfjob) can be imported." | You picked or dropped some other kind of file. |

## Good to know

- **A job keeps its own construction settings** (panel thickness, toe kick and
  the rest) from the PC it was made on. The Settings on this PC are for new
  jobs only and don't change it.
- **A job file holds one job.** It isn't a backup. Backups hold every job on a
  PC and stay on that PC.
- **Backups happen by themselves** every day you open KERFuffle, in
  **Documents\KERFuffle\Backups** (you can change the folder in Settings). The
  Jobs screen shows the last one, and you can click **Back up now** any time.
