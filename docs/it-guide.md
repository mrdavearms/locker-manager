# Locker Manager: guide for school IT

_Last updated: 6 October 2026 (version 0.0.2). Sections on the data file, backups and
managed settings arrive with milestones M1 and M8._

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
