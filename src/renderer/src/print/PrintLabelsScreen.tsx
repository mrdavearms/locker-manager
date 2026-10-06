import { useEffect, useState } from 'react'
import { AlertTriangle, FileDown, Printer, Ruler } from 'lucide-react'
import type { LabelPreview, LabelSelection } from '@shared/labels'
import { labelsPerSheet } from '@shared/labelGeometry'
import { Banner } from '@renderer/components/Banner'
import { Button } from '@renderer/components/Button'
import { Field, SectionCard, Select, TextInput } from '@renderer/components/Field'
import { useAction, useTerms } from '@renderer/lib/appContext'
import { plural } from '@renderer/lib/format'
import { useRpc } from '@renderer/lib/rpc'
import { SheetPreview } from './SheetPreview'

type Mode = LabelSelection['mode']

/** SPEC.md 4.7 and 5.1: choose labels, see the real sheet, save a PDF or print. */
export function PrintLabelsScreen({ onSettings }: { onSettings: () => void }): React.JSX.Element {
  const terms = useTerms()
  const act = useAction()
  const { data: groups } = useRpc('groups.list', {})
  const { data: areas } = useRpc('locations.list', {})
  const { data: printers } = useRpc('labels.printers.list', {})
  const { data: template } = useRpc('labels.template.get', {})
  const { data: stocks } = useRpc('labels.stocks', {})
  const [mode, setMode] = useState<Mode>('all')
  const [group, setGroup] = useState('')
  const [bankId, setBankId] = useState('')
  const [numbers, setNumbers] = useState('')
  const [startAt, setStartAt] = useState(1)
  const [printer, setPrinter] = useState<string>('')
  const [preview, setPreview] = useState<LabelPreview | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const selection: LabelSelection | null =
    mode === 'group'
      ? group
        ? { mode, group }
        : null
      : mode === 'bank'
        ? bankId
          ? { mode, bankId }
          : null
        : mode === 'lockers'
          ? numbers.trim()
            ? { mode, numbers }
            : null
          : { mode }
  const key = JSON.stringify([selection, startAt])
  const stock = stocks?.find((s) => s.id === template?.stockId)
  const perSheet = stock ? labelsPerSheet(stock) : 14

  useEffect(() => {
    let cancelled = false
    const parsed = JSON.parse(key) as [LabelSelection | null, number]
    if (!parsed[0]) return
    void window.api
      .rpc('labels.preview', { selection: parsed[0], startAt: parsed[1] })
      .then((r) => {
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

  const job = selection ? { selection, startAt, printer: printer || null } : null
  const shown = selection ? preview : null

  return (
    <div className="w-full space-y-6 px-6 py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Print {terms.locker.one.toLowerCase()} labels</h1>
          <p className="mt-1 text-ink-muted">
            {stock ? stock.name : 'Loading…'}. Change the label stock, layout and printer nudge in
            Settings, Labels.
          </p>
        </div>
        <Button variant="secondary" onClick={onSettings}>
          <Ruler size={17} aria-hidden /> Label settings
        </Button>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <div className="space-y-6">
          <SectionCard title="Which labels">
            <fieldset className="space-y-2 text-sm">
              <legend className="sr-only">Which labels</legend>
              {(
                [
                  ['all', `Every ${terms.locker.one.toLowerCase()}`],
                  ['group', `One ${terms.group.one.toLowerCase()}`],
                  ['bank', `One ${terms.bank.one.toLowerCase()}`],
                  ['lockers', `Chosen ${terms.locker.many.toLowerCase()}`],
                  ['changed', 'Changed since the last print'],
                  ['spare', `Spare ${terms.locker.many.toLowerCase()} only`]
                ] as [Mode, string][]
              ).map(([m, label]) => (
                <label key={m} className="flex items-center gap-2.5">
                  <input
                    type="radio"
                    name="label-mode"
                    checked={mode === m}
                    onChange={() => setMode(m)}
                    data-testid={`labels-mode-${m}`}
                  />{' '}
                  {label}
                </label>
              ))}
            </fieldset>
            {mode === 'group' && (
              <div className="mt-3">
                <Select
                  aria-label={terms.group.one}
                  value={group}
                  onChange={(e) => setGroup(e.target.value)}
                >
                  <option value="">Choose…</option>
                  {groups?.map((g) => (
                    <option key={g.code} value={g.code}>
                      {g.display}
                    </option>
                  ))}
                </Select>
              </div>
            )}
            {mode === 'bank' && (
              <div className="mt-3">
                <Select
                  aria-label={terms.bank.one}
                  value={bankId}
                  onChange={(e) => setBankId(e.target.value)}
                >
                  <option value="">Choose…</option>
                  {areas?.flatMap((a) =>
                    a.banks.map((b) => (
                      <option key={b.id} value={b.id}>
                        {a.name} · {b.name}
                      </option>
                    ))
                  )}
                </Select>
              </div>
            )}
            {mode === 'lockers' && (
              <div className="mt-3">
                <Field
                  label={`${terms.locker.one} numbers`}
                  hint="For example 1-10, 15, 102"
                  htmlFor="labels-numbers"
                >
                  <TextInput
                    id="labels-numbers"
                    value={numbers}
                    onChange={(e) => setNumbers(e.target.value)}
                  />
                </Field>
              </div>
            )}
          </SectionCard>

          <SectionCard title="Sheet and printer">
            <div className="space-y-4">
              <Field
                label="Start at label"
                hint="1 is the top-left label. Use a later one for a part-used sheet."
                htmlFor="labels-start"
              >
                <Select
                  id="labels-start"
                  value={startAt}
                  onChange={(e) => setStartAt(Number(e.target.value))}
                >
                  {Array.from({ length: perSheet }, (_, i) => (
                    <option key={i} value={i + 1}>
                      {i + 1}
                    </option>
                  ))}
                </Select>
              </Field>
              {startAt > 1 && (
                <p className="flex gap-2 rounded-xl bg-warn-soft p-3 text-xs">
                  <AlertTriangle size={16} className="shrink-0 text-warn" aria-hidden />
                  Label makers advise against putting a part-used sheet back through a laser
                  printer: the backing can lift and jam. Use a fresh sheet if you can.
                </p>
              )}
              <Field
                label="Printer nudge"
                hint="Set up nudges with the calibration page in Label settings."
                htmlFor="labels-printer"
              >
                <Select
                  id="labels-printer"
                  value={printer}
                  onChange={(e) => setPrinter(e.target.value)}
                >
                  <option value="">None</option>
                  {printers?.map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.name} ({p.right >= 0 ? '+' : ''}
                      {p.right} right, {p.down >= 0 ? '+' : ''}
                      {p.down} down)
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </SectionCard>

          <div className="card space-y-3 p-5">
            <Button
              className="w-full"
              size="lg"
              disabled={!job || busy || !shown || shown.labels === 0}
              data-testid="labels-save-pdf"
              onClick={() =>
                void act(async () => {
                  if (!job) return
                  setBusy(true)
                  try {
                    const r = await window.api.labelsPdf(job)
                    if (r.ok) setSaved(r.path ?? null)
                    else if (!r.cancelled) throw new Error(r.message)
                  } finally {
                    setBusy(false)
                  }
                })
              }
            >
              <FileDown size={18} aria-hidden /> Save as PDF…
            </Button>
            <Button
              className="w-full"
              variant="secondary"
              disabled={!job || busy || !shown || shown.labels === 0}
              onClick={() =>
                void act(async () => {
                  if (!job) return
                  const r = await window.api.labelsPrint(job)
                  if (!r.ok && !r.cancelled) throw new Error(r.message)
                })
              }
            >
              <Printer size={18} aria-hidden /> Print…
            </Button>
            <p className="text-xs text-ink-muted">
              In the print window choose <strong>Actual size</strong> (or 100%). Never choose{' '}
              <strong>Fit to page</strong>: it shrinks everything and the labels will not line up.
            </p>
          </div>
          {saved && (
            <Banner tone="info" title="PDF saved" testId="labels-saved">
              {saved}
              <div className="mt-2">
                <Button size="sm" onClick={() => void window.api.openPdf(saved)}>
                  Open the PDF
                </Button>
              </div>
            </Banner>
          )}
        </div>

        <div className="min-w-0 space-y-4">
          {problem && (
            <Banner tone="bad" title="The preview could not be made">
              {problem}
            </Banner>
          )}
          {shown && (
            <>
              <p className="text-sm text-ink-muted" data-testid="labels-count">
                {plural(shown.labels, 'label')} on {plural(shown.sheets, 'sheet')}.
              </p>
              {shown.tooLong.length > 0 && (
                <Banner
                  tone="warn"
                  title={`${plural(shown.tooLong.length, 'name')} too long to fit`}
                  testId="labels-too-long"
                >
                  Printed at the smallest size and may be cut off:{' '}
                  {shown.tooLong.map((t) => `${t.name} (${t.number})`).join(', ')}. Use a shorter
                  preferred name, or a smaller minimum size in the layout.
                </Banner>
              )}
              {shown.labels > 0 ? (
                <SheetPreview
                  html={shown.html}
                  pageWidthMm={shown.stock.pageWidth}
                  pageHeightMm={shown.stock.pageHeight}
                  sheets={shown.sheets}
                  title="Label sheets"
                />
              ) : (
                <div className="card p-10 text-center text-ink-muted">
                  No labels for that choice.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
