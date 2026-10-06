import { useMemo, useState } from 'react'
import { Accessibility, Ban, Hash, KeyRound, Lock, Users, X } from 'lucide-react'
import type { LockerView } from '@shared/locations'
import { KeyPanel } from '@renderer/lockers/KeyPanel'
import { LOCK_TYPE_INFO } from '@shared/locks'
import { Button } from '@renderer/components/Button'
import { Field, TextInput } from '@renderer/components/Field'
import { Modal } from '@renderer/components/Modal'
import { useAction, useCanEdit, useTerms } from '@renderer/lib/appContext'
import { call, useRpc } from '@renderer/lib/rpc'
import { CodeReveal } from '@renderer/components/CodeReveal'
import { ResetList } from '@renderer/lockers/LockerActions'
import { cn } from '@renderer/lib/cn'

const CODE_STATUS_TEXT: Record<string, string> = {
  not_applicable: 'No code (keyed or no lock)',
  set: 'Code set',
  reset_no_code: 'Lock on 0 0 0 0, no code issued yet',
  needs_new_code: 'Needs a new code',
  awaiting_physical_reset: 'New code issued; lock still to be reset'
}

function tone(l: LockerView): string {
  if (l.status === 'out_of_service') return 'bg-bad-soft border-bad/40 text-bad'
  if (l.status === 'reserved') return 'bg-warn-soft border-warn/40 text-warn'
  if (l.holders.length > 0) return 'bg-brand-soft border-brand/40 text-ink'
  return 'bg-surface border-line-strong text-ink-muted'
}

function LockerTile({
  l,
  selected,
  onSelect
}: {
  l: LockerView
  selected: boolean
  onSelect: () => void
}): React.JSX.Element {
  const holder = l.holders[0]
  return (
    <button
      onClick={onSelect}
      style={{ gridRow: l.row ?? undefined, gridColumn: l.column ?? undefined }}
      aria-label={`Locker ${l.number}${holder ? `, ${holder.name}` : ', spare'}${l.status !== 'in_service' ? `, ${l.status.replace(/_/g, ' ')}` : ''}`}
      className={cn(
        'relative flex h-[4.2rem] w-[4.6rem] flex-col items-center justify-center rounded-lg border text-center transition-transform hover:-translate-y-0.5 hover:shadow-[var(--shadow-card)]',
        tone(l),
        selected && 'ring-3 ring-accent'
      )}
    >
      <span className="stencil text-xl leading-none">{l.number}</span>
      <span className="mt-0.5 max-w-full truncate px-1 text-[0.68rem] leading-tight">
        {holder
          ? holder.name.split(' ')[0]
          : l.status === 'in_service'
            ? 'spare'
            : l.status === 'reserved'
              ? 'reserved'
              : 'out'}
      </span>
      {l.accessible && (
        <Accessibility size={11} className="absolute right-1 top-1 opacity-70" aria-hidden />
      )}
    </button>
  )
}

