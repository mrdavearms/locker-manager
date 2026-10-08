# Locker Manager: guide for school IT

_Last updated: 9 October 2026 (version 0.11.0)._

## What it is

A desktop app built with Electron. It runs entirely on the user's computer. There is no
server, no account and no telemetry. The only network traffic is the update check
described below. Source code: https://github.com/mrdavearms/locker-manager (MIT licence).

## Installing

### Windows

The installer is `Locker-Manager-Setup-<version>.exe` from the Releases page. It carries
both x64 and arm64 builds and picks the right one.

| Mode | Command | Installs to |
|---|---|---|
| Per user (default, no admin rights) | run the installer | `%LocalAppData%\Programs\Locker Manager` |
| Per machine, silent, for deployment | `Locker-Manager-Setup-<version>.exe /S /allusers` | `C:\Program Files\Locker Manager` |

Uninstall through Settings > Apps, or run `Uninstall Locker Manager.exe` in the install
folder with `/S` for silent. Uninstalling leaves the app folder in `%AppData%` (see Other
files on each computer); delete it by hand when a computer leaves the school.

The installer registers the `.lockers` file type (double-click opens the app) and
`lockermanager://` links, which the QR codes on labels use to open a locker.

The installer is not yet code-signed, so SmartScreen shows "Windows protected your PC" on
first run. Staff click **More info**, then **Run anyway**. Signing is planned
(docs/signing.md); a signed build removes the prompt.

### macOS

`Locker-Manager-<version>-universal.dmg` runs on Apple silicon and Intel. Drag the app to
Applications. The app is ad-hoc signed and not notarised, so Gatekeeper blocks the first
launch: the user opens it once, then System Settings > Privacy & Security > **Open Anyway**.
For managed Macs, an MDM profile that allows the bundle identifier
`au.com.dandsarmstrong.lockermanager` avoids the prompt. Once an Apple Developer ID
signature is in place the prompt disappears.

## Updates

- The app checks https://github.com/mrdavearms/locker-manager/releases 3 seconds after
  launch and every 4 hours, and on demand from Help > Check for updates.
- An update found at launch, before the user opens a data file, downloads and installs
  straight away and the app restarts into it. The user can press Skip for now. An update
  found later downloads in the background and installs when the user restarts or closes
  the app. The app never restarts during a save, print or import.
- Windows: the installed copy is replaced in place by the NSIS installer; data is untouched.
- macOS: Squirrel.Mac (the usual Electron Mac updater) refuses unsigned builds, so the app
  installs its own updates. It downloads the universal ZIP, checks its SHA-512 against
  `latest-mac.yml`, unpacks it with `ditto`, checks the bundle identifier, version and code
  signature, and after quitting swaps the app bundle with two renames, putting the old one
  back if anything fails. It needs write access to the folder holding the app (usually
  /Applications). Where the user cannot write there, or runs the app from the disk image or
  a translocated copy, the app reports the new version and opens the download page instead.
  On managed Macs, either give users write access to the app, or deploy updates yourself
  and set `autoUpdate` to `false`.
- A failed check (proxy, firewall, offline) is logged and never shown, unless the user
  asked for the check by hand.
- Versions below 1.0.0 are pre-releases and accept pre-release updates. From 1.0.0 the app
  takes only stable releases, unless the user chooses **Test versions too** in Settings,
  This computer. To prevent that, set `updateChannel` to `stable` in managed settings.

### Network needs

Allow outbound HTTPS (port 443) to:

| Host | Used for |
|---|---|
| `github.com` | update check: `/mrdavearms/locker-manager/releases.atom`, `/mrdavearms/locker-manager/releases/latest`, and `/mrdavearms/locker-manager/releases/download/...` |
| `release-assets.githubusercontent.com` | GitHub redirects every `/releases/download/...` address here: `latest.yml`, `latest-mac.yml` and the installers |

Checked on 9 October 2026: a request for a release file on `github.com` answers with a
redirect to `release-assets.githubusercontent.com`, which serves the file. GitHub has
changed this host before (it was `objects.githubusercontent.com`); if updates stop at a
firewall, check where the redirect now points.

The app uses the system proxy. Nothing else is contacted.

## Importing students

Staff import exports from the school's student system (CSV in UTF-8, UTF-16 or Windows-1252;
XLSX; XLS; ODS; or a table pasted from Excel). Files are read on the computer and are not
copied anywhere: their rows go into the data file only when the operator applies the import.
Nothing is sent over the network. Column choices are remembered in the data file, keyed by
the export's heading row.

## The data file

Each school has one data file ending in `.lockers`: a SQLite database (journal mode
DELETE, never WAL, so no side files). Staff keep it in a shared folder: a OneDrive or
SharePoint synced library, Google Drive for desktop, or a network share.

The app never edits the file in place. It reads the whole file into memory, and each save
writes `<name>.lockers.tmp-<random>` beside it, flushes it, reads it back to check it, and
renames it over the original. Before renaming it checks the file on disk is still the version
it last read (SHA-256); if not, it stops and shows the operator a comparison instead of
overwriting. A crash at any point leaves the original intact. Leftover temporary files older
than a day are removed the next time the file is opened.

