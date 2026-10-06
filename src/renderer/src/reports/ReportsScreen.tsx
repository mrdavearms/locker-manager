import { useEffect, useRef, useState } from 'react'
import { Archive, FileDown, FileSpreadsheet, Printer, ShieldAlert, Table2 } from 'lucide-react'
import {
  REPORTS,
  REPORT_IDS,
  type ReportId,
  type ReportPreview,
  type ReportRequest
} from '@shared/reports'
import { Banner } from '@renderer/components/Banner'
import { Button } from '@renderer/components/Button'
import { Field, SectionCard, Select, TextInput } from '@renderer/components/Field'
import { useAction, useCanEdit, useRevision, useTerms } from '@renderer/lib/appContext'
import { cn } from '@renderer/lib/cn'
import { plural } from '@renderer/lib/format'
import { useRpc } from '@renderer/lib/rpc'

const PX_PER_MM = 96 / 25.4

function weekAgo(): string {
  return new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10)
}

/** The report as it will print, scaled to fit, in a scrolling frame with scripts off. */
function ReportFrame({ html, landscape }: { html: string; landscape: boolean }): React.JSX.Element {
  const box = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(700)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const pageW = (landscape ? 297 : 210) * PX_PER_MM + 2
  const scale = Math.min(1, width / pageW)
  const height = 640
  return (
    <div
      ref={box}
      className="min-w-0 overflow-hidden rounded-xl border border-line bg-white shadow-[var(--shadow-card)]"
      style={{ height }}
    >
      <iframe
        title="Report preview"
        sandbox=""
        srcDoc={html}
        key={html.length}
        style={{
          width: pageW,
          height: height / scale,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          border: 0,
          background: '#fff'
        }}
      />
    </div>
  )
}

