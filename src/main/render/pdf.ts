import { randomBytes } from 'node:crypto'
import { unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BrowserWindow, session, type Session } from 'electron'
import { PDFDocument } from 'pdf-lib'
import { guardRenderContents, renderRequestAllowed } from './guard'

// Renders our own HTML to PDF in a hidden window (SPEC.md 5.3): no scripts, no
// network, page size from CSS, zero margins. The page is written to a private
// temporary file (data URLs that big are refused) and removed afterwards.

let render: Session | null = null

/** A session of their own for the hidden windows, where nothing but file and data loads. */
function renderSession(): Session {
  if (!render) {
    render = session.fromPartition('locker-manager-render')
    render.webRequest.onBeforeRequest((details, callback) =>
      callback({ cancel: !renderRequestAllowed(details.url) })
    )
  }
  return render
}

async function withPage<T>(
  html: string,
  fn: (win: BrowserWindow) => Promise<T>,
  javascript = false
): Promise<T> {
  const file = join(tmpdir(), `locker-manager-${randomBytes(8).toString('hex')}.html`)
  await writeFile(file, html, { encoding: 'utf8', mode: 0o600 })
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      session: renderSession(),
      // Only the letter measuring step turns this on, to run our own measuring code;
      // the page's own Content-Security-Policy still forbids any script in it.
      javascript,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      offscreen: false
    }
  })
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  guardRenderContents(win.webContents)
  try {
    // Fonts are embedded as data URLs, so they are ready when the page has loaded.
    await win.loadFile(file)
    return await fn(win)
  } finally {
    win.destroy()
    await unlink(file).catch(() => undefined)
  }
}

export async function htmlToPdf(html: string): Promise<Uint8Array> {
  return withPage(html, async (win) => {
    const pdf = await win.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: true,
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      scale: 1
    })
    return new Uint8Array(pdf)
  })
}

export async function pdfPageCount(bytes: Uint8Array): Promise<number> {
  return (await PDFDocument.load(bytes)).getPageCount()
}

/** Sends the page to a printer through the system print dialog, at 100% with no margins. */
export async function printHtml(
  html: string,
  page: { widthMm: number; heightMm: number }
): Promise<{ printed: boolean; reason?: string }> {
  return withPage(
    html,
    (win) =>
      new Promise((resolve) => {
        win.webContents.print(
          {
            silent: false,
            printBackground: true,
            margins: { marginType: 'none' },
            scaleFactor: 100,
            pageSize: {
              width: Math.round(page.widthMm * 1000),
              height: Math.round(page.heightMm * 1000)
            }
          },
          (printed, reason) => resolve(printed ? { printed } : { printed, reason })
        )
      })
  )
}

/**
 * Letters whose content runs past the end of their page (SPEC.md 5.2: one student
 * per page, guaranteed). Returns the data-student value of each one.
 */
export async function overflowingLetters(html: string): Promise<string[]> {
  return withPage(
    html,
    async (win) =>
      (await win.webContents.executeJavaScript(
        `Array.from(document.querySelectorAll('section.letter')).filter(function (s) {
           var c = s.querySelector('.content');
           var style = getComputedStyle(s);
           var room = s.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
           return c && c.scrollHeight > room + 1;
         }).map(function (s) { return s.getAttribute('data-student'); })`
      )) as string[],
    true
  )
}

/** A report: page size from the CSS (portrait or landscape), with a page-number footer. */
export async function reportToPdf(html: string, footer: string): Promise<Uint8Array> {
  return withPage(html, async (win) => {
    const pdf = await win.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: footer
    })
    return new Uint8Array(pdf)
  })
}

/** Sends a report to a printer through the system print dialog. */
export async function printReport(
  html: string,
  opts: { landscape: boolean; footer: string }
): Promise<{ printed: boolean; reason?: string }> {
  return withPage(
    html,
    (win) =>
      new Promise((resolve) => {
        win.webContents.print(
          {
            silent: false,
            printBackground: true,
            landscape: opts.landscape,
            pageSize: 'A4',
            footer: opts.footer
          },
          (printed, reason) => resolve(printed ? { printed } : { printed, reason })
        )
      })
  )
}