### Files beside the data file

| File | What it is |
|---|---|
| `Locker data.lockers` | The data. Back this up with your normal backups. |
| `Locker data.lockers.lock` | Who is editing (name, computer, app version, heartbeat every 60 seconds). Deleted on close. Safe to delete only when nobody has the file open. |
| `Locker Manager backups/Locker data/` | The version replaced by each save, with dated names. |
| `Locker data-COMPUTER.lockers`, `Locker data (1).lockers` | Copies made by a sync service. The app finds these and asks the operator to compare. |

### One editor at a time

The first person to open the file edits; everyone else is read-only and sees who is
editing. A lock whose heartbeat is more than 10 minutes old can be taken over, and the
takeover is recorded in the file's history. OneDrive can take a minute to sync the lock
file, so two people who open the file within a minute of each other on different computers
may both start editing. The hash check then stops the second save from overwriting the
first and shows that person a comparison; nothing is lost.

### OneDrive and other sync services

- Keep the file in a folder that is set to **Always keep on this device** on computers
  where it is used often. The app detects a placeholder that has not downloaded (zero bytes
  or a partial file) and asks the operator to wait, rather than opening it.
- Opening a copy from Downloads, a temporary folder or an email attachment shows a warning.
- Deleted files in a synced folder sometimes come back. The app uses unique names for
  temporary files and tidies them, so this is harmless.

## Backups

Each save keeps the version it replaced in two places:

