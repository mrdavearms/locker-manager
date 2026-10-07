import { useState } from 'react'
import { Accessibility, Ban, FileInput, Search, SpellCheck, UserPlus, UserX } from 'lucide-react'
import type { StudentFilter, StudentView } from '@shared/students'
import { AddStudentDialog } from '@renderer/components/AddStudentDialog'
import { Button } from '@renderer/components/Button'
import { Field, SectionCard, TextInput } from '@renderer/components/Field'
import { Modal } from '@renderer/components/Modal'
import { useAction, useCanEdit, useNotify, useTerms } from '@renderer/lib/appContext'
import { cn } from '@renderer/lib/cn'
import { formatWhen } from '@renderer/lib/format'
import { call, useRpc } from '@renderer/lib/rpc'
import { StudentLockerCard, type LockerIntent } from '@renderer/lockers/LockerActions'

const NAME_CHECK_TEXT: Record<string, string> = {
  mac: 'Mac name: MacDonald or Macdonald?',
  particle: 'Surname with de, van, von…: check the capitals',
  two_word: 'Two-word surname: check spelling and capitals'
}

function StudentPanel({
  s,
  onClose,
  intent,
  onIntentDone
}: {
  s: StudentView
  onClose: () => void
  intent: LockerIntent
  onIntentDone: () => void
}): React.JSX.Element {
  const terms = useTerms()
  const canEdit = useCanEdit()
  const act = useAction()
  const notify = useNotify()
  const [first, setFirst] = useState(s.firstName)
  const [last, setLast] = useState(s.lastName)
  const [preferred, setPreferred] = useState(s.preferredName ?? '')
  const [excluding, setExcluding] = useState(false)
  const [reason, setReason] = useState('')
  const dirty =
    first !== s.firstName || last !== s.lastName || preferred !== (s.preferredName ?? '')

  return (
    <aside className="card sticky top-4 w-full p-6 lg:w-[24rem]" aria-label={s.displayName}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-ink-muted">
            {terms.studentId.one} {s.externalId}
          </p>
          <h2 className="text-2xl font-semibold">{s.displayName}</h2>
          <p className="text-sm text-ink-muted">
            {s.yearLevel ? `${terms.yearLevel.one} ${s.yearLevel}` : 'No year level'} ·{' '}
            {s.groupDisplay ?? `no ${terms.group.one.toLowerCase()}`}
            {s.locker ? ` · ${terms.locker.one} ${s.locker.number}` : ''}
          </p>
        </div>
        <button
          className="rounded-lg p-1.5 text-ink-muted hover:bg-surface-muted"
          aria-label="Close"
          onClick={onClose}
        >
          ✕
        </button>
      </div>

      {s.nameCheck.length > 0 && (
        <div className="mt-4 rounded-xl bg-warn-soft p-3 text-sm">
          <p className="font-semibold">Check this name</p>
          <ul className="mt-1 list-disc pl-5">
            {s.nameCheck.map((c) => (
              <li key={c}>{NAME_CHECK_TEXT[c] ?? c}</li>
            ))}
          </ul>
          <p className="mt-1 text-ink-muted">
            In the student system: {s.firstNameRaw} {s.lastNameRaw}
          </p>
          <Button
            className="mt-2"
            size="sm"
            disabled={!canEdit}
            onClick={() =>
              void act(async () => {
                await call('student.update', { id: s.id, confirmName: true })
                notify('Name spelling confirmed.')
              })
            }
          >
            The spelling is right
          </Button>
        </div>
      )}

      <div className="mt-5 grid gap-3">
        <Field label="First name" htmlFor="st-first">
          <TextInput
            id="st-first"
            disabled={!canEdit}
            value={first}
            maxLength={80}
            onChange={(e) => setFirst(e.target.value)}
          />
        </Field>
        <Field label="Last name" htmlFor="st-last">
          <TextInput
            id="st-last"
            disabled={!canEdit}
            value={last}
            maxLength={80}
            onChange={(e) => setLast(e.target.value)}
          />
        </Field>
        <Field label="Preferred name (optional)" htmlFor="st-pref">
          <TextInput
            id="st-pref"
            disabled={!canEdit}
            value={preferred}
            maxLength={80}
            onChange={(e) => setPreferred(e.target.value)}
          />
        </Field>
        {dirty && (
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => (
                setFirst(s.firstName),
                setLast(s.lastName),
                setPreferred(s.preferredName ?? '')
              )}
            >
              Undo
            </Button>
            <Button
              size="sm"
              onClick={() =>
                void act(async () => {
                  await call('student.update', {
                    id: s.id,
                    firstName: first,
                    lastName: last,
                    preferredName: preferred || null
                  })
                  notify('Name saved.')
                })
              }
            >
              Save name
            </Button>
          </div>
        )}
        {s.nameOverride && (
          <p className="text-xs text-ink-muted">
            This name was corrected by hand, so imports keep it.
          </p>
        )}
      </div>

      <StudentLockerCard s={s} intent={intent} onIntentDone={onIntentDone} />

      <label className="mt-5 flex items-center justify-between gap-3 text-sm">
        <span className="flex items-center gap-2">
          <Accessibility size={18} className="text-ink-muted" aria-hidden /> Needs an accessible{' '}
          {terms.locker.one.toLowerCase()}
        </span>
        <input
          type="checkbox"
          className="size-5 accent-[var(--color-brand)]"
          disabled={!canEdit}
          checked={s.needsAccessible}
          onChange={(e) =>
            void act(() => call('student.update', { id: s.id, needsAccessible: e.target.checked }))
          }
        />
      </label>

      <div className="mt-5 space-y-2">
        {s.excludedReason ? (
          <p className="flex items-center gap-2 text-sm text-warn">
            <Ban size={16} aria-hidden /> Never gets a {terms.locker.one.toLowerCase()}:{' '}
            {s.excludedReason}
          </p>
        ) : (
          <Button
            size="sm"
            variant="secondary"
            disabled={!canEdit}
            onClick={() => (setReason(''), setExcluding(true))}
          >
            Never give a {terms.locker.one.toLowerCase()}…
          </Button>
        )}
        {s.notInImportSince && s.active && (
          <div className="rounded-xl bg-accent-soft p-3 text-sm">
            <p className="font-semibold">Not in the import of {formatWhen(s.notInImportSince)}</p>
            <p className="text-ink-muted">They may have left. Check with the {terms.office.one}.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={!canEdit}
                onClick={() =>
                  void act(async () => {
                    await call('student.stillHere', { id: s.id })
                    notify(`${s.displayName} is still enrolled.`)
                  })
                }
              >
                Still enrolled
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={!canEdit}
                onClick={() =>
                  void act(async () => {
                    await call('student.confirmLeft', { id: s.id })
                    notify(`${s.displayName} has left.`)
                  })
                }
              >
                Has left
              </Button>
            </div>
          </div>
        )}
        {!s.active && (
          <p className="text-sm text-ink-muted">
            Left on {s.leftAt ? formatWhen(s.leftAt) : 'an unknown date'}.
          </p>
        )}
      </div>

      {excluding && (
        <Modal
          open
          onOpenChange={(o) => !o && setExcluding(false)}
          title={`Never give ${s.displayName} a ${terms.locker.one.toLowerCase()}`}
          description="They stay in the file, but automatic allocation skips them."
        >
          <Field label="Why?" htmlFor="ex-reason">
            <TextInput
              id="ex-reason"
              autoFocus
              value={reason}
              maxLength={200}
              onChange={(e) => setReason(e.target.value)}
              placeholder="For example, uses a locker in the Senior Centre"
            />
          </Field>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setExcluding(false)}>
              Cancel
            </Button>
            <Button
              disabled={reason.trim().length < 3}
              onClick={() =>
                void act(
                  async () => (
                    await call('exclusion.add', { kind: 'student', value: s.externalId, reason }),
                    setExcluding(false),
                    notify(`${s.displayName} is excluded from imports.`)
                  )
                )
              }
            >
              Exclude
            </Button>
          </div>
        </Modal>
      )}
    </aside>
  )
}

