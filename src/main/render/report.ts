import type { ReportData } from '@shared/reports'
import { fontFaceCss } from './fonts'
import { esc } from './html'

// Reports as HTML tables (SPEC.md 5.4): school name, title and print date at the
// top, table headings repeated on every page, a CONFIDENTIAL banner and watermark
// on anything with codes. Page numbers come from the PDF footer.

export interface ReportPage {
  school: string
  printedAt: Date
  /** Screen preview: a grey surround and the page width shown. */
  preview: boolean
}

export function reportDate(d: Date): string {
  return d.toLocaleString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

export function buildReportHtml(report: ReportData, page: ReportPage): string {
  const total = report.columns.reduce((n, c) => n + c.width, 0)
  const colgroup = `<colgroup>${report.columns
    .map((c) => `<col style="width:${((c.width / total) * 100).toFixed(2)}%">`)
    .join('')}</colgroup>`
  const head = `<thead><tr>${report.columns.map((c) => `<th>${esc(c.label)}</th>`).join('')}</tr></thead>`
  const cell = (kind: string | undefined, v: string): string =>
    kind === 'tick'
      ? '<td class="tick"><span class="box"></span></td>'
      : kind === 'blank'
        ? '<td class="blank"></td>'
        : kind === 'code'
          ? `<td class="code">${esc(v)}</td>`
          : `<td>${esc(v)}</td>`
  const sections = report.sections
    .map((s, i) => {
      const rows =
        s.rows.length === 0
          ? `<tr><td class="none" colspan="${report.columns.length}">Nothing to list.</td></tr>`
          : s.rows
              .map(
                (r) =>
                  `<tr>${report.columns.map((c) => cell(c.kind, r[c.key] ?? '')).join('')}</tr>`
              )
              .join('')
      return `<section class="sec${report.breakBetween && i > 0 ? ' brk' : ''}">${
        s.heading ? `<h2>${esc(s.heading)}</h2>` : ''
      }${report.breakBetween || i === 0 ? titleBlock(report, page) : ''}<table>${colgroup}${head}<tbody>${rows}</tbody></table></section>`
    })
    .join('')
  const size = report.landscape ? 'A4 landscape' : 'A4'
  const width = report.landscape ? 297 : 210
  return `<!doctype html><html lang="en-AU"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src data:"><title>${esc(
    report.title
  )}</title><style>${fontFaceCss()}
@page{size:${size};margin:14mm 12mm 16mm}
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{font-family:LMArimo,Arial,sans-serif;font-size:9.5pt;color:#111;-webkit-print-color-adjust:exact;print-color-adjust:exact;${
    page.preview ? `background:#fff;padding:10mm 12mm;width:${width}mm` : ''
  }}
.sec.brk{break-before:page;page-break-before:always}
.top{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:0.5mm solid #111;padding-bottom:2mm;margin-bottom:3mm}
.top .school{font-size:9pt;color:#444}
.top h1{margin:0;font-size:16pt}
.top .sub{font-size:10pt;color:#333}
.top .when{font-size:8pt;color:#555;text-align:right}
h2{font-size:12pt;margin:0 0 2mm}
.note{font-size:9pt;color:#333;margin:0 0 3mm;max-width:180mm}
.conf{border:0.5mm solid #b00020;color:#b00020;font-weight:700;padding:1.5mm 3mm;margin:0 0 3mm;font-size:9.5pt}
.wm{position:fixed;top:40%;left:0;right:0;text-align:center;font-size:72pt;font-weight:700;color:rgba(176,0,32,.09);transform:rotate(-28deg);pointer-events:none}
table{width:100%;border-collapse:collapse;table-layout:fixed}
thead{display:table-header-group}
tr{break-inside:avoid;page-break-inside:avoid}
th{text-align:left;font-size:8.5pt;text-transform:uppercase;letter-spacing:.04em;border-bottom:0.4mm solid #111;padding:1.6mm 1.5mm}
td{border-bottom:0.2mm solid #bbb;padding:1.7mm 1.5mm;vertical-align:top;overflow-wrap:anywhere}
td.code{font-weight:700;letter-spacing:.12em}
td.blank{height:9mm}
td.tick .box{display:inline-block;width:4mm;height:4mm;border:0.35mm solid #111;border-radius:0.6mm}
td.none{color:#666;font-style:italic}
</style></head><body>${report.confidential ? '<div class="wm">CONFIDENTIAL</div>' : ''}${sections}</body></html>`
}

function titleBlock(report: ReportData, page: ReportPage): string {
  return `<div class="top"><div><div class="school">${esc(page.school)}</div><h1>${esc(report.title)}</h1>${
    report.subtitle ? `<div class="sub">${esc(report.subtitle)}</div>` : ''
  }</div><div class="when">Printed ${esc(reportDate(page.printedAt))}</div></div>${
    report.confidential
      ? '<div class="conf">CONFIDENTIAL: contains lock codes. Keep it locked away and shred it when finished.</div>'
      : ''
  }${report.note ? `<p class="note">${esc(report.note)}</p>` : ''}`
}

/** The footer Chromium prints on every page of the PDF. */
export function reportFooter(report: ReportData, page: ReportPage): string {
  return `<div style="font-family:Arial,sans-serif;font-size:7.5pt;color:#555;width:100%;padding:0 12mm;display:flex;justify-content:space-between"><span>${esc(
    page.school
  )} · ${esc(report.title)}${report.confidential ? ' · CONFIDENTIAL' : ''}</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`
}