function LockerPanel({ l, onClose }: { l: LockerView; onClose: () => void }): React.JSX.Element {
  const terms = useTerms()
  const canEdit = useCanEdit()
  const act = useAction()
  const [dialog, setDialog] = useState<'renumber' | 'out' | 'remove' | null>(null)
  const [text, setText] = useState('')
  const [reason, setReason] = useState('')

  return (
    <aside
      className="card sticky top-4 w-full p-6 lg:w-[22rem]"
      aria-label={`${terms.locker.one} ${l.number}`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-ink-muted">
            {terms.locker.one}
          </p>
          <h2 className="stencil text-5xl leading-none">{l.number}</h2>
        </div>
        <button
          className="rounded-lg p-1.5 text-ink-muted hover:bg-surface-muted"
          aria-label="Close"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </div>
      <dl className="mt-5 space-y-3 text-sm">
        <div className="flex gap-3">
          <Users size={18} className="text-ink-muted" aria-hidden />
          <div>
            <dt className="sr-only">Holders</dt>
            <dd>
              {l.holders.length === 0
                ? 'Spare'
                : l.holders.map((h) => `${h.name}${h.group ? ` (${h.group})` : ''}`).join(', ')}
            </dd>
          </div>
        </div>
        <div className="flex gap-3">
          <Lock size={18} className="text-ink-muted" aria-hidden />
          <dd>{l.lockType ? LOCK_TYPE_INFO[l.lockType].name : 'No lock recorded'}</dd>
        </div>
        {l.codeStatus && (
          <div className="flex gap-3">
            <KeyRound size={18} className="text-ink-muted" aria-hidden />
            <dd>{CODE_STATUS_TEXT[l.codeStatus] ?? l.codeStatus}</dd>
          </div>
        )}
        {l.status !== 'in_service' && (
          <div className="flex gap-3 text-bad">
            <Ban size={18} aria-hidden />
            <dd>
              {l.status === 'reserved'
                ? 'Reserved: kept out of allocation'
                : `Out of service: ${l.outOfServiceReason ?? ''}`}
            </dd>
          </div>
        )}
      </dl>

      {(l.codeStatus === 'set' ||
        l.codeStatus === 'awaiting_physical_reset' ||
        l.codeStatus === 'needs_new_code') && (
        <div className="mt-4">
          <CodeReveal lockerId={l.id} />
        </div>
      )}
      {l.lockType && LOCK_TYPE_INFO[l.lockType].keyed && <KeyPanel l={l} />}
      <div className="mt-6 space-y-3">
        <label className="flex items-center justify-between gap-3 text-sm">
          <span className="flex items-center gap-2">
            <Accessibility size={18} className="text-ink-muted" aria-hidden /> Accessible (low, wide
            or near a ramp)
          </span>
          <input
            type="checkbox"
            className="size-5 accent-[var(--color-brand)]"
            disabled={!canEdit}
            checked={l.accessible}
            onChange={(e) =>
              void act(() => call('locker.update', { id: l.id, accessible: e.target.checked }))
            }
          />
        </label>
        <label className="flex items-center justify-between gap-3 text-sm">
          <span>Students who share it</span>
          <select
            className="h-9 rounded-lg border border-line-strong bg-surface px-2"
            disabled={!canEdit}
            value={l.capacity}
            onChange={(e) =>
              void act(() => call('locker.update', { id: l.id, capacity: Number(e.target.value) }))
            }
          >
            {[1, 2, 3].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {l.status === 'in_service' ? (
          <>
            <Button
              size="sm"
              variant="secondary"
              disabled={!canEdit}
              onClick={() => (setReason(''), setDialog('out'))}
            >
              Out of service…
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={!canEdit}
              onClick={() =>
                void act(() => call('locker.update', { id: l.id, status: 'reserved' }))
              }
            >
              Reserve
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            disabled={!canEdit}
            onClick={() =>
              void act(() => call('locker.update', { id: l.id, status: 'in_service' }))
            }
          >
            Back in service
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          disabled={!canEdit}
          onClick={() => (setText(l.number), setReason(''), setDialog('renumber'))}
        >
          <Hash size={15} aria-hidden /> Renumber…
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={!canEdit || l.holders.length > 0}
          onClick={() => (setReason(''), setDialog('remove'))}
        >
          Remove…
        </Button>
      </div>

      {dialog === 'out' && (
        <Modal
          open
          onOpenChange={(o) => !o && setDialog(null)}
          title={`${terms.locker.one} ${l.number} out of service`}
          description="It will be kept out of allocation until it is back in service."
        >
          <Field label="Why?" htmlFor="oos-reason">
            <TextInput
              id="oos-reason"
              autoFocus
              value={reason}
              maxLength={200}
              onChange={(e) => setReason(e.target.value)}
              placeholder="For example, door hinge broken"
            />
          </Field>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button
              disabled={reason.trim().length === 0}
              onClick={() =>
                void act(
                  async () => (
                    await call('locker.update', {
                      id: l.id,
                      status: 'out_of_service',
                      outOfServiceReason: reason
                    }),
                    setDialog(null)
                  )
                )
              }
            >
              Mark out of service
            </Button>
          </div>
        </Modal>
      )}
      {dialog === 'renumber' && (
        <Modal
          open
          onOpenChange={(o) => !o && setDialog(null)}
          title={`Renumber ${terms.locker.one.toLowerCase()} ${l.number}`}
          description={`Only for a ${terms.locker.one.toLowerCase()} whose number plate really changed. To move a student, use Move instead: renumbering keeps the student in this ${terms.locker.one.toLowerCase()}.`}
        >
          <div className="space-y-4">
            <Field label="New number" htmlFor="renum-number">
              <TextInput
                id="renum-number"
                autoFocus
                value={text}
                maxLength={20}
                onChange={(e) => setText(e.target.value)}
              />
            </Field>
            <Field label="Why?" htmlFor="renum-reason">
              <TextInput
                id="renum-reason"
                value={reason}
                maxLength={200}
                onChange={(e) => setReason(e.target.value)}
                placeholder="For example, new number plates fitted"
              />
            </Field>
          </div>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button
              variant="accent"
              disabled={text.trim() === '' || reason.trim().length < 3}
              onClick={() =>
                void act(
                  async () => (
                    await call('locker.renumber', { id: l.id, number: text, reason }),
                    setDialog(null)
                  )
                )
              }
            >
              Renumber
            </Button>
          </div>
        </Modal>
      )}
      {dialog === 'remove' && (
        <Modal
          open
          onOpenChange={(o) => !o && setDialog(null)}
          title={`Remove ${terms.locker.one.toLowerCase()} ${l.number}?`}
          description="For a locker that no longer exists. It stays in the history; its lock becomes a spare."
        >
          <Field label="Why?" htmlFor="rm-reason">
            <TextInput
              id="rm-reason"
              autoFocus
              value={reason}
              maxLength={200}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={reason.trim().length < 3}
              onClick={() =>
                void act(
                  async () => (
                    await call('locker.archive', { id: l.id, reason }),
                    setDialog(null),
                    onClose()
                  )
                )
              }
            >
              Remove
            </Button>
          </div>
        </Modal>
      )}
    </aside>
  )
}

export function LockersScreen({
  onSetUp,
  onAllocate,
  focusLockerId
}: {
  onSetUp: () => void
  onAllocate: () => void
  focusLockerId: string | null
}): React.JSX.Element {
  const terms = useTerms()
  const { data: areas } = useRpc('locations.list', {})
  const { data: lockers } = useRpc('lockers.list', {})
  const [selectedId, setSelectedId] = useState<string | null>(focusLockerId)
  const canEdit = useCanEdit()
  const byBank = useMemo(() => {
    const m = new Map<string, LockerView[]>()
    for (const l of lockers ?? []) m.set(l.bankId, [...(m.get(l.bankId) ?? []), l])
    return m
  }, [lockers])
  const selected = lockers?.find((l) => l.id === selectedId) ?? null
  const total = lockers?.length ?? 0
  const used = lockers?.filter((l) => l.holders.length > 0).length ?? 0
  const out = lockers?.filter((l) => l.status !== 'in_service').length ?? 0

  return (
    <div className="w-full space-y-6 px-6 py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">{terms.locker.many}</h1>
          <p className="mt-1 text-ink-muted">
            {total} {terms.locker.many.toLowerCase()} · {used} in use · {total - used - out} spare ·{' '}
            {out} out of service or reserved
          </p>
          <Button
            className="mt-3"
            disabled={!canEdit || total === 0}
            onClick={onAllocate}
            data-testid="open-allocate"
          >
            Allocate {terms.locker.many.toLowerCase()}…
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-xs text-ink-muted" aria-label="Key">
          <span className="flex items-center gap-1.5">
            <span className="size-3 rounded border border-brand/40 bg-brand-soft" /> In use
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-3 rounded border border-line-strong bg-surface" /> Spare
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-3 rounded border border-warn/40 bg-warn-soft" /> Reserved
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-3 rounded border border-bad/40 bg-bad-soft" /> Out of service
          </span>
        </div>
      </header>

      <ResetList />

      {areas?.length === 0 && (
        <div className="card p-8 text-center">
          <p className="text-lg font-semibold">No {terms.locker.many.toLowerCase()} yet</p>
          <p className="mt-1 text-ink-muted">
            Add your {terms.area.many.toLowerCase()}, {terms.bank.many.toLowerCase()} and{' '}
            {terms.locker.many.toLowerCase()} in the set-up.
          </p>
          <Button className="mt-4" onClick={onSetUp}>
            Set up {terms.locker.many.toLowerCase()}
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1 space-y-6">
          {areas?.map((a) => (
            <section key={a.id} aria-labelledby={`area-${a.id}`} className="space-y-4">
              <h2 id={`area-${a.id}`} className="text-xl font-semibold">
                {a.name}
              </h2>
              {a.banks.map((b) => {
                const list = byBank.get(b.id) ?? []
                return (
                  <div key={b.id} className="card overflow-hidden">
                    <p className="border-b border-line px-5 py-3 font-semibold">
                      {b.name} <span className="font-normal text-ink-muted">· {list.length}</span>
                    </p>
                    <div className="overflow-x-auto p-4">
                      <div
                        className="grid w-max gap-1.5"
                        style={{ gridTemplateColumns: `repeat(${b.columns ?? 1}, 4.6rem)` }}
                      >
                        {list.map((l) => (
                          <LockerTile
                            key={l.id}
                            l={l}
                            selected={l.id === selectedId}
                            onSelect={() => setSelectedId(l.id)}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                )
              })}
            </section>
          ))}
        </div>
        {selected && (
          <LockerPanel key={selected.id} l={selected} onClose={() => setSelectedId(null)} />
        )}
      </div>
    </div>
  )
}
