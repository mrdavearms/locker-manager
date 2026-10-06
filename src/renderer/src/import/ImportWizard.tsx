import { useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardPaste,
  FileSpreadsheet,
  Info,
  Upload
} from 'lucide-react'
import {
  IMPORT_FIELD_LABELS,
  IMPORT_FIELDS,
  type FilePreview,
  type FileSettings,
  type ImportAnalysis,
  type ImportField,
  type ImportOptions,
  type ImportResult
} from '@shared/importTypes'
import { detectPreset, mapColumns, PRESETS } from '@shared/importPresets'
import { Banner } from '@renderer/components/Banner'
import { Button } from '@renderer/components/Button'
import { Field, SectionCard, Select, TextInput } from '@renderer/components/Field'
import { useAction, useTerms } from '@renderer/lib/appContext'
import { cn } from '@renderer/lib/cn'
import { plural } from '@renderer/lib/format'
import { call } from '@renderer/lib/rpc'

// SPEC.md 4.2: choose files, check the columns, check the problems, compare with
// the file, apply. Nothing changes in the data file until the last step.

type Step = 'choose' | 'columns' | 'check' | 'compare' | 'done'
const STEPS: { id: Step; title: string }[] = [
  { id: 'choose', title: 'Choose files' },
  { id: 'columns', title: 'Columns' },
  { id: 'check', title: 'Check' },
  { id: 'compare', title: 'Compare and import' }
]
const REQUIRED: ImportField[] = ['externalId', 'firstName', 'lastName']

function initialSettings(p: FilePreview): FileSettings {
  const yearSource: FileSettings['yearSource'] =
    p.mapping.yearLevel !== undefined ? 'column' : p.yearFromName ? 'fixed' : 'group'
  return {
    sheetIndex: p.sheetIndex,
    headerRow: p.headerRow,
    mapping: p.mapping,
    yearSource,
    fixedYear: p.yearFromName
  }
}

