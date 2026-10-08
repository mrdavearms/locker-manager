import { join } from 'node:path'
import { app, BrowserWindow, shell } from 'electron'
import log from 'electron-log/main'
import { brand } from '@shared/brand'
import type { Preferences } from './prefs/preferences'

// SPEC.md 9.3: if a new version fails to start twice in a row, show a recovery
// screen instead of trying again. A start counts as failed when the window never
// finishes loading. The screen is plain HTML with no scripts, so it works even if
// the main window's code is what fails.

/** Call before creating the main window. True when the recovery screen should show. */
export async function noteStartAttempt(prefs: Preferences): Promise<boolean> {
  if (!app.isPackaged) return false
  const p = prefs.get()
  const sameVersion = p.lastStartedVersion === app.getVersion()
  const failed = sameVersion ? p.failedStarts : 0
  await prefs.update((x) => ({
    ...x,
    failedStarts: failed + 1,
    lastStartedVersion: app.getVersion()
  }))
  if (failed >= 2) log.warn(`start failed ${failed} times in a row; showing recovery`)
  return failed >= 2
}

export async function noteStarted(prefs: Preferences): Promise<void> {
  if (prefs.get().failedStarts !== 0) await prefs.update((x) => ({ ...x, failedStarts: 0 }))
}

const esc = (s: string): string =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

export function showRecovery(prefs: Preferences): BrowserWindow {
  const logs = join(app.getPath('logs'))
  const backups = join(app.getPath('userData'), 'backups')
  const html = `<!doctype html><html lang="en-AU"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>${brand.name}: did not start</title>
<style>
body{font:16px/1.5 system-ui,sans-serif;margin:0;background:#f3efe6;color:#17222b}
main{max-width:640px;margin:48px auto;padding:32px;background:#fffdf8;border-radius:16px;box-shadow:0 10px 30px -18px #17222b88}
h1{font-size:24px;margin:0 0 8px}
ol{padding-left:20px} li{margin:10px 0}
a{color:#0e4a57;font-weight:700}
code{background:#ece6da;padding:2px 6px;border-radius:4px;font-size:14px}
</style></head><body><main>
<h1>${brand.name} did not start properly</h1>
<p>Version ${esc(app.getVersion())} stopped before it opened, twice in a row. Your school’s file is safe:
the app only changes it while it is working, and backups are kept.</p>
<ol>
<li><a href="lmrecovery:retry" target="_blank">Try again</a>.</li>
<li>If it still does not open, <a href="${brand.releasesUrl}" target="_blank">download the previous version</a>
and install it over this one.</li>
<li>If you need an earlier copy of your file, <a href="lmrecovery:backups" target="_blank">open this computer’s backups folder</a>.
Backups ending in <code>.lockers.gz</code> are compressed: unzip one (double-click it on a Mac, or use a tool
such as 7-Zip on Windows) to get a <code>.lockers</code> file you can open.</li>
<li>Tell your IT team. The log file is in <code>${esc(logs)}</code>.</li>
</ol></main></body></html>`
  const win = new BrowserWindow({
    title: brand.name,
    width: 760,
    height: 560,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      javascript: false
    }
  })
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url === 'lmrecovery:retry') {
      void prefs
        .update((x) => ({ ...x, failedStarts: 0 }))
        .finally(() => {
          app.relaunch()
          app.exit(0)
        })
    } else if (url === 'lmrecovery:backups') void shell.openPath(backups)
    else if (url.startsWith(brand.repoUrl)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e) => e.preventDefault())
  void win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
  return win
}
