import { useEffect, useMemo, useState } from 'react'
import { ArrowLeftRight, DoorOpen, KeyRound, Mail, MoveRight, UserMinus } from 'lucide-react'
import type { StudentView } from '@shared/students'
import { Button } from '@renderer/components/Button'
import { CodeBoxes, CodeReveal } from '@renderer/components/CodeReveal'
import { Field, Select, TextInput } from '@renderer/components/Field'
import { Modal } from '@renderer/components/Modal'
import { QuickFind } from '@renderer/components/QuickFind'
import { useCodeGate } from '@renderer/components/PinGate'
import { useAction, useCanEdit, useNotify, useTerms } from '@renderer/lib/appContext'
import { call, useRpc } from '@renderer/lib/rpc'

export type LockerIntent = 'assign' | 'leave' | 'recode' | 'move' | 'swap' | null

function IssuedDialog({
  title,
  code,
  lockerNumber,
  onClose
}: {
  title: string
  code: string | null
  lockerNumber: string
  onClose: () => void
}): React.JSX.Element {
  const terms = useTerms()
  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={title}
      description={`${terms.locker.one} ${lockerNumber}.`}
      testId="issued-dialog"
    >
      {code ? (
        <>
          <p className="text-sm text-ink-muted">
            The code for the student to set. It is also on their letter: print it from Letters, or
            with Save their letter below.
          </p>
          <div className="mt-3">
            <CodeBoxes code={code} />
          </div>
        </>
      ) : (
        <p className="text-sm text-ink-muted">
          No code to show here. Keyed locks and lockers without a lock have none. If your school
          protects codes with a PIN, use Show code.
        </p>
      )}
      <div className="mt-6 flex justify-end">
        <Button onClick={onClose}>Done</Button>
      </div>
    </Modal>
  )
}

/** Chooses a free locker: the suggested one first, then any other. */
function LockerChooser({
  studentId,
  value,
  onChange
}: {
  studentId: string
  value: string | null
  onChange: (id: string) => void
}): React.JSX.Element {
  const terms = useTerms()
  const { data: suggestion } = useRpc('locker.suggest', { studentId })
  const { data: lockers } = useRpc('lockers.list', {})
  const free = useMemo(
    () => (lockers ?? []).filter((l) => l.status === 'in_service' && l.holders.length < l.capacity),
    [lockers]
  )
  const current = value ?? suggestion?.lockerId ?? ''
  const suggestedId = suggestion?.lockerId ?? null
  useEffect(() => {
    if (value === null && suggestedId) onChange(suggestedId)
  }, [value, suggestedId, onChange])
  return (
    <Field
      label={`${terms.locker.one}`}
      hint={
        suggestion
          ? `Suggested: ${suggestion.number}, the first spare in their ${terms.area.one.toLowerCase()}.`
          : 'No spare in their area: choose any.'
      }
      htmlFor="choose-locker"
    >
      <Select id="choose-locker" value={current} onChange={(e) => onChange(e.target.value)}>
        {free.length === 0 && <option value="">No spare {terms.locker.many.toLowerCase()}</option>}
        {free.map((l) => (
          <option key={l.id} value={l.id}>
            {l.number}
            {l.accessible ? ' (accessible)' : ''}
            {l.id === suggestion?.lockerId ? ' (suggested)' : ''}
          </option>
        ))}
      </Select>
    </Field>
  )
}

