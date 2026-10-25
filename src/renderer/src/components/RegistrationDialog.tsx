import { useState } from 'react'
import { brand } from '@shared/brand'
import type { RegistrationView } from '@shared/ipc'
import {
  REGISTRATION_EMAIL,
  RegistrationFormSchema,
  type RegistrationForm,
  type SendResult
} from '@shared/registration'
import { cn } from '@renderer/lib/cn'
import type { RegistrationTab } from '@renderer/lib/registration'
import { Button } from './Button'
import { Field, Select, TextInput, inputClass } from './Field'
import { Modal } from './Modal'

interface Props {
  tab: RegistrationTab | null
  view: RegistrationView | null
  onTab: (tab: RegistrationTab) => void
  onClose: () => void
  onRegistered: (view: RegistrationView) => void
}

const STATES: RegistrationForm['state'][] = [
  'ACT',
  'NSW',
  'NT',
  'QLD',
  'SA',
  'TAS',
  'VIC',
  'WA',
  'Outside Australia'
]

const PRIVACY_NOTE = `We collect your name, school, email, state, role and any notes you add to send your registration key and to contact your school about ${brand.name}. It is kept on Google Cloud in Sydney and in Dave Armstrong's email, seen only by Dave Armstrong, and never shared. Email ${REGISTRATION_EMAIL} to have it removed.`

/** Shown when a request to main fails outright, so the form is never left stuck or silent. */
const SOMETHING_WRONG = `Something went wrong. Try again, or close ${brand.name} and open it again.`

