import { useState } from 'react'
import { ChevronRight, Plus, Trash2 } from 'lucide-react'
import type { AreaView } from '@shared/locations'
import { Button } from '@renderer/components/Button'
import { Field, SectionCard, TextInput } from '@renderer/components/Field'
import { Modal } from '@renderer/components/Modal'
import { useAction, useCanEdit, useTerms } from '@renderer/lib/appContext'
import { call, useRpc } from '@renderer/lib/rpc'
import { plural } from '@renderer/lib/format'
import { BulkAddLockers } from './BulkAddLockers'

function NameDialog({
  title,
  description,
  label,
  initial,
  onSave,
  onClose
}: {
  title: string
  description: string
  label: string
  initial: string
  onSave: (name: string) => Promise<unknown>
  onClose: () => void
}): React.JSX.Element {
  const [name, setName] = useState(initial)
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={title} description={description}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void onSave(name.trim())
        }}
      >
        <Field label={label} htmlFor="name-dialog">
          <TextInput
            id="name-dialog"
            autoFocus
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={name.trim().length === 0}>
            Save
          </Button>
        </div>
      </form>
    </Modal>
  )
}

type Dialog =
  | { kind: 'new-area' }
  | { kind: 'rename-area'; area: AreaView }
  | { kind: 'new-bank'; area: AreaView }
  | { kind: 'rename-bank'; bankId: string; name: string }
  | { kind: 'add-lockers'; bankId: string; bankName: string }
  | null

/** SPEC.md 4.1 step 4 and settings tab 4: areas, banks and their lockers. */
export function LocationsEditor(): React.JSX.Element {
  const { data: areas } = useRpc('locations.list', {})
  const { data: lockers } = useRpc('lockers.list', {})
  const terms = useTerms()
  const canEdit = useCanEdit()
  const act = useAction()
  const [dialog, setDialog] = useState<Dialog>(null)
  const close = (): void => setDialog(null)

  return (
    <SectionCard
      title={`${terms.area.many}, ${terms.bank.many.toLowerCase()} and ${terms.locker.many.toLowerCase()}`}
      description={`An ${terms.area.one.toLowerCase()} is a group of ${terms.bank.many.toLowerCase()} with a purpose, such as "Year 7 side". A ${terms.bank.one.toLowerCase()} is a row or wall of ${terms.locker.many.toLowerCase()}.`}
      actions={
        <Button
          disabled={!canEdit}
          onClick={() => setDialog({ kind: 'new-area' })}
          data-testid="add-area"
        >
          <Plus size={18} aria-hidden /> Add {terms.area.one.toLowerCase()}
        </Button>
      }
    >
      {areas?.length === 0 && (
        <p className="rounded-xl bg-surface-muted p-5 text-sm text-ink-muted">
          Nothing yet. Start by adding an {terms.area.one.toLowerCase()}, such as “Year 7 side”.
        </p>
      )}
      <ul className="space-y-4">
        {areas?.map((area) => (
          <li key={area.id} className="rounded-2xl border border-line">
            <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3">
              <span
                className="size-3 rounded-full"
                style={{ background: area.colour ?? 'var(--color-brand)' }}
                aria-hidden
              />
              <h3 className="flex-1 text-lg font-semibold">{area.name}</h3>
              <Button
                size="sm"
                variant="ghost"
                disabled={!canEdit}
                onClick={() => setDialog({ kind: 'rename-area', area })}
              >
                Rename
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={!canEdit}
                onClick={() => setDialog({ kind: 'new-bank', area })}
                data-testid="add-bank"
              >
                <Plus size={16} aria-hidden /> Add {terms.bank.one.toLowerCase()}
              </Button>
              {area.banks.length === 0 && (
                <button
                  className="rounded-lg p-1.5 text-ink-muted hover:bg-surface-muted"
                  aria-label={`Remove ${area.name}`}
                  disabled={!canEdit}
                  onClick={() => void act(() => call('area.archive', { id: area.id }))}
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
            {area.banks.length === 0 ? (
              <p className="px-5 py-4 text-sm text-ink-muted">
                No {terms.bank.many.toLowerCase()} yet.
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {area.banks.map((b) => (
                  <li key={b.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                    <ChevronRight size={16} className="text-ink-muted" aria-hidden />
                    <span className="flex-1">
                      <span className="font-semibold">{b.name}</span>{' '}
                      <span className="text-sm text-ink-muted">
                        {plural(
                          b.lockerCount,
                          terms.locker.one.toLowerCase(),
                          terms.locker.many.toLowerCase()
                        )}
                        {b.columns && b.rows ? ` in ${b.columns} columns × ${b.rows} high` : ''}
                      </span>
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={!canEdit}
                      onClick={() => setDialog({ kind: 'rename-bank', bankId: b.id, name: b.name })}
                    >
                      Rename
                    </Button>
                    <Button
                      size="sm"
                      disabled={!canEdit}
                      onClick={() =>
                        setDialog({ kind: 'add-lockers', bankId: b.id, bankName: b.name })
                      }
                      data-testid="add-lockers"
                    >
                      <Plus size={16} aria-hidden /> Add {terms.locker.many.toLowerCase()}
                    </Button>
                    {b.lockerCount === 0 && (
                      <button
                        className="rounded-lg p-1.5 text-ink-muted hover:bg-surface-muted"
                        aria-label={`Remove ${b.name}`}
                        disabled={!canEdit}
                        onClick={() => void act(() => call('bank.archive', { id: b.id }))}
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>

      {dialog?.kind === 'new-area' && (
        <NameDialog
          title={`Add an ${terms.area.one.toLowerCase()}`}
          description="For example “Year 7 side” or “Senior Centre”."
          label="Name"
          initial=""
          onClose={close}
          onSave={(name) => act(async () => (await call('area.create', { name }), close()))}
        />
      )}
      {dialog?.kind === 'rename-area' && (
        <NameDialog
          title={`Rename ${dialog.area.name}`}
          description="The new name shows everywhere straight away."
          label="Name"
          initial={dialog.area.name}
          onClose={close}
          onSave={(name) =>
            act(async () => (await call('area.update', { id: dialog.area.id, name }), close()))
          }
        />
      )}
      {dialog?.kind === 'new-bank' && (
        <NameDialog
          title={`Add a ${terms.bank.one.toLowerCase()} to ${dialog.area.name}`}
          description="For example “North wall” or “Corridor B”."
          label="Name"
          initial=""
          onClose={close}
          onSave={(name) =>
            act(async () => (await call('bank.create', { areaId: dialog.area.id, name }), close()))
          }
        />
      )}
      {dialog?.kind === 'rename-bank' && (
        <NameDialog
          title={`Rename ${dialog.name}`}
          description="The new name shows everywhere straight away."
          label="Name"
          initial={dialog.name}
          onClose={close}
          onSave={(name) =>
            act(async () => (await call('bank.update', { id: dialog.bankId, name }), close()))
          }
        />
      )}
      {dialog?.kind === 'add-lockers' && (
        <Modal
          open
          onOpenChange={(o) => !o && close()}
          width="xl"
          title={`Add ${terms.locker.many.toLowerCase()} to ${dialog.bankName}`}
          description="Describe the run of numbers and how they are stacked. The preview shows exactly what will be added."
        >
          <BulkAddLockers
            bankId={dialog.bankId}
            existing={(lockers ?? []).map((l) => l.number)}
            onDone={close}
          />
        </Modal>
      )}
    </SectionCard>
  )
}
