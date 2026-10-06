import { useState } from 'react'
import { KEY_EVENTS, KEY_EVENT_TEXT, type KeyEventKind } from '@shared/keys'
import type { LockerView } from '@shared/locations'
import { Button } from '@renderer/components/Button'
import { Select, TextInput } from '@renderer/components/Field'
import { useAction, useCanEdit } from '@renderer/lib/appContext'
import { formatWhen } from '@renderer/lib/format'
import { call, useRpc } from '@renderer/lib/rpc'

/** The key register for one keyed lock (SPEC.md 3.4): its key number and every key event. */
export function KeyPanel({ l }: { l: LockerView }): React.JSX.Element | null {
  const canEdit = useCanEdit()
  const act = useAction()
  const { data: info } = useRpc('keys.get', { lockerId: l.id })
  const [number, setNumber] = useState<string | null>(null)
  const [event, setEvent] = useState<KeyEventKind>('issued')
  const [notes, setNotes] = useState('')
  const [amount, setAmount] = useState('')
  if (!info) return null
  const holder = l.holders[0]?.studentId ?? null
  const cents = Math.round(Number(amount.replace(/[$,]/g, '')) * 100)
  return (
    <section className="mt-5 rounded-2xl border border-line p-4" data-testid="key-panel">
      <h3 className="font-semibold">Keys</h3>
      <div className="mt-3 flex items-end gap-2">
        <label className="flex-1 text-sm">
          <span className="font-semibold">Key number</span>
          <TextInput
            className="mt-1"
            disabled={!canEdit}
            value={number ?? info.keyNumber ?? ''}
            onChange={(e) => setNumber(e.target.value)}
          />
        </label>
        {number !== null && number !== (info.keyNumber ?? '') && (
          <Button
            size="sm"
            onClick={() =>
              void act(async () => {
                await call('keys.setNumber', { lockId: info.lockId, keyNumber: number || null })
                setNumber(null)
              })
            }
          >
            Save
          </Button>
        )}
      </div>
      <p className="mt-3 text-sm" data-testid="keys-out">
        {info.keysOut === 0
          ? 'No keys out.'
          : `${info.keysOut} ${info.keysOut === 1 ? 'key' : 'keys'} out, not yet returned.`}
      </p>
      <div className="mt-3 grid gap-2">
        <Select
          aria-label="What happened"
          disabled={!canEdit}
          value={event}
          onChange={(e) => setEvent(e.target.value as KeyEventKind)}
        >
          {KEY_EVENTS.map((k) => (
            <option key={k} value={k}>
              {KEY_EVENT_TEXT[k]}
            </option>
          ))}
        </Select>
        {event === 'charged' && (
          <TextInput
            aria-label="Amount in dollars"
            placeholder="Amount, for example 15.00"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        )}
        <TextInput
          aria-label="Notes"
          placeholder="Notes (optional)"
          value={notes}
          maxLength={300}
          onChange={(e) => setNotes(e.target.value)}
        />
        <Button
          size="sm"
          variant="secondary"
          disabled={!canEdit || (event === 'charged' && !(cents > 0))}
          data-testid="key-record"
          onClick={() =>
            void act(async () => {
              await call('keys.event', {
                lockId: info.lockId,
                event,
                studentId: holder,
                notes: notes || null,
                amountCents: event === 'charged' ? cents : null
              })
              setNotes('')
              setAmount('')
            })
          }
        >
          Record{l.holders[0] ? ` for ${l.holders[0].name}` : ''}
        </Button>
      </div>
      {info.events.length > 0 && (
        <ul className="mt-3 space-y-1.5 text-xs text-ink-muted">
          {info.events.slice(0, 6).map((e) => (
            <li key={e.id}>
              <span className="font-semibold text-ink">{KEY_EVENT_TEXT[e.event]}</span>
              {e.student ? ` · ${e.student}` : ''}
              {e.amountCents !== null ? ` · $${(e.amountCents / 100).toFixed(2)}` : ''}
              {e.notes ? ` · ${e.notes}` : ''} · {formatWhen(e.date)} by {e.by}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