| Place | Path |
|---|---|
| Beside the data file | `<folder>/Locker Manager backups/<file name>/` |
| On each computer that opened it | Windows `%AppData%\Locker Manager\backups\<file id>\`, macOS `~/Library/Application Support/Locker Manager/backups/<file id>/` |

Backups are compressed with gzip and end in `.lockers.gz` (in versions after 0.11.0; older
backups are plain `.lockers` copies and still work). A real data file compresses to about a
third of its size (a 22.5 MB file gives a 7.9 MB backup). Restore them through the app's
**Backups** button, not by double-clicking. To open one outside the app, unzip it first
(macOS Archive Utility, or 7-Zip on Windows) to get a `.lockers` file.

Retention: everything from the last day, the newest of each hour to 7 days, the newest of
each day to 99 days, then the newest of each week while there is room, up to 500 MB per
place (the limit can be raised to 5000 MB in Settings, Storage). Named backups (before an
update to the file format, before a restore, a version set aside in a conflict) are kept
regardless of age and removed last. When the limit is reached, the busiest stages are thinned first so
the backups still span 99 days: weekly backups older than 99 days go, then the last day is
thinned to one per 10 minutes, the hourly week to one per 3, 6, 12 and then 24 hours, the
last day to one an hour, and the daily backups to one per 2, 4, 8 days and so on. Only then
do the oldest backups go. Settings, Storage shows how far back each place really reaches,
notes when backups are being spread out, and warns when the limit cuts them short of 99
days. A school of about 2,000
students has a file of about 24 MB after five years; it needs roughly 1 GB per place to
keep 99 days of backups at about 30 saves a school day. **Backups contain lock codes** (from M4 onwards): the backup folder sits
beside the data file and has the same permissions, so restrict the shared folder to staff
who should see codes.

Before the year rollover archives a year, the app saves and keeps a named backup called
"Before starting <year>" in both backup folders. If neither can be written, the archive
does not happen.

Restoring is done in the app (Backups button) by the person editing. The current version is
kept as a named backup first.

## Printing and PDFs

- Labels and the calibration page are made as PDF files by the app itself (Chromium's
  built-in PDF writer). No printer driver or PDF software is needed to make them.
- **Print…** uses the operating system's print window. Users must choose **Actual size**
  (100%). Scaling to fit moves every label.
- Page sizes in the PDF are within about 0.1 mm of the label maker's sheet size, because
  Chromium sets page sizes in small steps. Label positions are exact.
- Label stock measurements, printer nudges and the label layout are stored in the data file,
  so every computer prints the same way. A nudge belongs to a printer name, not to a computer.
- Labels use the Arimo typeface (SIL Open Font Licence), shipped inside the app, so names
  measure and print the same on Windows and macOS. No fonts are installed on the computer.

## Letters, reports and exports

- Letters, reports and exports are made by the app itself. No Word, mail merge or Excel is
  needed to make them.
- Anything containing lock codes (letters, the master list, a reset list with codes, a
  whole-file export with codes) can only be produced by the person editing the file. Every
  code is recorded in the file's code reveal log with the operator's name and computer.
- Before saving letters, the app measures every letter and refuses to save if any would
  run onto a second page, then checks the PDF has exactly one page per letter.
- CSV exports start with a byte order mark so Excel reads accented names, and cells that
  start with `=`, `+`, `-` or `@` are prefixed with an apostrophe so they never run as
  formulas.
- The whole-file export is an Excel workbook with a "Read me" sheet, a "Lockers" summary,
  one sheet per database table, and a "Files" sheet holding pictures in base64 pieces. The
  key that protects codes in the data file is never exported. Codes are included as plain
  text only if the person exporting ticks the box. Rebuilding a data file from the workbook
  makes a new file with its own identity and a new key; the original data file is not
  touched.
- Pictures for letters are stored inside the data file (PNG, JPEG or SVG, up to 3 MB each).

## Managed settings

School IT can fix some settings for every user on a computer with one JSON file in a folder
ordinary users cannot change:

| Platform | Path |
|---|---|
| Windows | `%ProgramData%\Locker Manager\managed.json` |
| macOS | `/Library/Application Support/Locker Manager/managed.json` |

Every key is optional. A key that is present cannot be changed in the app. The update
settings are marked "Set by your IT team"; a required PIN shows "Required by your IT team";
the default file appears on the Welcome screen; the demo school is simply not offered.

```json
{
  "autoUpdate": false,
  "updateChannel": "stable",
  "defaultDataFile": "\\\\server\\share\\Lockers\\Locker data.lockers",
  "demoEnabled": false,
  "requirePinForCodes": true
}
```

| Key | Effect |
|---|---|
| `autoUpdate` | `false` stops automatic update checks and installs. A user can still check by hand and is sent to the download page. |
| `updateChannel` | `stable` or `beta`. |
| `defaultDataFile` | Shows "Your school's file, set by your IT team" with an **Open it** button on the Welcome screen. |
| `demoEnabled` | `false` hides the demo school. |
| `requirePinForCodes` | `true` means codes cannot be shown, printed or exported until a PIN is set for the file and entered. The PIN cannot then be removed. |

A file that is not valid JSON, or has an unknown key or a wrong value, is ignored as a
whole, and Settings, This computer, says why. The file is read when the app starts.

## Settings on each computer

Appearance (light or dark, text size up to 200%, high contrast) and update choices are kept
per user in `preferences.json` (see Other files on each computer). Nothing about them is in
the data file.

## Privacy settings in the data file

- **PIN for codes**: stored as a salted scrypt hash, never the PIN. After five wrong tries the
  app waits 30 seconds. A correct PIN lasts 10 minutes, in memory only, on that computer.
- **Hide codes after**: 10 seconds to 2 minutes, 30 seconds by default.
- Codes in the file are encrypted with AES-256-GCM using a key kept in the same file. This
  stops casual reading of the file in a database tool. It does not protect against someone
  with the file and the skill to read the key. A passphrase option is a possible later
  addition (SPEC.md 8.6).

## Practice copies and settings files

- A practice copy is written to the app folder (`Practice\` beside `preferences.json`) and
  replaced each time practice starts. It holds the same data as the school's file,
  including codes, so treat that folder like the data file.
- A `.lockersettings` file is JSON. It holds terminology, code rules, lock defaults, label
  stock measurements and layout, printer nudges, the letter and its pictures, and import
  column choices. It never holds students, lockers, codes, the PIN or history.

## Start-up recovery

If a version fails to reach a working window twice in a row, the app shows a plain recovery
page (no scripts) with links to try again, download the previous version, and open the local
backups folder. The count is kept in `preferences.json` (`failedStarts`).

## Other files on each computer

| What | Windows | macOS |
|---|---|---|
| Preferences (operator name, recent files with school names, appearance, update choices, copies the user chose to ignore, start-up counts, whether the tour and getting-started list were seen or hidden) | `%AppData%\Locker Manager\preferences.json` | `~/Library/Application Support/Locker Manager/preferences.json` |
| Practice copy (replaced each time practice starts) | `%AppData%\Locker Manager\Practice\` | `~/Library/Application Support/Locker Manager/Practice/` |
| Demo school (rebuilt every time it is opened) | `%AppData%\Locker Manager\Demo\` | `~/Library/Application Support/Locker Manager/Demo/` |

## Logs

No student names or lock codes are written to logs. Log lines can include file paths, and
so the name of the school's file.

| Platform | Log file |
|---|---|
| Windows | `%AppData%\Locker Manager\logs\main.log` |
| macOS | `~/Library/Logs/Locker Manager/main.log` |

Logs rotate at 2 MB.

## Security model

- The user interface runs in a sandboxed renderer with context isolation and a strict
  Content Security Policy. It has no Node.js access.
- The only bridge to the system is a typed API; every call is validated in the main
  process.
- The app opens external links only on its own GitHub pages.
- One instance per user: opening the app again focuses the running copy.

## Third-party software

The app is built with other open-source software (Electron and Chromium, about 190 npm
packages, and four font families), all under licences that allow it to be shared. The full
list with each licence is in About, **Third-party software**, and in the file
`THIRD-PARTY-NOTICES.txt` in the app's resources folder (Windows: `resources\` in the
install folder; Mac: `Locker Manager.app/Contents/Resources/`). Chromium's own licences are
in `LICENSES.chromium.html` (Windows: the install folder; Mac: the same resources folder).