function ExclusionsCard(): React.JSX.Element {
  const terms = useTerms()
  const canEdit = useCanEdit()
  const act = useAction()
  const { data: exclusions } = useRpc('exclusions.list', {})
  const { data: groups } = useRpc('groups.list', {})
  const [adding, setAdding] = useState<{
    kind: 'group' | 'year_level'
    value: string
    reason: string
  } | null>(null)
  const kindText = { student: 'Student', group: terms.group.one, year_level: terms.yearLevel.one }
  return (
    <SectionCard
      title={`Who never gets a ${terms.locker.one.toLowerCase()}`}
      description={`For example ${terms.group.one} ZZZ ("not in a ${terms.group.one.toLowerCase()}"), or a student who uses a locker elsewhere.`}
      actions={
        <Button
          size="sm"
          disabled={!canEdit}
          onClick={() => setAdding({ kind: 'group', value: '', reason: '' })}
        >
          Exclude a {terms.group.one.toLowerCase()} or {terms.yearLevel.one.toLowerCase()}…
        </Button>
      }
    >
      {exclusions?.length === 0 ? (
        <p className="text-sm text-ink-muted">Nobody is excluded.</p>
      ) : (
        <ul className="divide-y divide-line">
          {exclusions?.map((e) => (
            <li key={e.id} className="flex items-center gap-3 py-2 text-sm">
              <span className="w-28 text-ink-muted">{kindText[e.kind]}</span>
              <span className="font-semibold">{e.label}</span>
              <span className="flex-1 text-ink-muted">{e.reason}</span>
              <Button
                size="sm"
                variant="ghost"
                disabled={!canEdit}
                onClick={() => void act(() => call('exclusion.remove', { id: e.id }))}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
      {adding && (
        <Modal
          open
          onOpenChange={(o) => !o && setAdding(null)}
          title={`Exclude a ${terms.group.one.toLowerCase()} or ${terms.yearLevel.one.toLowerCase()}`}
          description="Students in it stay in the file, but automatic allocation skips them."
        >
          <div className="grid gap-4">
            <Field label="What to exclude" htmlFor="ex-kind">
              <select
                id="ex-kind"
                className="h-11 w-full rounded-xl border border-line-strong bg-surface px-3"
                value={adding.kind}
                onChange={(e) =>
                  setAdding({
                    ...adding,
                    kind: e.target.value as 'group' | 'year_level',
                    value: ''
                  })
                }
              >
                <option value="group">A {terms.group.one.toLowerCase()}</option>
                <option value="year_level">A {terms.yearLevel.one.toLowerCase()}</option>
              </select>
            </Field>
            <Field
              label={adding.kind === 'group' ? `${terms.group.one} code` : terms.yearLevel.one}
              hint={
                adding.kind === 'group'
                  ? 'As it appears in your student system, for example ZZZ'
                  : 'For example 12'
              }
              htmlFor="ex-value"
            >
              <TextInput
                id="ex-value"
                list="ex-groups"
                value={adding.value}
                maxLength={40}
                onChange={(e) => setAdding({ ...adding, value: e.target.value })}
              />
              <datalist id="ex-groups">
                {adding.kind === 'group' &&
                  groups?.map((g) => <option key={g.code} value={g.code} />)}
              </datalist>
            </Field>
            <Field label="Why?" htmlFor="ex-why">
              <TextInput
                id="ex-why"
                value={adding.reason}
                maxLength={200}
                onChange={(e) => setAdding({ ...adding, reason: e.target.value })}
              />
            </Field>
          </div>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAdding(null)}>
              Cancel
            </Button>
            <Button
              disabled={adding.value.trim() === '' || adding.reason.trim().length < 3}
              onClick={() =>
                void act(
                  async () => (
                    await call('exclusion.add', {
                      kind: adding.kind,
                      value: adding.value,
                      reason: adding.reason
                    }),
                    setAdding(null)
                  )
                )
              }
            >
              Exclude
            </Button>
          </div>
        </Modal>
      )}
    </SectionCard>
  )
}

/** Fetched by id, so a student found by quick find shows whatever the list filter. */
function SelectedStudent({
  id,
  onClose,
  intent,
  onIntentDone
}: {
  id: string
  onClose: () => void
  intent: LockerIntent
  onIntentDone: () => void
}): React.JSX.Element | null {
  const { data: s } = useRpc('student.get', { id })
  if (!s) return null
  return (
    <StudentPanel
      key={`${s.id}-${s.firstName}-${s.lastName}-${s.preferredName ?? ''}`}
      s={s}
      onClose={onClose}
      intent={intent}
      onIntentDone={onIntentDone}
    />
  )
}

export function StudentsScreen({
  onImport,
  focus
}: {
  onImport: () => void
  focus?: { studentId: string; intent: LockerIntent } | null
}): React.JSX.Element {
  const terms = useTerms()
  const canEdit = useCanEdit()
  const [filter, setFilter] = useState<StudentFilter>('current')
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(focus?.studentId ?? null)
  const [intent, setIntent] = useState<LockerIntent>(focus?.intent ?? null)
  const [adding, setAdding] = useState(false)
  const { data: counts } = useRpc('students.counts', {})
  const { data: students } = useRpc('students.list', {
    filter,
    ...(search.trim() ? { search } : {})
  })

  const filters: {
    id: StudentFilter
    label: string
    count: number | undefined
    icon?: typeof Search
  }[] = [
    { id: 'current', label: 'Enrolled', count: counts?.current },
    { id: 'no_locker', label: `No ${terms.locker.one.toLowerCase()}`, count: counts?.noLocker },
    {
      id: 'possible_leavers',
      label: 'Possible leavers',
      count: counts?.possibleLeavers,
      icon: UserX
    },
    { id: 'name_check', label: 'Names to check', count: counts?.nameCheck, icon: SpellCheck },
    { id: 'left', label: 'Left', count: counts?.left }
  ]

  return (
    <div className="w-full space-y-6 px-6 py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Students</h1>
          <p className="mt-1 text-ink-muted">
            From your student system. Names, {terms.group.many.toLowerCase()} and year levels update
            with each import.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="lg"
            variant="secondary"
            disabled={!canEdit}
            onClick={() => setAdding(true)}
            data-testid="add-student-open"
          >
            <UserPlus size={20} aria-hidden /> Add a student…
          </Button>
          <Button size="lg" disabled={!canEdit} onClick={onImport} data-testid="start-import">
            <FileInput size={20} aria-hidden /> Import students
          </Button>
        </div>
      </header>
      <AddStudentDialog
        open={adding}
        onClose={() => setAdding(false)}
        onAdded={(s) => (
          setAdding(false),
          setFilter('current'),
          setSearch(''),
          setSelectedId(s.id)
        )}
      />

      <div className="flex flex-wrap items-center gap-3">
        <div
          role="tablist"
          aria-label="Show"
          className="flex flex-wrap gap-1 rounded-2xl bg-surface-muted p-1"
        >
          {filters.map((f) => (
            <button
              key={f.id}
              role="tab"
              aria-selected={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                'flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold',
                filter === f.id
                  ? 'bg-surface text-ink shadow-[var(--shadow-card)]'
                  : 'text-ink-muted hover:text-ink'
              )}
            >
              {f.label}
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-xs tabular-nums',
                  (f.id === 'possible_leavers' || f.id === 'name_check') && (f.count ?? 0) > 0
                    ? 'bg-accent text-white'
                    : 'bg-black/5'
                )}
              >
                {f.count ?? '…'}
              </span>
            </button>
          ))}
        </div>
        <label className="relative ml-auto">
          <span className="sr-only">Search students</span>
          <Search
            size={17}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted"
            aria-hidden
          />
          <input
            data-testid="student-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Name, ${terms.studentId.one} or ${terms.locker.one.toLowerCase()}`}
            className="h-11 w-72 rounded-xl border border-line-strong bg-surface pl-9 pr-3"
          />
        </label>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="card min-w-0 flex-1 overflow-hidden">
          {students && students.length === 0 ? (
            <div className="p-10 text-center">
              <p className="text-lg font-semibold">
                {counts && counts.current === 0 && filter === 'current'
                  ? 'No students yet'
                  : 'Nobody here'}
              </p>
              {counts && counts.current === 0 && filter === 'current' && (
                <>
                  <p className="mt-1 text-ink-muted">
                    Import an export from your student system, such as Compass.
                  </p>
                  <Button className="mt-4" disabled={!canEdit} onClick={onImport}>
                    Import students
                  </Button>
                </>
              )}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-surface-muted text-left text-ink-muted">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Name</th>
                  <th className="px-4 py-2.5 font-semibold">{terms.yearLevel.one}</th>
                  <th className="px-4 py-2.5 font-semibold">{terms.group.one}</th>
                  <th className="px-4 py-2.5 font-semibold">{terms.locker.one}</th>
                  <th className="px-4 py-2.5 font-semibold">{terms.studentId.one}</th>
                </tr>
              </thead>
              <tbody>
                {students?.map((s) => (
                  <tr
                    key={s.id}
                    onClick={() => setSelectedId(s.id)}
                    className={cn(
                      'cursor-pointer border-t border-line hover:bg-surface-muted',
                      s.id === selectedId && 'bg-brand-soft'
                    )}
                  >
                    <td className="px-4 py-2.5">
                      <button
                        className="text-left font-semibold"
                        onClick={() => setSelectedId(s.id)}
                      >
                        {s.lastName}, {s.preferredName || s.firstName}
                      </button>
                      {s.nameCheck.length > 0 && (
                        <SpellCheck
                          size={14}
                          className="ml-1.5 inline text-warn"
                          aria-label="Name to check"
                        />
                      )}
                      {s.notInImportSince && s.active && (
                        <UserX
                          size={14}
                          className="ml-1.5 inline text-accent"
                          aria-label="Possible leaver"
                        />
                      )}
                      {s.excludedReason && (
                        <Ban
                          size={14}
                          className="ml-1.5 inline text-ink-muted"
                          aria-label="Never gets a locker"
                        />
                      )}
                    </td>
                    <td className="px-4 py-2.5 tabular-nums">{s.yearLevel ?? ''}</td>
                    <td className="px-4 py-2.5">{s.groupDisplay ?? ''}</td>
                    <td className="px-4 py-2.5 tabular-nums">
                      {s.locker?.number ?? <span className="text-ink-muted">none</span>}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-ink-muted">{s.externalId}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {selectedId && (
          <SelectedStudent
            id={selectedId}
            intent={intent}
            onIntentDone={() => setIntent(null)}
            onClose={() => setSelectedId(null)}
          />
        )}
      </div>

      <ExclusionsCard />
    </div>
  )
}