/** Register this school, or paste the key that came by email (registration design 6.1, 6.3). */
export function RegistrationDialog({
  tab,
  view,
  onTab,
  onClose,
  onRegistered
}: Props): React.JSX.Element {
  const tabs: { id: RegistrationTab; label: string }[] = [
    { id: 'register', label: 'Register' },
    { id: 'key', label: 'I have a key' }
  ]
  return (
    <Modal
      open={tab !== null}
      onOpenChange={(o) => !o && onClose()}
      title={`Register ${brand.name}`}
      description={`In most circumstances, ${brand.name} is free for schools. Register once and every computer that opens your school's file is covered.`}
      testId="registration-dialog"
    >
      {view?.state === 'registered' && view.enforced && (
        <p className="mb-5 rounded-2xl bg-brand-soft p-4 text-sm" data-testid="registered-now">
          This copy is registered to <strong>{view.school}</strong> ({view.id}).
        </p>
      )}
      <div
        role="tablist"
        aria-label="Registration"
        className="flex flex-wrap gap-1 rounded-2xl bg-surface-muted p-1"
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            data-testid={`tab-${t.id}`}
            onClick={() => onTab(t.id)}
            className={cn(
              'rounded-xl px-4 py-2 text-sm font-semibold transition-colors',
              tab === t.id
                ? 'bg-surface text-ink shadow-[var(--shadow-card)]'
                : 'text-ink-muted hover:text-ink'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="mt-5">
        {tab === 'key' ? (
          <KeyForm onClose={onClose} onRegistered={onRegistered} />
        ) : (
          <RegisterForm onClose={onClose} onHaveKey={() => onTab('key')} />
        )}
      </div>
    </Modal>
  )
}

/** Mounted fresh each time the dialog opens or the tab changes. */
function KeyForm({
  onClose,
  onRegistered
}: {
  onClose: () => void
  onRegistered: (view: RegistrationView) => void
}): React.JSX.Element {
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)
  const submit = async (): Promise<void> => {
    setBusy(true)
    try {
      const r = await window.api.enterRegistrationKey(key)
      if (r.ok) {
        setResult({ ok: true, text: `Registered to ${r.view.school ?? 'your school'}.` })
        onRegistered(r.view)
      } else setResult({ ok: false, text: r.message })
    } catch {
      setResult({ ok: false, text: SOMETHING_WRONG })
    } finally {
      setBusy(false)
    }
  }
  if (result?.ok) {
    return (
      <div>
        <p className="text-lg font-semibold text-good" role="status" data-testid="key-message">
          {result.text}
        </p>
        <div className="mt-6 flex justify-end">
          <Button onClick={onClose}>Done</Button>
        </div>
      </div>
    )
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <Field
        label="Registration key"
        htmlFor="registration-key"
        hint="Copy the whole key from the email, starting with LM1, and paste it here."
      >
        <textarea
          id="registration-key"
          data-testid="key-input"
          autoFocus
          value={key}
          onChange={(e) => setKey(e.target.value)}
          rows={4}
          maxLength={5000}
          spellCheck={false}
          className="w-full rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 font-mono text-sm"
        />
      </Field>
      {result && (
        <p role="alert" className="mt-4 text-sm font-semibold text-bad" data-testid="key-message">
          {result.text}
        </p>
      )}
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" data-testid="key-submit" disabled={busy || key.trim() === ''}>
          Register
        </Button>
      </div>
    </form>
  )
}

const PROBLEMS: Record<string, string> = {
  name: 'Type your name.',
  school: 'Type your school’s name.',
  email: 'Type your email address, for example name@school.edu.au.',
  state: 'Choose your state.',
  role: 'Make your role shorter.',
  notes: 'Make your notes shorter (up to 1000 characters).',
  privacyAgreed: 'Tick the box to agree to the privacy note.'
}

function RegisterForm({
  onClose,
  onHaveKey
}: {
  onClose: () => void
  onHaveKey: () => void
}): React.JSX.Element {
  const [name, setName] = useState('')
  const [school, setSchool] = useState('')
  const [email, setEmail] = useState('')
  const [state, setState] = useState('')
  const [role, setRole] = useState('')
  const [notes, setNotes] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [problems, setProblems] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState<{ result: SendResult; email: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const submit = async (): Promise<void> => {
    const parsed = RegistrationFormSchema.safeParse({
      name,
      school,
      email,
      state,
      ...(role.trim() ? { role } : {}),
      ...(notes.trim() ? { notes } : {}),
      privacyAgreed: agreed
    })
    if (!parsed.success) {
      const fields = new Set(parsed.error.issues.map((i) => String(i.path[0])))
      setProblems(
        Object.keys(PROBLEMS)
          .filter((f) => fields.has(f))
          .map((f) => PROBLEMS[f] ?? '')
      )
      return
    }
    setProblems([])
    setError(null)
    setBusy(true)
    try {
      const result = await window.api.sendRegistration(parsed.data)
      setSent({ result, email: parsed.data.email })
    } catch {
      setError(SOMETHING_WRONG)
    } finally {
      setBusy(false)
    }
  }

  /** The website form or the ready-made email. Nothing to wait for, but a failure is still said. */
  const openOtherWay = async (open: () => Promise<void>): Promise<void> => {
    setError(null)
    try {
      await open()
    } catch {
      setError(SOMETHING_WRONG)
    }
  }

  if (sent?.result.ok) {
    return (
      <div>
        <p className="font-semibold" role="status" data-testid="send-done">
          Thanks. Dave Armstrong checks each registration by hand, usually within a day. Your key
          will come to {sent.email}.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={onHaveKey}>
            I have a key
          </Button>
          <Button onClick={onClose}>Done</Button>
        </div>
      </div>
    )
  }

  const failed = sent && !sent.result.ok ? sent.result : null
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
      className="space-y-4"
    >
      <p className="text-sm font-semibold" data-testid="free-wording">
        Registering costs nothing.
      </p>
      <Field label="Your name" htmlFor="reg-name">
        <TextInput
          id="reg-name"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
          autoComplete="name"
        />
      </Field>
      <Field label="Your school" htmlFor="reg-school">
        <TextInput
          id="reg-school"
          value={school}
          onChange={(e) => setSchool(e.target.value)}
          maxLength={150}
          autoComplete="organization"
        />
      </Field>
      <Field label="Your email" htmlFor="reg-email" hint="Your key will be sent here.">
        <TextInput
          id="reg-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          maxLength={200}
          autoComplete="email"
        />
      </Field>
      <Field label="State" htmlFor="reg-state">
        <Select id="reg-state" value={state} onChange={(e) => setState(e.target.value)}>
          <option value="">Choose…</option>
          {STATES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Your role (optional)" htmlFor="reg-role" hint="For example, Business manager.">
        <TextInput
          id="reg-role"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          maxLength={100}
          autoComplete="organization-title"
        />
      </Field>
      <Field
        label="Notes (optional)"
        htmlFor="reg-notes"
        hint="Anything you'd like Dave to know, for example how your school plans to use Locker Manager."
      >
        <textarea
          id="reg-notes"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={1000}
          className={cn(inputClass, 'h-auto py-2.5 leading-relaxed')}
        />
      </Field>
      <label className="flex items-start gap-3 rounded-2xl bg-surface-muted p-4 text-sm">
        <input
          type="checkbox"
          data-testid="privacy-agree"
          className="mt-0.5 size-5 shrink-0 accent-[var(--color-brand)]"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
        />
        <span>{PRIVACY_NOTE}</span>
      </label>
      {problems.length > 0 && (
        <ul role="alert" className="space-y-1 text-sm font-semibold text-bad">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      {failed && (
        <div role="alert" className="rounded-2xl bg-bad-soft p-4 text-sm" data-testid="send-failed">
          <p className="font-semibold">{failed.message}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void openOtherWay(() => window.api.openRegistrationWebsite())}
            >
              Use the website form
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                void openOtherWay(() => window.api.openRegistrationEmail(failed.mailto))
              }
            >
              Send by email instead
            </Button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm font-semibold text-bad" data-testid="registration-error">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" data-testid="send-registration" disabled={busy}>
          {busy ? 'Sending…' : 'Send'}
        </Button>
      </div>
    </form>
  )
}
