# Locker Manager: guide for school IT

_Last updated: 6 October 2026 (version 0.1.0). Managed settings arrive with milestone M8._

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
folder with `/S` for silent.

The installer is not yet code-signed, so SmartScreen shows "Windows protected your PC" on
first run. Staff click **More info**, then **Run anyway**. Signing is planned
(docs/signing.md); a signed build removes the prompt.

### macOS

`Locker-Manager-<version>-universal.dmg` runs on Apple silicon and Intel. Drag the app to
Applications. The app is ad-hoc signed and not notarised, so Gatekeeper blocks the first
launch: the user opens it once, then System Settings > Privacy & Security > **Open Anyway**.
For managed Macs, an MDM profile that allows the bundle identifier
`au.com.dandsarmstrong.lockermanager` avoids the prompt. Once an Apple Developer ID
signature is in place the prompt disappears and Mac updates install themselves.

## Updates

- The app checks https://github.com/mrdavearms/locker-manager/releases 30 seconds after
  launch and every 4 hours, and on demand from Help > Check for updates.
- Windows: the update downloads in the background and installs when the user restarts the
  app or closes it. The installed copy is replaced in place; data is untouched.
- macOS: while unsigned, the app only reports the new version and opens the download page.
- A failed check (proxy, firewall, offline) is logged and never shown, unless the user
  asked for the check by hand.
- Versions below 1.0.0 are pre-releases and accept pre-release updates. From 1.0.0 the app
  takes only stable releases.

### Network needs

Allow outbound HTTPS (port 443) to:

| Host | Used for |
|---|---|
| `github.com` | update check (`/mrdavearms/locker-manager/releases.atom` and `/releases/download/...`) |
| `objects.githubusercontent.com` | the installer download, by redirect from the address above |

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

Retention: everything from the last 7 days, the newest of each day for 3 months, then the
newest of each week, up to 500 MB per place. Named backups (before an update to the file
format, before a restore, a version set aside in a conflict) are kept regardless of age
and removed last. **Backups contain lock codes** (from M4 onwards): the backup folder sits
beside the data file and has the same permissions, so restrict the shared folder to staff
who should see codes.

Restoring is done in the app (Backups button) by the person editing. The current version is
kept as a named backup first.

## Other files on each computer

| What | Windows | macOS |
|---|---|---|
| Preferences (operator name, recent files) | `%AppData%\Locker Manager\preferences.json` | `~/Library/Application Support/Locker Manager/preferences.json` |
| Demo school (rebuilt every time it is opened) | `%AppData%\Locker Manager\Demo\` | `~/Library/Application Support/Locker Manager/Demo/` |

## Logs

No student names or lock codes are ever written to logs.

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
