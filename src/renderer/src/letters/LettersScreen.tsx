import { useEffect, useState } from 'react'
import { AlertTriangle, ChevronLeft, ChevronRight, FileDown, PenLine, Printer } from 'lucide-react'
import type { LetterLanguage, LetterPreview, LetterSelection } from '@shared/letters'
import { Banner } from '@renderer/components/Banner'
import { Button } from '@renderer/components/Button'
import { Field, SectionCard, Select, TextInput } from '@renderer/components/Field'
import { useAction, useCanEdit, useRevision, useTerms } from '@renderer/lib/appContext'
import { plural } from '@renderer/lib/format'
import { useRpc } from '@renderer/lib/rpc'
import { SheetPreview } from '@renderer/print/SheetPreview'
import { useCodeGate } from '@renderer/components/PinGate'

type Mode = Exclude<LetterSelection['mode'], 'student'>

/** SPEC.md 4.8: letters to students, one per page, codes hidden on screen. */
export function LettersScreen({ onDesign }: { onDesign: () => void }): React.JSX.Element {
  const terms = useTerms()
  const act = useAction()
  const gate = useCodeGate()
  const canEdit = useCanEdit()
  const revision = useRevision()
  const { data: groups } = useRpc('groups.list', {})
  const { data: areas } = useRpc('locations.list', {})
  const { data: template } = useRpc('letters.template.get', {})
  const [mode, setMode] = useState<Mode>('all')
  const [group, setGroup] = useState('')
  const [bankId, setBankId] = useState('')
  const [numbers, setNumbers] = useState('')
  const [lang, setLang] = useState<string>('')
  const [index, setIndex] = useState(0)
  const [preview, setPreview] = useState<LetterPreview | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [overflow, setOverflow] = useState<{ key: string; names: string[] } | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const selection: LetterSelection | null =
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
  const languages = template?.languages ?? []
  const language: LetterLanguage =
    lang === 'each' ? { kind: 'each' } : { kind: 'one', code: lang || languages[0]?.code || 'en' }
  const key = JSON.stringify([selection, language])
  const previewKey = JSON.stringify([key, index, revision])

  useEffect(() => {
    let cancelled = false
    const [sel, lg, i] = [...(JSON.parse(key) as [LetterSelection | null, LetterLanguage]), index]
    if (!sel) return
    void window.api.rpc('letters.preview', { selection: sel, language: lg, index: i }).then((r) => {
      if (cancelled) return
      if (r.ok) {
        setPreview(r.value)
        setProblem(null)
      } else setProblem(r.message)
    })
    return () => {
      cancelled = true
    }
  }, [previewKey, key, index])

  // Every letter is measured in the background; any that would spill onto a
  // second page is named before anyone presses Save.
  const checkKey = JSON.stringify([key, revision])
  useEffect(() => {
    let cancelled = false
    const [sel, lg] = JSON.parse(key) as [LetterSelection | null, LetterLanguage]
    if (!sel) return
    const t = setTimeout(() => {
      void window.api.lettersCheck({ selection: sel, language: lg }).then((r) => {
        if (!cancelled) setOverflow({ key: checkKey, names: r.overflow })
      })
    }, 400)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [checkKey, key])

  const shown = selection ? preview : null
  const checking = !overflow || overflow.key !== checkKey
  const job = selection ? { selection, language } : null
  const ready = !!job && !!shown && shown.letters > 0 && !busy

  return (
    <div className="w-full space-y-6 px-6 py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Print letters</h1>
          <p className="mt-1 text-ink-muted">
            One letter per student, with their {terms.locker.one.toLowerCase()} and code. Codes are
            hidden on screen and printed in the PDF.
          </p>
        </div>
        <Button variant="secondary" onClick={onDesign}>
          <PenLine size={17} aria-hidden /> Change the letter
        </Button>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <div className="space-y-6">
          <SectionCard title="Which letters">
            <fieldset className="space-y-2 text-sm">
              <legend className="sr-only">Which letters</legend>
              {(
                [
                  ['all', 'Every student with a locker'],
                  ['group', `One ${terms.group.one.toLowerCase()}`],
                  ['bank', `One ${terms.bank.one.toLowerCase()}`],
                  ['lockers', `Chosen ${terms.locker.many.toLowerCase()}`],
                  ['changed', 'New lockers and codes since the last letters']
                ] as [Mode, string][]
              ).map(([m, label]) => (
                <label key={m} className="flex items-center gap-2.5">
                  <input
                    type="radio"
                    name="letter-mode"
                    checked={mode === m}
                    onChange={() => {
                      setMode(m)
                      setIndex(0)
                    }}
                    data-testid={`letters-mode-${m}`}
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
                  onChange={(e) => {
                    setGroup(e.target.value)
                    setIndex(0)
                  }}
                >
                  <option value="">Choose…</option>
                  {groups
                    ?.filter((g) => !g.excluded)
                    .map((g) => (
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
                  onChange={(e) => {
                    setBankId(e.target.value)
                    setIndex(0)
                  }}
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
                  htmlFor="letters-numbers"
                >
                  <TextInput
                    id="letters-numbers"
                    value={numbers}
                    onChange={(e) => {
                      setNumbers(e.target.value)
                      setIndex(0)
                    }}
                  />
                </Field>
              </div>
            )}
            <p className="mt-4 text-xs text-ink-muted">
              Spare {terms.locker.many.toLowerCase()} never get a letter.
            </p>
          </SectionCard>

          {languages.length > 1 && (
            <SectionCard title="Language">
              <Select
                aria-label="Language"
                value={lang || languages[0]!.code}
                onChange={(e) => setLang(e.target.value)}
                data-testid="letters-language"
              >
                {languages.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.name}
                  </option>
                ))}
                <option value="each">Each student’s own language</option>
              </Select>
              <p className="mt-2 text-xs text-ink-muted">
                Set a student’s language on the Students screen. Students without one get{' '}
                {languages[0]!.name}.
              </p>
            </SectionCard>
          )}

          <div className="card space-y-3 p-5">
            <Button
              className="w-full"
              size="lg"
              disabled={!ready || !canEdit}
              data-testid="letters-save-pdf"
              onClick={() =>
                void act(async () => {
                  if (!job || !(await gate())) return
                  setBusy(true)
                  try {
                    const r = await window.api.lettersPdf(job)
                    if (r.ok) setSaved(r.path ?? null)
                    else if (!r.cancelled) throw new Error(r.message)
                  } finally {
                    setBusy(false)
                  }
                })
              }
            >
              <FileDown size={18} aria-hidden /> {busy ? 'Making the PDF…' : 'Save as PDF…'}
            </Button>
            <Button
              className="w-full"
              variant="secondary"
              disabled={!ready || !canEdit}
              onClick={() =>
                void act(async () => {
                  if (!job || !(await gate())) return
                  const r = await window.api.lettersPrint(job)
                  if (!r.ok && !r.cancelled) throw new Error(r.message)
                })
              }
            >
              <Printer size={18} aria-hidden /> Print…
            </Button>
            <p className="text-xs text-ink-muted" data-testid="letters-rule">
              Letters print only while the file is open for editing, because every code printed is
              recorded in the history with your name.{' '}
              {canEdit
                ? 'Print at Actual size (100%).'
                : 'The file is open read-only on this computer, so wait until the person editing closes it.'}
            </p>
          </div>
          {saved && (
            <Banner tone="info" title="PDF saved" testId="letters-saved">
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
          {shown && shown.heldBack.length > 0 && (
            <Banner
              tone="warn"
              title={`${plural(shown.heldBack.length, 'letter')} held back`}
              testId="letters-held-back"
            >
              These locks need sorting out before their letters can go:{' '}
              {shown.heldBack
                .slice(0, 8)
                .map((h) => `${h.name} (${h.locker}): ${h.reason.replace(/\.$/, '')}`)
                .join('; ')}
              {shown.heldBack.length > 8 ? '; and others' : ''}. See Locks to reset on Home.
            </Banner>
          )}
          {!checking && overflow.names.length > 0 && (
            <Banner
              tone="bad"
              title="Some letters do not fit on one page"
              testId="letters-overflow"
            >
              {overflow.names.slice(0, 6).join(', ')}
              {overflow.names.length > 6 ? ' and others' : ''}. Shorten the words or make a picture
              smaller in Settings, Letters. Nothing will print until every letter fits.
            </Banner>
          )}
          {shown && shown.tooLong.length > 0 && (
            <p className="flex gap-2 rounded-xl bg-warn-soft p-3 text-xs">
              <AlertTriangle size={16} className="shrink-0 text-warn" aria-hidden />
              This name is printed at the smallest size: {shown.tooLong.join(', ')}.
            </p>
          )}
          {shown && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-ink-muted" data-testid="letters-count">
                {shown.letters > 0
                  ? `Letter ${shown.index + 1} of ${shown.letters}.`
                  : 'No letters for that choice.'}{' '}
                {shown.letters > 0 &&
                  (checking ? 'Checking every letter fits…' : 'Every letter fits on one page.')}
              </p>
              {shown.letters > 1 && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={shown.index === 0}
                    onClick={() => setIndex(Math.max(0, shown.index - 1))}
                    aria-label="Previous letter"
                  >
                    <ChevronLeft size={16} aria-hidden /> Previous
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={shown.index >= shown.letters - 1}
                    onClick={() => setIndex(shown.index + 1)}
                    aria-label="Next letter"
                    data-testid="letters-next"
                  >
                    Next <ChevronRight size={16} aria-hidden />
                  </Button>
                </div>
              )}
            </div>
          )}
          {shown && shown.letters > 0 && (
            <div className="mx-auto max-w-2xl">
              <SheetPreview
                html={shown.html}
                pageWidthMm={shown.pageWidth}
                pageHeightMm={shown.pageHeight}
                sheets={1.06}
                title="Letter preview"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
