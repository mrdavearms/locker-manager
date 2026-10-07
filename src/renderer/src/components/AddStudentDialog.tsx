import { useState } from 'react'
import type { StudentView } from '@shared/students'
import { useAction, useNotify, useTerms } from '@renderer/lib/appContext'
import { call, useRpc } from '@renderer/lib/rpc'
import { Button } from './Button'
import { Field, Select, TextInput } from './Field'
import { Modal } from './Modal'

const OTHER = '__other'

/** "Zelda Newcomb" -> first "Zelda", last "Newcomb"; one word goes in the first name. */
function splitName(typed: string): { first: string; last: string } {
  const words = typed.trim().split(/\s+/).filter(Boolean)
  if (words.length < 2) return { first: words[0] ?? '', last: '' }
  return { first: words.slice(0, -1).join(' '), last: words[words.length - 1]! }
}

function AddStudentForm({
  initialName,
  onClose,
  onAdded
}: {
  initialName: string
  onClose: () => void
  onAdded: (s: StudentView) => void
}): React.JSX.Element {
  const terms = useTerms()
  const act = useAction()
  const notify = useNotify()
  const { data: groups } = useRpc('groups.list', {})
  const initial = splitName(initialName)
  const [externalId, setExternalId] = useState('')
  const [first, setFirst] = useState(initial.first)
  const [last, setLast] = useState(initial.last)
  const [preferred, setPreferred] = useState('')
  const [yearChoice, setYearChoice] = useState('')
  const [yearOther, setYearOther] = useState('')
  const [groupCode, setGroupCode] = useState('')

  const years = [
    ...new Set((groups ?? []).map((g) => g.yearLevel).filter((y): y is string => y !== null))
  ].sort((a, b) => Number(a) - Number(b) || a.localeCompare(b))
  const yearLevel = yearChoice === OTHER ? yearOther.trim() : yearChoice
  const ready = externalId.trim() !== '' && first.trim() !== '' && last.trim() !== ''
  const yearWord = terms.yearLevel.one
  const groupWord = terms.group.one

  const save = (): void =>
    void act(async () => {
      const s = await call('student.create', {
        externalId,
        firstName: first,
        lastName: last,
        preferredName: preferred.trim() || null,
        yearLevel: yearLevel || null,
        groupCode: groupCode || null
      })
      notify(`${s.displayName} added.`)
      onAdded(s)
    })

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (ready) save()
      }}
    >
      <Field label={terms.studentId.one} htmlFor="add-st-id">
        <TextInput
          id="add-st-id"
          autoFocus
          value={externalId}
          maxLength={40}
          onChange={(e) => setExternalId(e.target.value)}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First name" htmlFor="add-st-first">
          <TextInput
            id="add-st-first"
            value={first}
            maxLength={80}
            onChange={(e) => setFirst(e.target.value)}
          />
        </Field>
        <Field label="Last name" htmlFor="add-st-last">
          <TextInput
            id="add-st-last"
            value={last}
            maxLength={80}
            onChange={(e) => setLast(e.target.value)}
          />
        </Field>
      </div>
      <Field label="Preferred name (optional)" htmlFor="add-st-pref">
        <TextInput
          id="add-st-pref"
          value={preferred}
          maxLength={80}
          onChange={(e) => setPreferred(e.target.value)}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={yearWord} htmlFor="add-st-year">
          <Select
            id="add-st-year"
            value={yearChoice}
            onChange={(e) => setYearChoice(e.target.value)}
          >
            <option value="">Not set</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {yearWord} {y}
              </option>
            ))}
            <option value={OTHER}>Other…</option>
          </Select>
          {yearChoice === OTHER && (
            <TextInput
              className="mt-2"
              aria-label={`Other ${yearWord.toLowerCase()}`}
              value={yearOther}
              maxLength={20}
              onChange={(e) => setYearOther(e.target.value)}
            />
          )}
        </Field>
        <Field label={groupWord} htmlFor="add-st-group">
          <Select
            id="add-st-group"
            value={groupCode}
            onChange={(e) => setGroupCode(e.target.value)}
          >
            <option value="">None</option>
            {(groups ?? []).map((g) => (
              <option key={g.code} value={g.code}>
                {g.display}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="mt-2 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={!ready} data-testid="add-student-save">
          Add student
        </Button>
      </div>
    </form>
  )
}

/** A student added by hand, for a new enrolment before the next import. */
export function AddStudentDialog({
  open,
  onClose,
  onAdded,
  initialName = ''
}: {
  open: boolean
  onClose: () => void
  onAdded: (s: StudentView) => void
  initialName?: string
}): React.JSX.Element {
  const terms = useTerms()
  return (
    <Modal
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Add a student"
      description={`For a new enrolment before your next import. The next import matches them by ${terms.studentId.one}, so type it exactly as in your student system.`}
      testId="add-student"
    >
      <AddStudentForm initialName={initialName} onClose={onClose} onAdded={onAdded} />
    </Modal>
  )
}
