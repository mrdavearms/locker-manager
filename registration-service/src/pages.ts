import type { Registration } from './logic'
import { sentFrom } from './mail'

export interface Page {
  status: number
  html: string
}

/** Every piece of text a registrant typed goes through this before it reaches a page. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const e = escapeHtml

/** "2 November 2026", in Victorian time. */
export function longDate(iso: string): string {
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Melbourne',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(new Date(iso))
}

const STYLE = `
  body { font-family: system-ui, sans-serif; max-width: 52rem; margin: 2rem auto; padding: 0 1rem; color: #1a1a1a; }
  table { border-collapse: collapse; }
  th, td { text-align: left; padding: 0.35rem 0.75rem 0.35rem 0; border-bottom: 1px solid #ddd; vertical-align: top; }
  form { display: inline-block; margin: 1rem 1rem 0 0; padding: 1rem; border: 1px solid #ccc; border-radius: 6px; }
  button { font-size: 1rem; padding: 0.5rem 1rem; }
  .note { color: #555; }
  code { word-break: break-all; }
`

function page(status: number, title: string, body: string): Page {
  return {
    status,
    html: `<!doctype html>
<html lang="en-AU">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${e(title)}</title>
<style>${STYLE}</style>
</head>
<body>
${body}
</body>
</html>
`
  }
}

export function notFoundPage(): Page {
  return page(404, 'Not found', '<h1>Not found</h1><p>This link is not valid.</p>')
}

function detailsTable(row: Registration): string {
  const lines: [string, string][] = [
    ['Number', row.id],
    ['Received', longDate(row.createdAt)],
    ['Name', row.name],
    ['School', row.school],
    ['Email', row.email],
    ['State', row.state],
    ['Role', row.role ?? '(not given)'],
    ['Sent from', sentFrom(row)]
  ]
  return `<table>${lines.map(([k, v]) => `<tr><th>${k}</th><td>${e(v)}</td></tr>`).join('')}</table>`
}

function decisionLine(row: Registration): string {
  const word = row.status === 'approved' ? 'approved' : 'rejected'
  return `Already ${word} on ${row.decidedAt ? longDate(row.decidedAt) : 'an earlier day'}.`
}

/** Dave's review page. Opening it changes nothing; only the buttons do. */
export function reviewPage(row: Registration, baseUrl: string): Page {
  const action = e(`${baseUrl}/decide`)
  const hidden = (decision: string): string =>
    `<input type="hidden" name="id" value="${e(row.id)}">` +
    `<input type="hidden" name="token" value="${e(row.reviewToken)}">` +
    `<input type="hidden" name="decision" value="${decision}">`
  const buttons =
    row.status === 'waiting'
      ? `<form method="post" action="${action}">${hidden('approve')}
<button type="submit">Approve and send key</button>
</form>
<form method="post" action="${action}">${hidden('reject')}
<p><label><input type="checkbox" name="sendRejectEmail" value="yes"> Send a short, polite rejection email</label></p>
<button type="submit">Reject</button>
</form>`
      : `<p><strong>${e(decisionLine(row))}</strong></p>`
  return page(
    200,
    `Registration ${row.id}`,
    `<h1>Locker Manager registration</h1>
${detailsTable(row)}
${buttons}`
  )
}

/** What Dave sees after pressing a button. */
export function decidedPage(
  row: Registration,
  outcome: 'emailed' | 'not_emailed' | 'email_failed'
): Page {
  const approved = row.status === 'approved'
  const heading = approved ? 'Approved' : 'Rejected'
  let message: string
  if (outcome === 'emailed')
    message = approved
      ? `The key has been emailed to ${e(row.email)}.`
      : `A rejection email has been sent to ${e(row.email)}.`
  else if (outcome === 'not_emailed') message = 'No email was sent.'
  else
    message = approved
      ? `The key could not be emailed. Send it to ${e(row.email)} by hand.`
      : `The rejection email could not be sent to ${e(row.email)}.`
  const key = approved && row.key ? `<p>Key:</p><p><code>${e(row.key)}</code></p>` : ''
  return page(
    200,
    `${heading}: ${row.id}`,
    `<h1>${heading}: ${e(row.school)}</h1>
<p>${message}</p>
${key}
${detailsTable(row)}`
  )
}

/** Every registration, newest first. */
export function listPage(rows: Registration[], csvLink: string): Page {
  const head = [
    'Number',
    'Received',
    'Name',
    'School',
    'Email',
    'State',
    'Role',
    'Status',
    'Decided'
  ]
  const body = rows
    .map((r) =>
      [
        r.id,
        longDate(r.createdAt),
        r.name,
        r.school,
        r.email,
        r.state,
        r.role ?? '',
        r.status,
        r.decidedAt ? longDate(r.decidedAt) : ''
      ]
        .map((v) => `<td>${e(v)}</td>`)
        .join('')
    )
    .map((cells) => `<tr>${cells}</tr>`)
    .join('\n')
  return page(
    200,
    'Locker Manager registrations',
    `<h1>Locker Manager registrations</h1>
<p>${rows.length} registration${rows.length === 1 ? '' : 's'}. <a href="${e(csvLink)}">Download as CSV</a> (opens in Excel).</p>
<table>
<tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr>
${body}
</table>`
  )
}

/** Cells that start like a formula are made plain text, so a spreadsheet never runs them. */
function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

export function listCsv(rows: Registration[]): string {
  const head = [
    'Number',
    'Received',
    'Name',
    'School',
    'Email',
    'State',
    'Role',
    'Status',
    'Decided',
    'Sent from'
  ]
  const lines = rows.map((r) =>
    [
      r.id,
      r.createdAt,
      r.name,
      r.school,
      r.email,
      r.state,
      r.role ?? '',
      r.status,
      r.decidedAt ?? '',
      r.source === 'app' ? `app ${r.appVersion ?? ''}`.trim() : 'website'
    ]
      .map(csvCell)
      .join(',')
  )
  // A byte order mark tells Excel the file is UTF-8, so accented names survive.
  return '﻿' + [head.join(','), ...lines].join('\r\n') + '\r\n'
}