/** Everything that can happen to a student's locker, in one card (SPEC.md 4.4 and 4.5). */
export function StudentLockerCard({
  s,
  intent,
  onIntentDone
}: {
  s: StudentView
  intent: LockerIntent
  onIntentDone: () => void
}): React.JSX.Element {
  const terms = useTerms()
  const canEdit = useCanEdit()
  const act = useAction()
  const notify = useNotify()
  const [dialog, setDialog] = useState<LockerIntent>(intent)
  const [lockerId, setLockerId] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [issued, setIssued] = useState<{
    title: string
    code: string | null
    number: string
  } | null>(null)
  const close = (): void => {
    setDialog(null)
    setLockerId(null)
    setReason('')
    onIntentDone()
  }

  return (
    <div className="mt-5 rounded-2xl border border-line p-4" data-testid="student-locker">
      {s.locker ? (
        <>
          <div className="flex items-center gap-3">
            <DoorOpen size={20} className="text-brand" aria-hidden />
            <span className="flex-1">
              <span className="block text-xs font-bold uppercase tracking-wider text-ink-muted">
                {terms.locker.one}
              </span>
              <span className="stencil text-3xl leading-none">{s.locker.number}</span>
            </span>
          </div>
          <div className="mt-3">
            <CodeReveal lockerId={s.locker.id} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={!canEdit}
              onClick={() => setDialog('move')}
            >
              <MoveRight size={15} aria-hidden /> Move…
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={!canEdit}
              onClick={() => setDialog('swap')}
            >
              <ArrowLeftRight size={15} aria-hidden /> Swap…
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={!canEdit}
              onClick={() => setDialog('recode')}
            >
              <KeyRound size={15} aria-hidden /> New code…
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={!canEdit}
              onClick={() => setDialog('leave')}
            >
              <UserMinus size={15} aria-hidden /> Has left…
            </Button>
          </div>
          <StudentLetter s={s} />
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex-1 text-sm text-ink-muted">
            No {terms.locker.one.toLowerCase()}
            {s.excludedReason ? ` (never gets one: ${s.excludedReason})` : ''}.
          </span>
          {s.active && (
            <Button
              size="sm"
              disabled={!canEdit}
              onClick={() => setDialog('assign')}
              data-testid="give-locker"
            >
              Give a {terms.locker.one.toLowerCase()}…
            </Button>
          )}
        </div>
      )}

      {dialog === 'assign' && !s.locker && (
        <Modal
          open
          onOpenChange={(o) => !o && close()}
          title={`Give ${s.displayName} a ${terms.locker.one.toLowerCase()}`}
          description="They get the locker and a code for its lock."
        >
          <LockerChooser studentId={s.id} value={lockerId} onChange={setLockerId} />
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button
              disabled={!lockerId}
              data-testid="confirm-assign"
              onClick={() =>
                void act(async () => {
                  const r = await call('student.assign', { studentId: s.id, lockerId: lockerId! })
                  close()
                  setIssued({
                    title: `${s.displayName} has ${terms.locker.one.toLowerCase()} ${r.lockerNumber}`,
                    code: r.code,
                    number: r.lockerNumber
                  })
                })
              }
            >
              Give this {terms.locker.one.toLowerCase()}
            </Button>
          </div>
        </Modal>
      )}
      {dialog === 'move' && s.locker && (
        <Modal
          open
          onOpenChange={(o) => !o && close()}
          title={`Move ${s.displayName}`}
          description={`From ${terms.locker.one.toLowerCase()} ${s.locker.number}. The old ${terms.locker.one.toLowerCase()}'s code must change, because ${s.displayName.split(' ')[0]} knows it; it goes on the reset list.`}
        >
          <div className="grid gap-4">
            <LockerChooser studentId={s.id} value={lockerId} onChange={setLockerId} />
            <Field label="Why? (optional)" htmlFor="move-why">
              <TextInput
                id="move-why"
                value={reason}
                maxLength={200}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
          </div>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button
              disabled={!lockerId}
              onClick={() =>
                void act(async () => {
                  const r = await call('student.move', {
                    studentId: s.id,
                    lockerId: lockerId!,
                    ...(reason ? { reason } : {})
                  })
                  close()
                  setIssued({
                    title: `${s.displayName} moved to ${terms.locker.one.toLowerCase()} ${r.lockerNumber}`,
                    code: r.code,
                    number: r.lockerNumber
                  })
                })
              }
            >
              Move
            </Button>
          </div>
        </Modal>
      )}
      {dialog === 'swap' && s.locker && (
        <QuickFind
          open
          title={`Swap ${s.displayName} with…`}
          onClose={close}
          onPick={(r) =>
            void act(async () => {
              if (!r.studentId || r.studentId === s.id)
                throw new Error('Choose another student who has a locker.')
              await call('student.swap', { studentId: s.id, otherStudentId: r.studentId })
              notify(`Swapped ${s.displayName} and ${r.title}.`)
              close()
            })
          }
        />
      )}
      {dialog === 'recode' && s.locker && (
        <Modal
          open
          onOpenChange={(o) => !o && close()}
          title={`New code for ${terms.locker.one.toLowerCase()} ${s.locker.number}`}
          description="When someone else may know the code. For a forgotten code, use Show code instead."
        >
          <Field label="Why?" htmlFor="recode-why">
            <TextInput
              id="recode-why"
              autoFocus
              value={reason}
              maxLength={200}
              onChange={(e) => setReason(e.target.value)}
              placeholder="For example, a friend saw the code"
            />
          </Field>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button
              disabled={reason.trim().length < 3}
              onClick={() =>
                void act(async () => {
                  const r = await call('codes.recode', { lockerId: s.locker!.id, reason })
                  const number = s.locker!.number
                  close()
                  setIssued({
                    title: 'New code issued: reset the lock first',
                    code: r.code,
                    number
                  })
                })
              }
            >
              Issue a new code
            </Button>
          </div>
        </Modal>
      )}
      {dialog === 'leave' && s.locker && (
        <Modal
          open
          onOpenChange={(o) => !o && close()}
          title={`${s.displayName} has left`}
          description={`${terms.locker.one} ${s.locker.number} becomes a spare. Its code must change before anyone else uses it, so it goes on the reset list.`}
        >
          <Field label="Note (optional)" htmlFor="leave-why">
            <TextInput
              id="leave-why"
              value={reason}
              maxLength={200}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button
              variant="danger"
              data-testid="confirm-left"
              onClick={() =>
                void act(
                  async () => (
                    await call('student.release', {
                      studentId: s.id,
                      left: true,
                      ...(reason ? { reason } : {})
                    }),
                    close(),
                    notify(
                      `${s.displayName} has left. ${terms.locker.one} ${s.locker!.number} is spare and on the reset list.`
                    )
                  )
                )
              }
            >
              Confirm they have left
            </Button>
          </div>
        </Modal>
      )}
      {issued && (
        <IssuedDialog
          title={issued.title}
          code={issued.code}
          lockerNumber={issued.number}
          onClose={() => setIssued(null)}
        />
      )}
    </div>
  )
}

