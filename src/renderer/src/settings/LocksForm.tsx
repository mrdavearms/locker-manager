import { useState } from 'react'
import { LOCK_TYPE_INFO, LOCK_TYPES, type LockDefaults } from '@shared/locks'
import { Button } from '@renderer/components/Button'
import { Field, SectionCard, Select, TextInput } from '@renderer/components/Field'
import { useAction, useCanEdit, useTerms } from '@renderer/lib/appContext'
import { call, useRpc } from '@renderer/lib/rpc'

function LockFields({
  value,
  onChange,
  idPrefix,
  disabled
}: {
  value: LockDefaults
  onChange: (v: LockDefaults) => void
  idPrefix: string
  disabled: boolean
}): React.JSX.Element {
  const info = LOCK_TYPE_INFO[value.type]
  return (
    <div className="grid gap-4 md:grid-cols-4">
      <div className="md:col-span-2">
        <Field label="Kind of lock" hint={info.description} htmlFor={`${idPrefix}-type`}>
          <Select
            id={`${idPrefix}-type`}
            disabled={disabled}
            value={value.type}
            onChange={(e) => onChange({ ...value, type: e.target.value as LockDefaults['type'] })}
          >
            {LOCK_TYPES.map((t) => (
              <option key={t} value={t}>
                {LOCK_TYPE_INFO[t].name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {info.hasCode && (
        <>
          <Field
            label="Numbers in the code"
            hint="The number of dials or wheels"
            htmlFor={`${idPrefix}-dials`}
          >
            <Select
              id={`${idPrefix}-dials`}
              disabled={disabled}
              value={value.dials}
              onChange={(e) => onChange({ ...value, dials: Number(e.target.value) })}
            >
              {[3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Each dial goes" htmlFor={`${idPrefix}-pos`}>
            <Select
              id={`${idPrefix}-pos`}
              disabled={disabled}
              value={value.positionsPerDial}
              onChange={(e) => onChange({ ...value, positionsPerDial: Number(e.target.value) })}
            >
              <option value={10}>0 to 9</option>
              <option value={40}>0 to 39 (rotary padlock)</option>
              <option value={36}>0 to 35</option>
              <option value={60}>0 to 59</option>
            </Select>
          </Field>
        </>
      )}
      <Field label="Maker (optional)" htmlFor={`${idPrefix}-maker`}>
        <TextInput
          id={`${idPrefix}-maker`}
          disabled={disabled}
          maxLength={60}
          value={value.manufacturer ?? ''}
          onChange={(e) => onChange({ ...value, manufacturer: e.target.value })}
        />
      </Field>
      <Field label="Model (optional)" htmlFor={`${idPrefix}-model`}>
        <TextInput
          id={`${idPrefix}-model`}
          disabled={disabled}
          maxLength={60}
          value={value.model ?? ''}
          onChange={(e) => onChange({ ...value, model: e.target.value })}
        />
      </Field>
    </div>
  )
}

/** SPEC.md 4.1 step 5: the kind of lock for each bank. */
export function LocksForm(): React.JSX.Element {
  const terms = useTerms()
  const canEdit = useCanEdit()
  const act = useAction()
  const { data: defaults } = useRpc('locks.defaults.get', {})
  const { data: areas } = useRpc('locations.list', {})
  const { data: lockers } = useRpc('lockers.list', {})
  const [draftDefault, setDraftDefault] = useState<LockDefaults | null>(null)
  const [bankDrafts, setBankDrafts] = useState<Record<string, LockDefaults>>({})

  if (!defaults || !areas) return <SectionCard title="Locks">Loading…</SectionCard>
  const d = draftDefault ?? defaults

  const bankType = (bankId: string): string => {
    const types = new Set(
      (lockers ?? []).filter((l) => l.bankId === bankId).map((l) => l.lockType ?? 'none')
    )
    if (types.size === 0) return `No ${terms.locker.many.toLowerCase()} yet`
    if (types.size > 1) return 'Mixed'
    const only = [...types][0] as keyof typeof LOCK_TYPE_INFO
    return LOCK_TYPE_INFO[only]?.name ?? 'No lock'
  }

  return (
    <div className="space-y-6">
      <SectionCard
        title="Usual lock"
        description={`Used for new ${terms.locker.many.toLowerCase()}. You can set a different kind for any ${terms.bank.one.toLowerCase()} below.`}
      >
        <LockFields
          idPrefix="lock-default"
          disabled={!canEdit}
          value={d}
          onChange={setDraftDefault}
        />
        {draftDefault && (
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDraftDefault(null)}>
              Undo
            </Button>
            <Button
              onClick={() =>
                void act(
                  async () => (await call('locks.defaults.set', { lock: d }), setDraftDefault(null))
                )
              }
            >
              Save usual lock
            </Button>
          </div>
        )}
      </SectionCard>
      <SectionCard
        title={`Lock for each ${terms.bank.one.toLowerCase()}`}
        description={`Changing the kind of lock for a ${terms.bank.one.toLowerCase()} clears any codes its locks had, because they no longer apply.`}
      >
        <ul className="space-y-5">
          {areas.flatMap((a) =>
            a.banks.map((b) => {
              const draft = bankDrafts[b.id]
              return (
                <li key={b.id} className="rounded-2xl border border-line p-5">
                  <p className="font-semibold">
                    {a.name} · {b.name}{' '}
                    <span className="font-normal text-ink-muted">· now: {bankType(b.id)}</span>
                  </p>
                  {draft ? (
                    <div className="mt-4">
                      <LockFields
                        idPrefix={`lock-${b.id}`}
                        disabled={!canEdit}
                        value={draft}
                        onChange={(v) => setBankDrafts({ ...bankDrafts, [b.id]: v })}
                      />
                      <div className="mt-4 flex justify-end gap-2">
                        <Button
                          variant="secondary"
                          onClick={() =>
                            setBankDrafts(
                              Object.fromEntries(
                                Object.entries(bankDrafts).filter(([k]) => k !== b.id)
                              )
                            )
                          }
                        >
                          Cancel
                        </Button>
                        <Button
                          onClick={() =>
                            void act(async () => {
                              await call('locks.setForBank', { bankId: b.id, lock: draft })
                              setBankDrafts(
                                Object.fromEntries(
                                  Object.entries(bankDrafts).filter(([k]) => k !== b.id)
                                )
                              )
                            })
                          }
                        >
                          Apply to {b.lockerCount} {terms.locker.many.toLowerCase()}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      className="mt-3"
                      size="sm"
                      variant="secondary"
                      disabled={!canEdit || b.lockerCount === 0}
                      onClick={() => setBankDrafts({ ...bankDrafts, [b.id]: defaults })}
                    >
                      Change the lock for this {terms.bank.one.toLowerCase()}
                    </Button>
                  )}
                </li>
              )
            })
          )}
        </ul>
      </SectionCard>
    </div>
  )
}