/** SPEC.md 4.9, 5.4 and 5.5: lists and reports, printed or exported. */
export function ReportsScreen(): React.JSX.Element {
  const terms = useTerms()
  const act = useAction()
  const canEdit = useCanEdit()
  const revision = useRevision()
  const { data: groups } = useRpc('groups.list', {})
  const [id, setId] = useState<ReportId>('group_lists')
  const [group, setGroup] = useState('')
  const [since, setSince] = useState(weekAgo)
  const [includeCodes, setIncludeCodes] = useState(false)
  const [understood, setUnderstood] = useState(false)
  const [preview, setPreview] = useState<ReportPreview | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [exportCodes, setExportCodes] = useState(false)

  const info = REPORTS[id]
  const request: ReportRequest = {
    id,
    group: info.group && group ? group : null,
    since: info.since && /^\d{4}-\d{2}-\d{2}$/.test(since) ? since : null,
    includeCodes: info.codes === 'always' || (info.codes === 'optional' && includeCodes)
  }
  const withCodes = request.includeCodes
  const key = JSON.stringify([request, revision])

  useEffect(() => {
    let cancelled = false
    const [req] = JSON.parse(key) as [ReportRequest]
    void window.api.rpc('reports.preview', { request: req }).then((r) => {
      if (cancelled) return
      if (r.ok) {
        setPreview(r.value)
        setProblem(null)
      } else setProblem(r.message)
    })
    return () => {
      cancelled = true
    }
  }, [key])

  const blocked = busy || (withCodes && (!canEdit || !understood))
  const run = (
    fn: () => Promise<{
      ok: boolean
      cancelled?: boolean | undefined
      message?: string
      path?: string | undefined
    }>
  ) =>
    void act(async () => {
      setBusy(true)
      try {
        const r = await fn()
        if (r.ok) setSaved(r.path ?? null)
        else if (!r.cancelled) throw new Error(r.message ?? 'That did not work.')
      } finally {
        setBusy(false)
      }
    })

  return (
    <div className="w-full space-y-6 px-6 py-8">
      <header>
        <h1 className="text-3xl font-semibold">Lists and reports</h1>
        <p className="mt-1 text-ink-muted">
          Print them, save them as PDF, or export them for Excel. Codes are hidden on screen.
        </p>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <div className="space-y-6">
          <nav aria-label="Reports" className="card divide-y divide-line overflow-hidden">
            {REPORT_IDS.map((r) => (
              <button
                key={r}
                data-testid={`report-${r}`}
                aria-current={r === id ? 'true' : undefined}
                onClick={() => {
                  setId(r)
                  setUnderstood(false)
                  setIncludeCodes(false)
                  setSaved(null)
                }}
                className={cn(
                  'block w-full px-4 py-3 text-left transition-colors',
                  r === id ? 'bg-panel text-on-panel' : 'hover:bg-surface-muted'
                )}
              >
                <span className="flex items-center gap-2 font-semibold">
                  {REPORTS[r].codes === 'always' && <ShieldAlert size={15} aria-hidden />}
                  {REPORTS[r].title}
                </span>
                <span
                  className={cn('mt-0.5 block text-xs', r === id ? 'opacity-85' : 'text-ink-muted')}
                >
                  {REPORTS[r].description}
                </span>
              </button>
            ))}
          </nav>
        </div>

        <div className="min-w-0 space-y-5">
          <SectionCard title={info.title} description={info.description}>
            <div className="flex flex-wrap items-end gap-4">
              {info.group && (
                <Field label={terms.group.one} htmlFor="report-group">
                  <Select
                    id="report-group"
                    value={group}
                    onChange={(e) => setGroup(e.target.value)}
                  >
                    <option value="">Every {terms.group.one.toLowerCase()}</option>
                    {groups?.map((g) => (
                      <option key={g.code} value={g.code}>
                        {g.display}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
              {info.since && (
                <Field label="Since" htmlFor="report-since">
                  <TextInput
                    id="report-since"
                    type="date"
                    value={since}
                    onChange={(e) => setSince(e.target.value)}
                  />
                </Field>
              )}
              {info.codes === 'optional' && (
                <label className="flex items-center gap-2 pb-2 text-sm">
                  <input
                    type="checkbox"
                    checked={includeCodes}
                    onChange={(e) => {
                      setIncludeCodes(e.target.checked)
                      setUnderstood(false)
                    }}
                  />
                  Include the new codes
                </label>
              )}
            </div>
            {withCodes && (
              <div className="mt-4 rounded-xl border border-bad/40 bg-bad-soft p-4 text-sm">
                <p className="font-semibold">This shows lock codes.</p>
                <p className="mt-1">
                  It is marked CONFIDENTIAL, and every code printed or exported is recorded with
                  your name. Keep the paper locked away and shred it when finished.
                </p>
                <label className="mt-3 flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={understood}
                    onChange={(e) => setUnderstood(e.target.checked)}
                    data-testid="report-understood"
                  />
                  I understand
                </label>
                {!canEdit && (
                  <p className="mt-2 text-xs">
                    The file is open read-only, so codes cannot be printed from this computer now.
                  </p>
                )}
              </div>
            )}
            <div className="mt-5 flex flex-wrap gap-2">
              <Button
                disabled={blocked}
                data-testid="report-save-pdf"
                onClick={() => run(() => window.api.reportPdf({ request }))}
              >
                <FileDown size={17} aria-hidden /> Save as PDF…
              </Button>
              <Button
                variant="secondary"
                disabled={blocked}
                onClick={() =>
                  run(() => window.api.reportPrint({ request }).then((r) => ({ ...r })))
                }
              >
                <Printer size={17} aria-hidden /> Print…
              </Button>
              <Button
                variant="secondary"
                disabled={blocked}
                data-testid="report-export-xlsx"
                onClick={() => run(() => window.api.reportExport({ request, format: 'xlsx' }))}
              >
                <FileSpreadsheet size={17} aria-hidden /> Excel…
              </Button>
              <Button
                variant="secondary"
                disabled={blocked}
                onClick={() => run(() => window.api.reportExport({ request, format: 'csv' }))}
              >
                <Table2 size={17} aria-hidden /> CSV…
              </Button>
            </div>
          </SectionCard>

          {saved && (
            <Banner tone="info" title="Saved" testId="report-saved">
              {saved}
              {saved.toLowerCase().endsWith('.pdf') && (
                <div className="mt-2">
                  <Button size="sm" onClick={() => void window.api.openPdf(saved)}>
                    Open the PDF
                  </Button>
                </div>
              )}
            </Banner>
          )}
          {problem && (
            <Banner tone="bad" title="The preview could not be made">
              {problem}
            </Banner>
          )}
          {preview && (
            <>
              <p className="text-sm text-ink-muted" data-testid="report-rows">
                {plural(preview.rows, 'row')}.
              </p>
              <ReportFrame html={preview.html} landscape={info.landscape} />
            </>
          )}

          <SectionCard
            title="Export everything"
            description="The whole file as one Excel workbook: a sheet for each part, readable by people. Keep it as an archive, or use it to move to another system. It can be turned back into a data file (File, New file from a portable export)."
          >
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={exportCodes}
                onChange={(e) => setExportCodes(e.target.checked)}
              />
              Include lock codes (the workbook is then CONFIDENTIAL, and every code is recorded)
            </label>
            <div className="mt-4">
              <Button
                variant="secondary"
                disabled={busy || (exportCodes && !canEdit)}
                data-testid="export-all"
                onClick={() => run(() => window.api.exportAll(exportCodes))}
              >
                <Archive size={17} aria-hidden /> Export the whole file…
              </Button>
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  )
}