export function ResetList(): React.JSX.Element | null {
  const terms = useTerms()
  const canEdit = useCanEdit()
  const act = useAction()
  const notify = useNotify()
  const { data: tasks } = useRpc('codes.resetTasks', {})
  if (!tasks || tasks.length === 0) return null
  return (
    <section
      className="card p-6 animate-rise"
      aria-labelledby="reset-heading"
      data-testid="reset-list"
    >
      <h2 id="reset-heading" className="text-xl font-semibold">
        Locks to reset ({tasks.length})
      </h2>
      <p className="mt-1 text-sm text-ink-muted">
        Reset each lock to 0 0 0 0 with the master key, then tick it off. Letters for these wait
        until the lock is reset.
      </p>
      <ul className="mt-4 divide-y divide-line">
        {tasks.map((t) => (
          <li key={t.lockId} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
            <span className="stencil w-16 text-2xl leading-none">{t.lockerNumber ?? '?'}</span>
            <span className="flex-1">
              {t.holder ?? `Spare ${terms.locker.one.toLowerCase()}`}
              <span className="block text-ink-muted">
                {t.status === 'awaiting_physical_reset'
                  ? 'New code issued; reset the lock so the student can set it.'
                  : 'Old holder knows the code; reset it before reuse.'}
              </span>
            </span>
            <Button
              size="sm"
              disabled={!canEdit}
              onClick={() =>
                void act(async () => {
                  await call('codes.resetDone', { lockId: t.lockId })
                  notify(`${terms.locker.one} ${t.lockerNumber ?? ''} marked as reset.`)
                })
              }
            >
              Reset done
            </Button>
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * One student's letter, and the language it is written in (SPEC.md 4.8 and 5.2).
 * Letters carry codes, and every printed code is recorded, so this needs editing.
 */
function StudentLetter({ s }: { s: StudentView }): React.JSX.Element {
  const canEdit = useCanEdit()
  const act = useAction()
  const gate = useCodeGate()
  const { data: template } = useRpc('letters.template.get', {})
  const [saved, setSaved] = useState<string | null>(null)
  const languages = template?.languages ?? []
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
      <Button
        size="sm"
        variant="secondary"
        disabled={!canEdit}
        data-testid="student-letter"
        title={
          canEdit
            ? undefined
            : 'Letters show codes, so they print only while the file is open for editing.'
        }
        onClick={() =>
          void act(async () => {
            if (!(await gate())) return
            const r = await window.api.lettersPdf({
              selection: { mode: 'student', studentId: s.id },
              language: { kind: 'each' }
            })
            if (r.ok) setSaved(r.path ?? null)
            else if (!r.cancelled) throw new Error(r.message)
          })
        }
      >
        <Mail size={15} aria-hidden /> Save their letter as PDF…
      </Button>
      {languages.length > 1 && (
        <Select
          aria-label="Letter language"
          className="w-auto"
          disabled={!canEdit}
          value={s.language ?? ''}
          onChange={(e) =>
            void act(() =>
              call('students.setLanguage', { studentId: s.id, code: e.target.value || null })
            )
          }
        >
          <option value="">Letter in {languages[0]!.name}</option>
          {languages.slice(1).map((l) => (
            <option key={l.code} value={l.code}>
              Letter in {l.name}
            </option>
          ))}
        </Select>
      )}
      {saved && (
        <Button size="sm" variant="ghost" onClick={() => void window.api.openPdf(saved)}>
          Open it
        </Button>
      )}
    </div>
  )
}