function ChooseStep({
  onLoaded
}: {
  onLoaded: (importId: string, previews: FilePreview[]) => void
}): React.JSX.Element {
  const input = useRef<HTMLInputElement>(null)
  const act = useAction()
  const [files, setFiles] = useState<File[]>([])
  const [pasted, setPasted] = useState('')
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)

  const load = async (): Promise<void> => {
    setBusy(true)
    await act(async () => {
      const payload = await Promise.all(
        files.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) }))
      )
      const r = await call('import.load', { files: payload, pasted: pasted.trim() ? pasted : null })
      onLoaded(r.importId, r.previews)
    })
    setBusy(false)
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <SectionCard
        title="Your export files"
        description="CSV, Excel (.xlsx or .xls) or OpenDocument (.ods). Choose several at once if your system gives one file per year level."
      >
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            setFiles([...files, ...Array.from(e.dataTransfer.files)])
          }}
          className={cn(
            'flex flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors',
            dragging ? 'border-brand bg-brand-soft' : 'border-line-strong'
          )}
        >
          <Upload size={30} className="text-brand" aria-hidden />
          <p className="mt-3 font-semibold">Drag files here, or</p>
          <input
            ref={input}
            type="file"
            multiple
            accept=".csv,.txt,.tsv,.xlsx,.xls,.ods"
            className="hidden"
            data-testid="import-file-input"
            onChange={(e) => setFiles([...files, ...Array.from(e.target.files ?? [])])}
          />
          <Button className="mt-3" variant="secondary" onClick={() => input.current?.click()}>
            Choose files…
          </Button>
        </div>
        {files.length > 0 && (
          <ul className="mt-4 space-y-2">
            {files.map((f, i) => (
              <li
                key={`${f.name}-${i}`}
                className="flex items-center gap-3 rounded-xl bg-surface-muted px-4 py-2.5 text-sm"
              >
                <FileSpreadsheet size={18} className="text-brand" aria-hidden />
                <span className="flex-1 font-semibold">{f.name}</span>
                <button
                  className="text-ink-muted underline"
                  onClick={() => setFiles(files.filter((_, j) => j !== i))}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
      <SectionCard
        title="Or paste a table"
        description="Select the rows in Excel (including the heading row), copy, and paste here."
      >
        <label htmlFor="import-paste" className="sr-only">
          Pasted table
        </label>
        <textarea
          id="import-paste"
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          className="h-48 w-full rounded-xl border border-line-strong bg-surface p-3 font-mono text-xs"
          placeholder="SUSSI ID	Last Name	First Name	Form Group…"
        />
        <ClipboardPaste size={16} className="mt-2 inline text-ink-muted" aria-hidden />{' '}
        <span className="text-xs text-ink-muted">Ctrl+V (Cmd+V on a Mac) to paste.</span>
      </SectionCard>
      <div className="flex justify-end lg:col-span-2">
        <Button
          size="lg"
          disabled={busy || (files.length === 0 && pasted.trim() === '')}
          onClick={() => void load()}
          data-testid="import-read"
        >
          {busy ? 'Reading…' : 'Read the files'} <ChevronRight size={18} aria-hidden />
        </Button>
      </div>
    </div>
  )
}

function ColumnsStep({
  previews,
  settings,
  onChange
}: {
  previews: FilePreview[]
  settings: FileSettings[]
  onChange: (s: FileSettings[]) => void
}): React.JSX.Element {
  const terms = useTerms()
  return (
    <div className="space-y-6">
      {previews.map((p, i) => {
        const s = settings[i]!
        const rows = p.sheets[s.sheetIndex]?.rows ?? []
        const headers = rows[s.headerRow] ?? []
        const set = (patch: Partial<FileSettings>): void =>
          onChange(settings.map((x, j) => (j === i ? { ...x, ...patch } : x)))
        const remap = (sheetIndex: number, headerRow: number): void => {
          const h = p.sheets[sheetIndex]?.rows[headerRow] ?? []
          set({ sheetIndex, headerRow, mapping: mapColumns(h, detectPreset(h)) })
        }
        const presetName =
          p.presetId === 'saved'
            ? 'the columns you used last time'
            : (PRESETS.find((x) => x.id === detectPreset(headers).id)?.name ?? 'Other')
        const missing = REQUIRED.filter((f) => s.mapping[f] === undefined)
        return (
          <SectionCard
            key={p.fileIndex}
            title={p.fileName}
            description={`Recognised as ${presetName}.${p.encoding && p.encoding !== 'utf-8' ? ` Text encoding: ${p.encoding}.` : ''}`}
          >
            {p.sheets.length > 1 && (
              <div className="mb-4 max-w-xs">
                <Field label="Sheet" htmlFor={`sheet-${i}`}>
                  <Select
                    id={`sheet-${i}`}
                    value={s.sheetIndex}
                    onChange={(e) => remap(Number(e.target.value), 0)}
                  >
                    {p.sheets.map((sh, j) => (
                      <option key={sh.name} value={j}>
                        {sh.name} ({sh.rowCount} rows)
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            )}
            <p className="text-sm text-ink-muted">
              The highlighted row holds the column headings. If it is wrong, click the right row.
            </p>
            <div className="mt-2 max-h-64 overflow-auto rounded-xl border border-line">
              <table className="w-max min-w-full text-xs">
                <tbody>
                  {rows.slice(0, 25).map((r, ri) => (
                    <tr
                      key={ri}
                      onClick={() => remap(s.sheetIndex, ri)}
                      className={cn(
                        'cursor-pointer border-b border-line',
                        ri === s.headerRow
                          ? 'bg-panel font-semibold text-on-panel'
                          : ri < s.headerRow
                            ? 'text-ink-muted opacity-60'
                            : 'hover:bg-surface-muted'
                      )}
                    >
                      <td className="px-2 py-1.5 text-ink-muted tabular-nums">{ri + 1}</td>
                      {r.map((c, ci) => (
                        <td key={ci} className="max-w-48 truncate px-2 py-1.5">
                          {c}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {IMPORT_FIELDS.map((f) => (
                <Field
                  key={f}
                  label={`${f === 'group' ? terms.group.one : f === 'yearLevel' ? terms.yearLevel.one : f === 'externalId' ? terms.studentId.one : IMPORT_FIELD_LABELS[f]}${REQUIRED.includes(f) ? ' (needed)' : ''}`}
                  htmlFor={`map-${i}-${f}`}
                >
                  <Select
                    id={`map-${i}-${f}`}
                    value={s.mapping[f] ?? ''}
                    onChange={(e) => {
                      const next = { ...s.mapping }
                      if (e.target.value === '') delete next[f]
                      else next[f] = Number(e.target.value)
                      set({ mapping: next })
                    }}
                  >
                    <option value="">Not in this file</option>
                    {headers.map((h, hi) => (
                      <option key={hi} value={hi}>
                        {h || `Column ${hi + 1}`}
                      </option>
                    ))}
                  </Select>
                </Field>
              ))}
            </div>
            <fieldset className="mt-5">
              <legend className="text-sm font-semibold">
                Where does each student’s {terms.yearLevel.one.toLowerCase()} come from?
              </legend>
              <div className="mt-2 flex flex-wrap items-center gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name={`ys-${i}`}
                    checked={s.yearSource === 'column'}
                    disabled={s.mapping.yearLevel === undefined}
                    onChange={() => set({ yearSource: 'column' })}
                  />{' '}
                  Its own column
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name={`ys-${i}`}
                    checked={s.yearSource === 'group'}
                    onChange={() => set({ yearSource: 'group' })}
                  />{' '}
                  The {terms.group.one.toLowerCase()} code (07A is year 7)
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name={`ys-${i}`}
                    checked={s.yearSource === 'fixed'}
                    onChange={() => set({ yearSource: 'fixed' })}
                  />{' '}
                  Everyone in this file is year
                </label>
                <TextInput
                  aria-label="Year level for everyone in this file"
                  className="w-20"
                  value={s.fixedYear ?? ''}
                  maxLength={10}
                  disabled={s.yearSource !== 'fixed'}
                  onChange={(e) => set({ fixedYear: e.target.value || null })}
                />
              </div>
            </fieldset>
            {missing.length > 0 && (
              <p className="mt-4 text-sm font-semibold text-bad">
                Choose a column for: {missing.map((f) => IMPORT_FIELD_LABELS[f]).join(', ')}.
              </p>
            )}
          </SectionCard>
        )
      })}
    </div>
  )
}

const SEVERITY_ICON = { error: AlertTriangle, warning: AlertTriangle, info: Info }

function CheckStep({
  analysis,
  options,
  onOptions
}: {
  analysis: ImportAnalysis | null
  options: ImportOptions
  onOptions: (o: ImportOptions) => void
}): React.JSX.Element {
  const terms = useTerms()
  if (!analysis) return <SectionCard title="Checking…">Reading every row…</SectionCard>
  const errors = analysis.problems.filter((p) => p.severity === 'error')
  const warnings = analysis.problems.filter((p) => p.severity === 'warning')
  const infos = analysis.problems.filter((p) => p.severity === 'info')
  return (
    <div className="space-y-6">
      <SectionCard
        title={`${plural(analysis.students.length, 'student')} read`}
        description={`${terms.yearLevel.many}: ${analysis.yearLevelsCovered.join(', ') || 'none found'}.`}
      >
        <div className="grid gap-5 md:grid-cols-2">
          <fieldset>
            <legend className="text-sm font-semibold">Surnames with de, van, von and so on</legend>
            <div className="mt-2 space-y-1 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="particles"
                  checked={options.particles === 'capital'}
                  onChange={() => onOptions({ ...options, particles: 'capital' })}
                />{' '}
                Capitals: De La Rue, Van Bergen
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="particles"
                  checked={options.particles === 'lower'}
                  onChange={() => onOptions({ ...options, particles: 'lower' })}
                />{' '}
                Small letters: de la Rue, van Bergen
              </label>
            </div>
          </fieldset>
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="mt-1 size-4"
              checked={options.wholeSchool}
              onChange={(e) => onOptions({ ...options, wholeSchool: e.target.checked })}
            />
            <span>
              <span className="font-semibold">These files list every student in the school.</span>
              <span className="block text-ink-muted">
                Leave this off if you are importing only some {terms.yearLevel.many.toLowerCase()},
                so students in the others are not listed as possible leavers.
              </span>
            </span>
          </label>
        </div>
      </SectionCard>

      <SectionCard
        title={`${terms.group.many}`}
        description={`How each ${terms.group.one.toLowerCase()} code from the export is shown in the app, on labels and on letters.`}
      >
        <table className="w-full text-sm">
          <thead className="text-left text-ink-muted">
            <tr>
              <th className="pb-2 font-semibold">In the export</th>
              <th className="pb-2 font-semibold">Shown as</th>
              <th className="pb-2 font-semibold">Students</th>
              <th className="pb-2" />
            </tr>
          </thead>
          <tbody>
            {analysis.groupsSeen.map((g) => (
              <tr key={g.code} className="border-t border-line">
                <td className="py-1.5 font-mono">{g.code}</td>
                <td className="py-1.5 pr-3">
                  <TextInput
                    aria-label={`Show ${g.code} as`}
                    className="h-9 max-w-40"
                    value={options.groupMap[g.code] ?? g.display}
                    maxLength={40}
                    onChange={(e) =>
                      onOptions({
                        ...options,
                        groupMap: { ...options.groupMap, [g.code]: e.target.value }
                      })
                    }
                  />
                </td>
                <td className="py-1.5 tabular-nums">{g.count}</td>
                <td className="py-1.5 text-xs text-warn">{g.known ? '' : 'new'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </SectionCard>

      <SectionCard
        title="Problems found"
        description="Rows with a red problem are skipped. Fix them in your student system and import again, or carry on without them."
      >
        {analysis.problems.length === 0 ? (
          <p className="flex items-center gap-2 text-good">
            <CheckCircle2 size={18} aria-hidden /> No problems.
          </p>
        ) : (
          <ul className="max-h-96 space-y-1.5 overflow-auto text-sm" data-testid="import-problems">
            {[...errors, ...warnings, ...infos].map((p, i) => {
              const Icon = SEVERITY_ICON[p.severity]
              return (
                <li key={i} className="flex gap-2">
                  <Icon
                    size={16}
                    className={cn(
                      'mt-0.5 shrink-0',
                      p.severity === 'error'
                        ? 'text-bad'
                        : p.severity === 'warning'
                          ? 'text-warn'
                          : 'text-ink-muted'
                    )}
                    aria-label={p.severity}
                  />
                  <span>
                    {p.fileName && (
                      <span className="text-ink-muted">
                        {p.fileName}
                        {p.row ? `, row ${p.row}` : ''}:{' '}
                      </span>
                    )}
                    {p.message}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </SectionCard>
    </div>
  )
}

function Ticklist<T>({
  title,
  description,
  items,
  keyOf,
  render,
  selected,
  onSelected,
  testId
}: {
  title: string
  description: string
  items: T[]
  keyOf: (t: T) => string
  render: (t: T) => React.ReactNode
  selected: Set<string>
  onSelected: (s: Set<string>) => void
  testId: string
}): React.JSX.Element {
  const all = items.length > 0 && items.every((t) => selected.has(keyOf(t)))
  return (
    <SectionCard
      title={`${title} (${items.length})`}
      description={description}
      actions={
        items.length > 0 ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onSelected(all ? new Set() : new Set(items.map(keyOf)))}
          >
            {all ? 'Untick all' : 'Tick all'}
          </Button>
        ) : undefined
      }
    >
      {items.length === 0 ? (
        <p className="text-sm text-ink-muted">None.</p>
      ) : (
        <ul className="max-h-80 divide-y divide-line overflow-auto" data-testid={testId}>
          {items.map((t) => {
            const k = keyOf(t)
            return (
              <li key={k}>
                <label className="flex cursor-pointer items-start gap-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4"
                    checked={selected.has(k)}
                    onChange={(e) => {
                      const next = new Set(selected)
                      if (e.target.checked) next.add(k)
                      else next.delete(k)
                      onSelected(next)
                    }}
                  />
                  <span className="flex-1">{render(t)}</span>
                </label>
              </li>
            )
          })}
        </ul>
      )}
    </SectionCard>
  )
}

const CHANGE_TEXT: Record<string, string> = {
  name: 'Name',
  yearLevel: 'Year level',
  group: 'Group',
  house: 'House',
  gender: 'Gender',
  email: 'Email',
  preferredName: 'Preferred name',
  returning: 'Back at school'
}

function CompareStep({
  analysis,
  sel,
  onSel
}: {
  analysis: ImportAnalysis
  sel: { add: Set<string>; update: Set<string>; markMissing: Set<string> }
  onSel: (s: { add: Set<string>; update: Set<string>; markMissing: Set<string> }) => void
}): React.JSX.Element {
  const terms = useTerms()
  return (
    <div className="space-y-6">
      <Ticklist
        title="New students"
        description="Ticked students are added."
        items={analysis.newStudents}
        keyOf={(s) => s.externalId}
        selected={sel.add}
        onSelected={(add) => onSel({ ...sel, add })}
        testId="import-new"
        render={(s) => (
          <>
            <span className="font-semibold">
              {s.lastName}, {s.preferredName ?? s.firstName}
            </span>{' '}
            <span className="text-ink-muted">
              {s.externalId} · {terms.yearLevel.one} {s.yearLevel ?? '?'} ·{' '}
              {s.groupDisplay ?? `no ${terms.group.one.toLowerCase()}`}
            </span>
            {s.nameCheck.length > 0 && (
              <span className="ml-2 rounded bg-warn-soft px-1.5 py-0.5 text-xs text-warn">
                check name
              </span>
            )}
            {s.yearConflict && (
              <span className="ml-2 rounded bg-bad-soft px-1.5 py-0.5 text-xs text-bad">
                check year level: looks like {s.yearConflict}
              </span>
            )}
          </>
        )}
      />
      <Ticklist
        title="Changed"
        description="Ticked changes are applied. A name corrected by hand is never replaced."
        items={analysis.changed}
        keyOf={(c) => c.studentId}
        selected={sel.update}
        onSelected={(update) => onSel({ ...sel, update })}
        testId="import-changed"
        render={(c) => (
          <>
            <span className="font-semibold">{c.name}</span>{' '}
            <span className="text-ink-muted">{c.externalId}</span>
            <ul className="mt-0.5 text-ink-muted">
              {c.changes.map((ch) => (
                <li key={ch.field}>
                  {CHANGE_TEXT[ch.field] ?? ch.field}: {ch.from ?? 'blank'} → {ch.to ?? 'blank'}
                </li>
              ))}
              {c.overrideKept && (
                <li>
                  The student system spells the name differently from your correction. Your
                  correction is kept.
                </li>
              )}
            </ul>
          </>
        )}
      />
      <Ticklist
        title="Possible leavers"
        description={`In your file but not in this import. Ticked students go on the Possible leavers list for you to confirm. Nobody is removed and no ${terms.locker.one.toLowerCase()} is taken away by an import.`}
        items={analysis.leavers}
        keyOf={(l) => l.studentId}
        selected={sel.markMissing}
        onSelected={(markMissing) => onSel({ ...sel, markMissing })}
        testId="import-leavers"
        render={(l) => (
          <>
            <span className="font-semibold">{l.name}</span>{' '}
            <span className="text-ink-muted">
              {l.externalId} · {terms.yearLevel.one} {l.yearLevel ?? '?'}
              {l.holdsLocker ? ` · holds a ${terms.locker.one.toLowerCase()}` : ''}
            </span>
          </>
        )}
      />
      <p className="text-sm text-ink-muted">{plural(analysis.unchanged, 'student')} unchanged.</p>
    </div>
  )
}

export function ImportWizard({ onClose }: { onClose: () => void }): React.JSX.Element {
  const act = useAction()
  const [step, setStep] = useState<Step>('choose')
  const [importId, setImportId] = useState<string | null>(null)
  const [previews, setPreviews] = useState<FilePreview[]>([])
  const [settings, setSettings] = useState<FileSettings[]>([])
  const [options, setOptions] = useState<ImportOptions>({
    particles: 'capital',
    groupMap: {},
    wholeSchool: false
  })
  const [analysis, setAnalysis] = useState<ImportAnalysis | null>(null)
  const [sel, setSel] = useState({
    add: new Set<string>(),
    update: new Set<string>(),
    markMissing: new Set<string>()
  })
  const [result, setResult] = useState<ImportResult | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void window.api.rpc('import.options.get', {}).then((r) => r.ok && setOptions(r.value))
  }, [])

  // Re-check whenever the columns or options change on the Check step.
  useEffect(() => {
    if (!importId || (step !== 'check' && step !== 'compare')) return
    let cancelled = false
    void window.api.rpc('import.analyse', { importId, files: settings, options }).then((r) => {
      if (cancelled) return
      if (r.ok) {
        setAnalysis(r.value)
        if (step === 'check') {
          setSel({
            // A student whose year level looks wrong starts unticked: someone must decide.
            add: new Set(
              r.value.newStudents.filter((s) => !s.yearConflict).map((s) => s.externalId)
            ),
            update: new Set(
              r.value.changed
                .filter((c) => c.changes.length > 0 && !c.yearConflict)
                .map((c) => c.studentId)
            ),
            markMissing: new Set(r.value.leavers.map((l) => l.studentId))
          })
        }
      }
    })
    return () => {
      cancelled = true
    }
  }, [importId, settings, options, step])

  const leave = (): void => {
    if (importId) void call('import.discard', { importId }).catch(() => undefined)
    onClose()
  }

  const columnsOk = settings.every(
    (s) =>
      REQUIRED.every((f) => s.mapping[f] !== undefined) &&
      (s.yearSource !== 'fixed' || (s.fixedYear ?? '').trim() !== '')
  )
  const stepIndex = STEPS.findIndex((s) => s.id === step)

  const apply = async (): Promise<void> => {
    if (!importId) return
    setBusy(true)
    await act(async () => {
      const r = await call('import.apply', {
        importId,
        files: settings,
        options,
        selections: {
          add: [...sel.add],
          update: [...sel.update],
          markMissing: [...sel.markMissing]
        },
        profile: previews.map((p) => p.presetId).join(',')
      })
      setResult(r)
      setStep('done')
    })
    setBusy(false)
  }

  return (
    <div className="w-full space-y-6 px-6 py-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-ink-muted">
            Import students
          </p>
          {step !== 'done' && (
            <ol className="mt-3 flex flex-wrap items-center gap-2" aria-label="Steps">
              {STEPS.map((s, i) => (
                <li key={s.id} className="flex items-center gap-2">
                  <span
                    aria-current={s.id === step ? 'step' : undefined}
                    className={cn(
                      'flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-semibold',
                      s.id === step
                        ? 'border-panel bg-panel text-on-panel'
                        : i < stepIndex
                          ? 'border-good/40 bg-good-soft text-good'
                          : 'border-line text-ink-muted'
                    )}
                  >
                    {i + 1}. {s.title}
                  </span>
                  {i < STEPS.length - 1 && (
                    <ChevronRight size={16} className="text-ink-muted" aria-hidden />
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
        <Button variant="secondary" onClick={leave}>
          {step === 'done' ? 'Close' : 'Cancel import'}
        </Button>
      </header>

      {step === 'choose' && (
        <ChooseStep
          onLoaded={(id, p) => {
            setImportId(id)
            setPreviews(p)
            setSettings(p.map(initialSettings))
            setStep('columns')
          }}
        />
      )}
      {step === 'columns' && (
        <ColumnsStep previews={previews} settings={settings} onChange={setSettings} />
      )}
      {step === 'check' && (
        <CheckStep analysis={analysis} options={options} onOptions={setOptions} />
      )}
      {step === 'compare' && analysis && (
        <CompareStep analysis={analysis} sel={sel} onSel={setSel} />
      )}
      {step === 'done' && result && (
        <section className="card p-8 text-center animate-rise" data-testid="import-done">
          <CheckCircle2 size={40} className="mx-auto text-good" aria-hidden />
          <h2 className="mt-3 text-2xl font-semibold">Import finished</h2>
          <p className="mt-2 text-ink-muted">
            {plural(result.added, 'student')} added, {plural(result.updated, 'student')} updated,{' '}
            {plural(result.markedMissing, 'possible leaver')} to check. A backup was kept before the
            change.
          </p>
          <Button className="mt-6" size="lg" onClick={onClose}>
            See the students
          </Button>
        </section>
      )}

      {step !== 'choose' && step !== 'done' && (
        <div className="flex justify-between">
          <Button variant="secondary" onClick={() => setStep(STEPS[stepIndex - 1]!.id)}>
            <ChevronLeft size={18} aria-hidden /> Back
          </Button>
          {step === 'columns' && (
            <Button
              disabled={!columnsOk}
              onClick={() => (setAnalysis(null), setStep('check'))}
              data-testid="import-next"
            >
              Check the rows <ChevronRight size={18} aria-hidden />
            </Button>
          )}
          {step === 'check' && (
            <Button
              disabled={!analysis}
              onClick={() => setStep('compare')}
              data-testid="import-next"
            >
              Compare with your file <ChevronRight size={18} aria-hidden />
            </Button>
          )}
          {step === 'compare' && (
            <Button
              variant="accent"
              size="lg"
              disabled={busy || !analysis}
              onClick={() => void apply()}
              data-testid="import-apply"
            >
              Import {plural(sel.add.size + sel.update.size, 'change')}
            </Button>
          )}
        </div>
      )}
      {step === 'compare' && analysis && analysis.problems.some((p) => p.severity === 'error') && (
        <Banner tone="warn" title="Some rows will be skipped">
          {plural(analysis.problems.filter((p) => p.severity === 'error').length, 'row')} had
          problems (see the Check step) and are not included.
        </Banner>
      )}
    </div>
  )
}
