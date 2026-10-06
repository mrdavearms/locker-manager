import { useState } from 'react'
import type { OperatorInfo } from '@shared/ipc'
import { Button } from './Button'
import { Modal } from './Modal'

interface Props {
  open: boolean
  info: OperatorInfo | null
  /** First use: the operator must confirm before doing anything else. */
  required: boolean
  onDone: () => void
}

/** "This is me" (SPEC.md 8.7): the name that goes into the history and the edit lock. */
export function OperatorDialog({ open, info, required, onDone }: Props): React.JSX.Element {
  return (
    <Modal
      open={open}
      onOpenChange={(o) => !o && onDone()}
      dismissable={!required}
      title={required ? 'Who is using this computer?' : 'Change your name'}
      description="Your name goes in the history next to every change you make, and tells others when you are editing."
      testId="operator-dialog"
    >
      <OperatorForm info={info} onDone={onDone} />
    </Modal>
  )
}

/** Mounted fresh each time the dialog opens, so it always starts from the saved name. */
function OperatorForm({
  info,
  onDone
}: {
  info: OperatorInfo | null
  onDone: () => void
}): React.JSX.Element {
  const [name, setName] = useState(info?.name ?? info?.suggested ?? '')
  const save = async (): Promise<void> => {
    if (name.trim().length === 0) return
    await window.api.setOperator(name.trim())
    onDone()
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <label htmlFor="operator-name" className="block text-sm font-semibold">
        Your name
      </label>
      <input
        id="operator-name"
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={80}
        className="mt-2 h-12 w-full rounded-xl border border-line-strong bg-surface px-4 text-base focus:border-brand"
        placeholder="For example, Hannah Lee"
      />
      <p className="mt-2 text-sm text-ink-muted">
        This computer is called <strong className="text-ink">{info?.machine ?? '…'}</strong>. Others
        will see “{name.trim() || 'your name'} on {info?.machine ?? 'this computer'}”.
      </p>
      <div className="mt-6 flex justify-end">
        <Button type="submit" size="lg" disabled={name.trim().length === 0}>
          This is me
        </Button>
      </div>
    </form>
  )
}
