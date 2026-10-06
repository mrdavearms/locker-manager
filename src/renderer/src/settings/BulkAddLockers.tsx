import { useEffect, useState } from 'react'
import { LOCK_TYPE_INFO, LOCK_TYPES, type LockDefaults } from '@shared/locks'
import type { BulkPlanInputView, PlannedLockerView } from '@shared/rpc'
import { Button } from '@renderer/components/Button'
import { Field, Select, TextInput } from '@renderer/components/Field'
import { useAction, useTerms } from '@renderer/lib/appContext'
import { call, useRpc } from '@renderer/lib/rpc'
import { cn } from '@renderer/lib/cn'

/** "Bank A: lockers 1 to 114, 3 tiers" (SPEC.md 4.1 step 4), with a live preview. */
/** The first whole number after the highest plain-number locker, so a second bank carries on. */
function nextFreeNumber(numbers: readonly string[]): number {
  const plain = numbers.filter((n) => /^\d+$/.test(n)).map(Number)
  return plain.length === 0 ? 1 : Math.max(...plain) + 1
}

export function BulkAddLockers({
  bankId,
  existing,
  onDone
}: {
  bankId: string
  existing: readonly string[]
  onDone: () => void
}): React.JSX.Element {
  const terms = useTerms()
  const act = useAction()
  const { data: defaults } = useRpc('locks.defaults.get', {})
  const [input, setInput] = useState<BulkPlanInputView>(() => {
    const from = nextFreeNumber(existing)
    return { prefix: '', from, to: from + 113, padTo: 0, tiers: 3, order: 'down_then_across' }
  })
  const [capacity, setCapacity] = useState(1)
  const [lock, setLock] = useState<LockDefaults | null | undefined>(undefined)
  const [preview, setPreview] = useState<{
    planned: PlannedLockerView[]
    duplicates: string[]
  } | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const effectiveLock = lock === undefined ? defaults : lock

  useEffect(() => {
    let cancelled = false
    void window.api.rpc('lockers.planBulk', { input }).then((r) => {
      if (cancelled) return
      if (r.ok) {
        setPreview(r.value)
        setProblem(null)
      } else {
        setPreview(null)
        setProblem(r.message)
      }
    })
    return () => {
      cancelled = true
    }
  }, [input])

  const num = (v: string): number => (v.trim() === '' ? NaN : Number(v))
  const set = (patch: Partial<BulkPlanInputView>): void => setInput({ ...input, ...patch })
  const columns = preview ? Math.max(...preview.planned.map((p) => p.column)) : 0
  const rows = preview ? Math.max(...preview.planned.map((p) => p.row)) : 0

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="First number" htmlFor="ba-from">
          <TextInput
            id="ba-from"
            inputMode="numeric"
            value={Number.isNaN(input.from) ? '' : input.from}
            onChange={(e) => set({ from: num(e.target.value) })}
          />
        </Field>
        <Field label="Last number" htmlFor="ba-to">
          <TextInput
            id="ba-to"
            inputMode="numeric"
            value={Number.isNaN(input.to) ? '' : input.to}
            onChange={(e) => set({ to: num(e.target.value) })}
          />
        </Field>
        <Field label={`${terms.locker.many} stacked in each column`} htmlFor="ba-tiers">
          <Select
            id="ba-tiers"
            value={input.tiers}
            onChange={(e) => set({ tiers: Number(e.target.value) })}
          >
            {[1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>
                {n === 1
                  ? '1 (full height)'
                  : `${n} (${n === 2 ? 'top and bottom' : n === 3 ? 'top, middle, bottom' : 'four high'})`}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Numbers run" htmlFor="ba-order">
          <Select
            id="ba-order"
            value={input.order}
            onChange={(e) => set({ order: e.target.value as BulkPlanInputView['order'] })}
          >
            <option value="down_then_across">Down, then across</option>
            <option value="across_then_down">Across, then down</option>
          </Select>
        </Field>
        <Field
          label="Letters before the number (optional)"
          hint='For example "B" gives B1, B2…'
          htmlFor="ba-prefix"
        >
          <TextInput
            id="ba-prefix"
            maxLength={8}
            value={input.prefix}
            onChange={(e) => set({ prefix: e.target.value })}
          />
        </Field>
        <Field label="Leading zeros" hint="3 gives 001, 002…" htmlFor="ba-pad">
          <Select
            id="ba-pad"
            value={input.padTo}
            onChange={(e) => set({ padTo: Number(e.target.value) })}
          >
            <option value={0}>None</option>
            {[2, 3, 4].map((n) => (
              <option key={n} value={n}>
                {n} digits
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Students per locker" htmlFor="ba-cap">
          <Select
            id="ba-cap"
            value={capacity}
            onChange={(e) => setCapacity(Number(e.target.value))}
          >
            <option value={1}>1</option>
            <option value={2}>2 (shared)</option>
          </Select>
        </Field>
        <Field label="Lock" htmlFor="ba-lock">
          <Select
            id="ba-lock"
            value={effectiveLock?.type ?? 'none'}
            onChange={(e) => {
              const type = e.target.value as LockDefaults['type']
              setLock({ ...(defaults ?? { dials: 4, positionsPerDial: 10 }), type })
            }}
          >
            {LOCK_TYPES.map((t) => (
              <option key={t} value={t}>
                {LOCK_TYPE_INFO[t].name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {problem && <p className="text-sm font-semibold text-bad">{problem}</p>}
      {preview && (
        <div>
          <p className="text-sm">
            <strong>{preview.planned.length}</strong>{' '}
            {preview.planned.length === 1
              ? terms.locker.one.toLowerCase()
              : terms.locker.many.toLowerCase()}{' '}
            in {columns} {columns === 1 ? 'column' : 'columns'} and {rows}{' '}
            {rows === 1 ? 'row' : 'rows'}.
            {preview.duplicates.length > 0 && (
              <span className="font-semibold text-bad">
                {' '}
                Already used: {preview.duplicates.slice(0, 8).join(', ')}
                {preview.duplicates.length > 8 ? '…' : ''}
              </span>
            )}
          </p>
          <div
            className="mt-3 max-h-56 overflow-auto rounded-xl border border-line bg-surface-muted p-3"
            aria-label="Preview of the bank"
          >
            <div
              className="grid w-max gap-1"
              style={{ gridTemplateColumns: `repeat(${Math.min(columns, 60)}, 2.6rem)` }}
            >
              {preview.planned
                .filter((p) => p.column <= 60)
                .sort((a, b) => a.row - b.row || a.column - b.column)
                .map((p) => (
                  <div
                    key={p.number}
                    style={{ gridRow: p.row, gridColumn: p.column }}
                    className={cn(
                      'flex h-10 items-center justify-center rounded-md border text-xs font-semibold tabular-nums',
                      preview.duplicates.includes(p.number)
                        ? 'border-bad bg-bad-soft text-bad'
                        : 'border-line-strong bg-surface'
                    )}
                  >
                    {p.number}
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button
          data-testid="bulk-add-confirm"
          disabled={!preview || preview.duplicates.length > 0 || preview.planned.length === 0}
          onClick={() =>
            void act(async () => {
              await call('lockers.addBulk', {
                bankId,
                input,
                capacity,
                lock: effectiveLock?.type === 'none' ? null : (effectiveLock ?? null)
              })
              onDone()
            })
          }
        >
          Add {preview?.planned.length ?? ''} {terms.locker.many.toLowerCase()}
        </Button>
      </div>
    </div>
  )
}
