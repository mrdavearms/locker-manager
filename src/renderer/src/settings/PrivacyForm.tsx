import { useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { Banner } from '@renderer/components/Banner'
import { Button } from '@renderer/components/Button'
import { Field, SectionCard, Select, TextInput } from '@renderer/components/Field'
import { useAction, useCanEdit } from '@renderer/lib/appContext'
import { call, useRpc } from '@renderer/lib/rpc'

const digits = (v: string): string => v.replace(/\D/g, '').slice(0, 8)

/** SPEC.md 7 item 12 and 11: a PIN before codes are shown, and auto-hide. */
export function PrivacyForm(): React.JSX.Element {
  const act = useAction()
  const canEdit = useCanEdit()
  const { data: v } = useRpc('privacy.get', {})
  const [current, setCurrent] = useState('')
  const [pin, setPin] = useState('')
  const [again, setAgain] = useState('')
  const [done, setDone] = useState<string | null>(null)
  if (!v) return <SectionCard title="Privacy">Loading…</SectionCard>
  const valid = /^\d{4,8}$/.test(pin) && pin === again
  const save = (next: string | null): void =>
    void act(async () => {
      await call('privacy.setPin', { pin: next, currentPin: v.pinSet ? current : null })
      setCurrent('')
      setPin('')
      setAgain('')
      setDone(
        next ? 'The PIN is set. Tell the staff who need to show codes.' : 'The PIN is removed.'
      )
    })
  return (
    <div className="space-y-6">
      <SectionCard
        title="PIN for codes"
        description="When a PIN is set, nobody can show, print or export a lock code on any computer until they enter it. It lasts 10 minutes once entered."
      >
        <div className="space-y-4">
          <p className="flex gap-2 text-sm text-ink-muted">
            <ShieldCheck size={18} className="shrink-0 text-brand" aria-hidden />
            The PIN keeps codes away from casual eyes, for example someone glancing at the office
            computer. It is not strong protection against a person who copies the data file and sets
            out to break into it. Codes in the file are always stored scrambled.
          </p>
          {v.managedRequires && (
            <Banner tone="info" title="Required by your IT team">
              {v.pinSet
                ? 'Your IT team requires a PIN on this computer, so it cannot be removed.'
                : 'Your IT team requires a PIN on this computer. Codes cannot be shown until one is set.'}
            </Banner>
          )}
          <p className="text-sm font-semibold" data-testid="pin-state">
            {v.pinSet ? 'A PIN is set.' : 'No PIN is set: anyone editing the file can show codes.'}
          </p>
          <div className="grid max-w-2xl gap-3 sm:grid-cols-3">
            {v.pinSet && (
              <Field label="Current PIN" htmlFor="pin-current">
                <TextInput
                  id="pin-current"
                  type="password"
                  inputMode="numeric"
                  value={current}
                  onChange={(e) => setCurrent(digits(e.target.value))}
                />
              </Field>
            )}
            <Field label={v.pinSet ? 'New PIN' : 'PIN (4 to 8 digits)'} htmlFor="pin-new">
              <TextInput
                id="pin-new"
                type="password"
                inputMode="numeric"
                value={pin}
                onChange={(e) => setPin(digits(e.target.value))}
                data-testid="pin-new"
              />
            </Field>
            <Field label="Type it again" htmlFor="pin-again">
              <TextInput
                id="pin-again"
                type="password"
                inputMode="numeric"
                value={again}
                onChange={(e) => setAgain(digits(e.target.value))}
                data-testid="pin-again"
              />
            </Field>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={!canEdit || !valid || (v.pinSet && current.length < 4)}
              onClick={() => save(pin)}
              data-testid="pin-save"
            >
              {v.pinSet ? 'Change the PIN' : 'Set the PIN'}
            </Button>
            {v.pinSet && !v.managedRequires && (
              <Button
                variant="secondary"
                disabled={!canEdit || current.length < 4}
                onClick={() => save(null)}
              >
                Remove the PIN
              </Button>
            )}
          </div>
          <p className="text-xs text-ink-muted">
            If the PIN is forgotten, codes are still in the file but cannot be shown. Keep the PIN
            somewhere safe, for example with the master key.
          </p>
          {done && <p className="text-sm">{done}</p>}
        </div>
      </SectionCard>
      <SectionCard
        title="Codes on screen"
        description="A shown code hides itself after this time. Every code shown, printed or exported is recorded in the history."
      >
        <Field label="Hide codes after" htmlFor="auto-hide">
          <Select
            id="auto-hide"
            className="max-w-xs"
            disabled={!canEdit}
            value={v.autoHideSeconds}
            onChange={(e) =>
              void act(() => call('privacy.setAutoHide', { seconds: Number(e.target.value) }))
            }
          >
            {[10, 20, 30, 60, 120].map((n) => (
              <option key={n} value={n}>
                {n < 60 ? `${n} seconds` : `${n / 60} minute${n === 60 ? '' : 's'}`}
              </option>
            ))}
          </Select>
        </Field>
      </SectionCard>
    </div>
  )
}
