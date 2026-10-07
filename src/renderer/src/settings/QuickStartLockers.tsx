import { useState } from 'react'
import { LOCK_TYPE_INFO, LOCK_TYPES, type LockType } from '@shared/locks'
import { Button } from '@renderer/components/Button'
import { Field, SectionCard, Select, TextInput } from '@renderer/components/Field'
import { useAction, useCanEdit, useTerms } from '@renderer/lib/appContext'
import { call, useRpc } from '@renderer/lib/rpc'

/**
 * Set-up's quick start: a school with one run of lockers adds them all in one step,
 * without learning about areas and banks. Shown only while the file has no areas.
 */
export function QuickStartLockers(): React.JSX.Element | null {
  const terms = useTerms()
  const canEdit = useCanEdit()
  const act = useAction()
  const { data: areas } = useRpc('locations.list', {})
  const { data: defaults } = useRpc('locks.defaults.get', {})
  const [count, setCount] = useState('')
  const [first, setFirst] = useState('1')
  const [lockType, setLockType] = useState<LockType | null>(null)
  const [busy, setBusy] = useState(false)

  if (!areas || areas.length > 0 || !defaults) return null
  const type = lockType ?? defaults.type
  const lockers = terms.locker.many.toLowerCase()
  const bank = terms.bank.one.toLowerCase()
  const n = /^\d+$/.test(count.trim()) ? Number(count) : NaN
  const from = /^\d+$/.test(first.trim()) ? Number(first) : NaN
  const valid = n >= 1 && n <= 2000 && from >= 0 && from <= 999_999

  return (
    <SectionCard
      title={`Add all your ${lockers} at once`}
      description={`For ${lockers} in one place, numbered 1, 2, 3 and so on.`}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (!valid || busy) return
          setBusy(true)
          void act(() =>
            call('lockers.quickStart', { count: n, firstNumber: from, lockType: type })
          ).finally(() => setBusy(false))
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label={`How many ${lockers}?`} htmlFor="qs-count">
            <TextInput
              id="qs-count"
              inputMode="numeric"
              disabled={!canEdit}
              value={count}
              onChange={(e) => setCount(e.target.value)}
            />
          </Field>
          <Field label="First number" htmlFor="qs-first">
            <TextInput
              id="qs-first"
              inputMode="numeric"
              disabled={!canEdit}
              value={first}
              onChange={(e) => setFirst(e.target.value)}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Kind of lock" hint={LOCK_TYPE_INFO[type].description} htmlFor="qs-lock">
              <Select
                id="qs-lock"
                disabled={!canEdit}
                value={type}
                onChange={(e) => setLockType(e.target.value as LockType)}
              >
                {LOCK_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {LOCK_TYPE_INFO[t].name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-ink-muted" data-testid="quick-start-preview">
            {valid
              ? `${terms.locker.many} ${from} to ${from + n - 1}, in one ${bank}`
              : `Type how many ${lockers} you have, from 1 to 2000.`}
          </p>
          <Button type="submit" disabled={!canEdit || !valid || busy} data-testid="quick-start-add">
            Add {lockers}
          </Button>
        </div>
      </form>
      <p className="mt-4 text-sm text-ink-muted">
        New {lockers} you add later start with this kind of lock too. {terms.locker.many} in more
        than one place, or numbered with letters? Use the full editor below.
      </p>
    </SectionCard>
  )
}
