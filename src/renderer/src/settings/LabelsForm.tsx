import { useEffect, useRef, useState } from 'react'
import { FileDown, Plus, RotateCcw, Trash2 } from 'lucide-react'
import {
  ELEMENT_LABELS,
  ELEMENT_TYPES,
  type ElementType,
  type LabelElement,
  type LabelTemplate,
  type Stock
} from '@shared/labels'
import { labelPosition, stockProblems } from '@shared/labelGeometry'
import { Banner } from '@renderer/components/Banner'
import { Button } from '@renderer/components/Button'
import { Field, SectionCard, Select, TextInput } from '@renderer/components/Field'
import { useAction, useCanEdit, useTerms } from '@renderer/lib/appContext'
import { cn } from '@renderer/lib/cn'
import { call, useRpc } from '@renderer/lib/rpc'
import { LabelZoom } from '@renderer/print/SheetPreview'

const num = (v: string, fallback: number): number => {
  const n = Number(v.replace(',', '.'))
  return Number.isFinite(n) ? n : fallback
}

/** SPEC.md 5.1: "Measured geometry overrides published geometry", with a helper. */
function StockCard({ template }: { template: LabelTemplate }): React.JSX.Element {
  const canEdit = useCanEdit()
  const act = useAction()
  const { data: stocks } = useRpc('labels.stocks', {})
  const current = stocks?.find((s) => s.id === template.stockId)
  const [draft, setDraft] = useState<Stock | null>(null)
  const [helper, setHelper] = useState({ firstTop: '', lastTop: '', firstLeft: '', lastLeft: '' })
  if (!stocks || !current) return <SectionCard title="Label sheets">Loading…</SectionCard>
  const s = draft ?? current
  const problems = stockProblems(s)
  const fields: [keyof Stock, string][] = [
    ['labelWidth', 'Label width'],
    ['labelHeight', 'Label height'],
    ['top', 'Top of the page to the top of the first row'],
    ['left', 'Left of the page to the left of the first column'],
    ['pitchY', 'Top of one row to the top of the next'],
    ['pitchX', 'Left of one column to the left of the next']
  ]
  const applyHelper = (): void => {
    const ft = num(helper.firstTop, NaN)
    const lt = num(helper.lastTop, NaN)
    const fl = num(helper.firstLeft, NaN)
    const ll = num(helper.lastLeft, NaN)
    setDraft({
      ...s,
      ...(Number.isFinite(ft) ? { top: ft } : {}),
      ...(Number.isFinite(ft) && Number.isFinite(lt) && s.rows > 1
        ? { pitchY: Math.round(((lt - ft) / (s.rows - 1)) * 100) / 100 }
        : {}),
      ...(Number.isFinite(fl) ? { left: fl } : {}),
      ...(Number.isFinite(fl) && Number.isFinite(ll) && s.columns > 1
        ? { pitchX: Math.round(((ll - fl) / (s.columns - 1)) * 100) / 100 }
        : {})
    })
  }
  return (
    <SectionCard
      title="Label sheets"
      description="Choose your label sheets. Boxes of labels vary: measure a sheet from your own box with a ruler, because labels printed to the published figures can come out low."
    >
      <div className="max-w-xl">
        <Field label="Label sheets" htmlFor="stock-pick">
          <Select
            id="stock-pick"
            disabled={!canEdit}
            value={template.stockId}
            onChange={(e) =>
              void act(
                async () => (
                  await call('labels.template.set', {
                    template: { ...template, stockId: e.target.value }
                  }),
                  setDraft(null)
                )
              )
            }
          >
            {stocks.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
                {x.measured && x.builtIn ? ' (your measurements)' : ''}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-3">
        {fields.map(([k, label]) => (
          <Field
            key={k}
            label={`${label} (mm)`}
            hint={
              current.published && current.published[k] !== s[k]
                ? `Published: ${current.published[k]}`
                : undefined
            }
            htmlFor={`stock-${k}`}
          >
            <TextInput
              id={`stock-${k}`}
              disabled={!canEdit}
              inputMode="decimal"
              value={String(s[k])}
              onChange={(e) => setDraft({ ...s, [k]: num(e.target.value, s[k] as number) })}
            />
          </Field>
        ))}
      </div>
      <details className="mt-5 rounded-2xl bg-surface-muted p-4">
        <summary className="cursor-pointer font-semibold">Measure your sheet</summary>
        <p className="mt-2 text-sm text-ink-muted">
          Lay a sheet of labels flat. With a steel ruler, measure from the top edge of the paper to
          the top edge of the first row, then to the top edge of the last row. Measuring across all
          the rows and dividing is more accurate than measuring one label.
        </p>
        <div className="mt-3 grid gap-3 md:grid-cols-4">
          <Field label="To the top of the first row" htmlFor="m-ft">
            <TextInput
              id="m-ft"
              inputMode="decimal"
              value={helper.firstTop}
              onChange={(e) => setHelper({ ...helper, firstTop: e.target.value })}
            />
          </Field>
          <Field label={`To the top of the last row (row ${s.rows})`} htmlFor="m-lt">
            <TextInput
              id="m-lt"
              inputMode="decimal"
              value={helper.lastTop}
              onChange={(e) => setHelper({ ...helper, lastTop: e.target.value })}
            />
          </Field>
          <Field label="To the left of the first column" htmlFor="m-fl">
            <TextInput
              id="m-fl"
              inputMode="decimal"
              value={helper.firstLeft}
              onChange={(e) => setHelper({ ...helper, firstLeft: e.target.value })}
            />
          </Field>
          <Field label={`To the left of the last column (column ${s.columns})`} htmlFor="m-ll">
            <TextInput
              id="m-ll"
              inputMode="decimal"
              value={helper.lastLeft}
              onChange={(e) => setHelper({ ...helper, lastLeft: e.target.value })}
            />
          </Field>
        </div>
        <Button className="mt-3" size="sm" disabled={!canEdit} onClick={applyHelper}>
          Work out the numbers
        </Button>
      </details>
      {problems.length > 0 && (
        <div className="mt-4">
          <Banner tone="bad" title="These measurements do not fit the page">
            {problems.join(' ')}
          </Banner>
        </div>
      )}
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        {current.builtIn && current.measured && (
          <Button
            variant="ghost"
            disabled={!canEdit}
            onClick={() =>
              void act(
                async () => (await call('labels.stock.reset', { id: current.id }), setDraft(null))
              )
            }
          >
            <RotateCcw size={16} aria-hidden /> Back to the published figures
          </Button>
        )}
        {draft && (
          <>
            <Button variant="secondary" onClick={() => setDraft(null)}>
              Undo
            </Button>
            <Button
              disabled={problems.length > 0}
              onClick={() =>
                void act(
                  async () => (await call('labels.stock.save', { stock: s }), setDraft(null))
                )
              }
            >
              Save measurements
            </Button>
          </>
        )}
      </div>
    </SectionCard>
  )
}

function PrintersCard({ template }: { template: LabelTemplate }): React.JSX.Element {
  const canEdit = useCanEdit()
  const act = useAction()
  const { data: printers } = useRpc('labels.printers.list', {})
  const [draft, setDraft] = useState({ name: '', right: 0, down: 0 })
  const [saved, setSaved] = useState<string | null>(null)
  const step = (v: number, d: number): number => Math.round((v + d) * 10) / 10
  return (
    <SectionCard
      title="Printers and nudges"
      description="Most printers shift everything a little. Print the calibration page on plain paper, hold it over a sheet of labels against a window, read the rulers, and save a nudge for that printer."
    >
      <div className="flex flex-wrap items-end gap-3">
        <Button
          variant="secondary"
          onClick={() =>
            void act(async () => {
              const r = await window.api.calibrationPdf({
                stockId: template.stockId,
                printer: draft.name.trim() || null
              })
              if (r.ok) setSaved(r.path ?? null)
              else if (!r.cancelled) throw new Error(r.message)
            })
          }
          data-testid="calibration-pdf"
        >
          <FileDown size={17} aria-hidden /> Calibration page…
        </Button>
        {saved && (
          <Button size="sm" variant="ghost" onClick={() => void window.api.openPdf(saved)}>
            Open it
          </Button>
        )}
      </div>
      <div className="mt-5 grid items-end gap-3 md:grid-cols-[1.5fr_1fr_1fr_auto]">
        <Field label="Printer name" htmlFor="pr-name">
          <TextInput
            id="pr-name"
            disabled={!canEdit}
            value={draft.name}
            maxLength={80}
            placeholder="For example Office laser"
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </Field>
        {(['right', 'down'] as const).map((k) => (
          <Field
            key={k}
            label={k === 'right' ? 'Nudge right (mm)' : 'Nudge down (mm)'}
            hint="Minus moves left / up"
            htmlFor={`pr-${k}`}
          >
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="secondary"
                aria-label={`${k} minus 0.1`}
                onClick={() => setDraft({ ...draft, [k]: step(draft[k], -0.1) })}
              >
                −
              </Button>
              <TextInput
                id={`pr-${k}`}
                className="w-20 text-center"
                inputMode="decimal"
                value={draft[k]}
                onChange={(e) => setDraft({ ...draft, [k]: num(e.target.value, draft[k]) })}
              />
              <Button
                size="sm"
                variant="secondary"
                aria-label={`${k} plus 0.1`}
                onClick={() => setDraft({ ...draft, [k]: step(draft[k], 0.1) })}
              >
                +
              </Button>
            </div>
          </Field>
        ))}
        <Button
          disabled={!canEdit || draft.name.trim() === ''}
          onClick={() =>
            void act(
              async () => (
                await call('labels.printers.save', { printer: draft }),
                setDraft({ name: '', right: 0, down: 0 })
              )
            )
          }
        >
          Save
        </Button>
      </div>
      {printers && printers.length > 0 && (
        <ul className="mt-4 divide-y divide-line">
          {printers.map((p) => (
            <li key={p.name} className="flex items-center gap-3 py-2 text-sm">
              <span className="flex-1 font-semibold">{p.name}</span>
              <span className="tabular-nums text-ink-muted">
                {p.right} mm right, {p.down} mm down
              </span>
              <Button size="sm" variant="ghost" disabled={!canEdit} onClick={() => setDraft(p)}>
                Change
              </Button>
              <button
                className="rounded-lg p-1.5 text-ink-muted hover:bg-surface-muted"
                aria-label={`Remove ${p.name}`}
                disabled={!canEdit}
                onClick={() => void act(() => call('labels.printers.delete', { name: p.name }))}
              >
                <Trash2 size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  )
}

const PX_PER_MM = 7
const snap = (n: number): number => Math.round(n * 2) / 2

/** The layout designer (SPEC.md 5.1): drag elements, resize them, snap to 0.5 mm. */
function DesignerCard({
  template,
  stock
}: {
  template: LabelTemplate
  stock: Stock
}): React.JSX.Element {
  const terms = useTerms()
  const canEdit = useCanEdit()
  const act = useAction()
  const [draft, setDraft] = useState<LabelTemplate | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [html, setHtml] = useState<string | null>(null)
  const drag = useRef<{
    id: string
    kind: 'move' | 'resize'
    startX: number
    startY: number
    orig: LabelElement
  } | null>(null)
  const t = draft ?? template
  const key = JSON.stringify(t)

  useEffect(() => {
    let cancelled = false
    const tpl = JSON.parse(key) as LabelTemplate
    const timer = setTimeout(() => {
      void window.api
        .rpc('labels.preview', { selection: { mode: 'all' }, startAt: 1, template: tpl })
        .then((r) => {
          if (!cancelled && r.ok) setHtml(r.value.html)
        })
    }, 150)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [key])

  const setEl = (id: string, patch: Partial<LabelElement>): void =>
    setDraft({ ...t, elements: t.elements.map((e) => (e.id === id ? { ...e, ...patch } : e)) })
  const sel = t.elements.find((e) => e.id === selected) ?? null
  const first = labelPosition(stock, 0)

  const onPointerMove = (ev: React.PointerEvent): void => {
    const d = drag.current
    if (!d) return
    const dx = (ev.clientX - d.startX) / PX_PER_MM
    const dy = (ev.clientY - d.startY) / PX_PER_MM
    if (d.kind === 'move') setEl(d.id, { x: snap(d.orig.x + dx), y: snap(d.orig.y + dy) })
    else
      setEl(d.id, {
        w: Math.max(1, snap(d.orig.w + dx)),
        h: Math.max(d.orig.type === 'rule' ? 0.2 : 1, snap(d.orig.h + dy))
      })
  }

  return (
    <SectionCard
      title="Label layout"
      description={`The first ${terms.locker.one.toLowerCase()} in your file, enlarged. Drag a box to move it; drag its corner to resize. Everything snaps to half a millimetre. The dashed line is the ${t.safeMargin} mm clear edge.`}
      actions={
        <Button
          size="sm"
          variant="ghost"
          disabled={!canEdit}
          onClick={() =>
            void act(async () => (await call('labels.template.reset', {}), setDraft(null)))
          }
        >
          <RotateCcw size={16} aria-hidden /> Start again from the standard layout
        </Button>
      }
    >
      <div
        className="overflow-x-auto pb-2"
        onPointerMove={onPointerMove}
        onPointerUp={() => (drag.current = null)}
        onPointerLeave={() => (drag.current = null)}
      >
        {html ? (
          <LabelZoom
            html={html}
            left={first.x}
            top={first.y}
            labelW={stock.labelWidth}
            labelH={stock.labelHeight}
            pxPerMm={PX_PER_MM}
          >
            <div
              className="pointer-events-none absolute border border-dashed border-accent/60"
              style={{
                left: t.safeMargin * PX_PER_MM,
                top: t.safeMargin * PX_PER_MM,
                right: t.safeMargin * PX_PER_MM,
                bottom: t.safeMargin * PX_PER_MM
              }}
            />
            {t.elements.map((e) => (
              <div
                key={e.id}
                role="button"
                tabIndex={0}
                aria-label={`${ELEMENT_LABELS[e.type]}: drag to move`}
                onPointerDown={(ev) => {
                  if (!canEdit) return
                  setSelected(e.id)
                  drag.current = {
                    id: e.id,
                    kind: 'move',
                    startX: ev.clientX,
                    startY: ev.clientY,
                    orig: e
                  }
                }}
                onKeyDown={(ev) => {
                  const d = ev.shiftKey ? 1 : 0.5
                  const moves: Record<string, Partial<LabelElement>> = {
                    ArrowLeft: { x: e.x - d },
                    ArrowRight: { x: e.x + d },
                    ArrowUp: { y: e.y - d },
                    ArrowDown: { y: e.y + d }
                  }
                  const m = moves[ev.key]
                  if (m && canEdit) {
                    ev.preventDefault()
                    setEl(e.id, m)
                  }
                }}
                className={cn(
                  'absolute cursor-move rounded-sm border',
                  selected === e.id
                    ? 'border-accent bg-accent/10'
                    : 'border-brand/40 hover:bg-brand/5'
                )}
                style={{
                  left: e.x * PX_PER_MM,
                  top: e.y * PX_PER_MM,
                  width: e.w * PX_PER_MM,
                  height: Math.max(4, e.h * PX_PER_MM)
                }}
              >
                {selected === e.id && (
                  <span
                    aria-hidden
                    onPointerDown={(ev) => {
                      ev.stopPropagation()
                      drag.current = {
                        id: e.id,
                        kind: 'resize',
                        startX: ev.clientX,
                        startY: ev.clientY,
                        orig: e
                      }
                    }}
                    className="absolute -bottom-1.5 -right-1.5 size-3 cursor-nwse-resize rounded-sm bg-accent"
                  />
                )}
              </div>
            ))}
          </LabelZoom>
        ) : (
          <p className="text-sm text-ink-muted">Drawing the label…</p>
        )}
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[16rem_1fr]">
        <div>
          <ul className="space-y-1">
            {t.elements.map((e) => (
              <li key={e.id}>
                <button
                  onClick={() => setSelected(e.id)}
                  className={cn(
                    'w-full rounded-lg px-3 py-2 text-left text-sm',
                    selected === e.id ? 'bg-brand-soft font-semibold' : 'hover:bg-surface-muted'
                  )}
                >
                  {ELEMENT_LABELS[e.type]}
                  {e.type === 'text' && e.text ? `: ${e.text}` : ''}
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex gap-2">
            <Select
              aria-label="Add an element"
              disabled={!canEdit}
              value=""
              onChange={(ev) => {
                const type = ev.target.value as ElementType
                if (!type) return
                const id = `${type}-${Date.now()}`
                setDraft({
                  ...t,
                  elements: [
                    ...t.elements,
                    {
                      id,
                      type,
                      x: t.safeMargin,
                      y: t.safeMargin,
                      w: 20,
                      h: type === 'rule' ? 0.4 : 6,
                      fontMax: 12,
                      fontMin: 7,
                      bold: true,
                      align: 'left',
                      nameMode: 'stacked',
                      showWord: false,
                      text: type === 'text' ? 'Text' : ''
                    }
                  ]
                })
                setSelected(id)
              }}
            >
              <option value="">Add…</option>
              {ELEMENT_TYPES.map((x) => (
                <option key={x} value={x}>
                  {ELEMENT_LABELS[x]}
                </option>
              ))}
            </Select>
          </div>
        </div>
        {sel ? (
          <div className="grid gap-3 md:grid-cols-4">
            {(['x', 'y', 'w', 'h'] as const).map((k) => (
              <Field
                key={k}
                label={
                  {
                    x: 'From the left (mm)',
                    y: 'From the top (mm)',
                    w: 'Width (mm)',
                    h: 'Height (mm)'
                  }[k]
                }
                htmlFor={`el-${k}`}
              >
                <TextInput
                  id={`el-${k}`}
                  disabled={!canEdit}
                  inputMode="decimal"
                  value={sel[k]}
                  onChange={(e) => setEl(sel.id, { [k]: num(e.target.value, sel[k]) })}
                />
              </Field>
            ))}
            {sel.type !== 'rule' && sel.type !== 'logo' && sel.type !== 'qr' && (
              <>
                <Field label="Largest size (pt)" htmlFor="el-max">
                  <TextInput
                    id="el-max"
                    disabled={!canEdit}
                    inputMode="decimal"
                    value={sel.fontMax}
                    onChange={(e) => setEl(sel.id, { fontMax: num(e.target.value, sel.fontMax) })}
                  />
                </Field>
                <Field label="Smallest size (pt)" htmlFor="el-min">
                  <TextInput
                    id="el-min"
                    disabled={!canEdit}
                    inputMode="decimal"
                    value={sel.fontMin}
                    onChange={(e) => setEl(sel.id, { fontMin: num(e.target.value, sel.fontMin) })}
                  />
                </Field>
                <Field label="Line up" htmlFor="el-align">
                  <Select
                    id="el-align"
                    disabled={!canEdit}
                    value={sel.align}
                    onChange={(e) =>
                      setEl(sel.id, { align: e.target.value as LabelElement['align'] })
                    }
                  >
                    <option value="left">Left</option>
                    <option value="center">Centre</option>
                    <option value="right">Right</option>
                  </Select>
                </Field>
                <label className="flex items-center gap-2 self-end pb-3 text-sm">
                  <input
                    type="checkbox"
                    disabled={!canEdit}
                    checked={sel.bold}
                    onChange={(e) => setEl(sel.id, { bold: e.target.checked })}
                  />{' '}
                  Bold
                </label>
              </>
            )}
            {sel.type === 'name' && (
              <Field label="Names" htmlFor="el-names">
                <Select
                  id="el-names"
                  disabled={!canEdit}
                  value={sel.nameMode}
                  onChange={(e) =>
                    setEl(sel.id, { nameMode: e.target.value as LabelElement['nameMode'] })
                  }
                >
                  <option value="stacked">First name over last name</option>
                  <option value="one_line">On one line</option>
                </Select>
              </Field>
            )}
            {sel.type === 'lockerNumber' && (
              <label className="flex items-center gap-2 self-end pb-3 text-sm">
                <input
                  type="checkbox"
                  disabled={!canEdit}
                  checked={sel.showWord}
                  onChange={(e) => setEl(sel.id, { showWord: e.target.checked })}
                />{' '}
                Show the word “{terms.locker.one.toUpperCase()}”
              </label>
            )}
            {sel.type === 'text' && (
              <Field label="Text" htmlFor="el-text">
                <TextInput
                  id="el-text"
                  disabled={!canEdit}
                  value={sel.text}
                  maxLength={120}
                  onChange={(e) => setEl(sel.id, { text: e.target.value })}
                />
              </Field>
            )}
            <div className="flex items-end">
              <Button
                variant="ghost"
                disabled={!canEdit}
                onClick={() => (
                  setDraft({ ...t, elements: t.elements.filter((e) => e.id !== sel.id) }),
                  setSelected(null)
                )}
              >
                <Trash2 size={16} aria-hidden /> Remove
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-ink-muted">Choose an element to change it.</p>
        )}
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <Field
          label="Clear edge (mm)"
          hint="Nothing prints closer to the edge than this"
          htmlFor="tpl-margin"
        >
          <TextInput
            id="tpl-margin"
            disabled={!canEdit}
            inputMode="decimal"
            value={t.safeMargin}
            onChange={(e) =>
              setDraft({
                ...t,
                safeMargin: Math.max(0, Math.min(15, num(e.target.value, t.safeMargin)))
              })
            }
          />
        </Field>
        <Field label="Logo" htmlFor="tpl-colour">
          <Select
            id="tpl-colour"
            disabled={!canEdit}
            value={t.colour}
            onChange={(e) => setDraft({ ...t, colour: e.target.value as LabelTemplate['colour'] })}
          >
            <option value="mono">One colour (black-and-white printers)</option>
            <option value="colour">Colour</option>
          </Select>
        </Field>
        <label className="flex items-center gap-2 self-end pb-3 text-sm">
          <input
            type="checkbox"
            disabled={!canEdit}
            checked={t.usePreferredName}
            onChange={(e) => setDraft({ ...t, usePreferredName: e.target.checked })}
          />{' '}
          Use preferred names
        </label>
      </div>
      {draft && (
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDraft(null)}>
            Undo changes
          </Button>
          <Button
            onClick={() =>
              void act(
                async () => (await call('labels.template.set', { template: draft }), setDraft(null))
              )
            }
            data-testid="save-layout"
          >
            <Plus size={16} aria-hidden /> Save the layout
          </Button>
        </div>
      )}
    </SectionCard>
  )
}

export function LabelsForm(): React.JSX.Element {
  const { data: template } = useRpc('labels.template.get', {})
  const { data: stocks } = useRpc('labels.stocks', {})
  const stock = stocks?.find((s) => s.id === template?.stockId)
  if (!template || !stock) return <SectionCard title="Labels">Loading…</SectionCard>
  return (
    <div className="space-y-6">
      <StockCard template={template} />
      <PrintersCard template={template} />
      <DesignerCard key={template.stockId} template={template} stock={stock} />
    </div>
  )
}
