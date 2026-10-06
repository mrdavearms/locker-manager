import { useState } from 'react'
import { FolderSync } from 'lucide-react'
import { Button } from './Button'
import { Modal } from './Modal'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreate: (schoolName: string) => Promise<string | null>
}

export function NewFileDialog({ open, onOpenChange, onCreate }: Props): React.JSX.Element {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Start a new school file"
      description="One file holds everything for your school: lockers, students, codes and history."
      testId="new-file-dialog"
    >
      <NewFileForm onCancel={() => onOpenChange(false)} onCreate={onCreate} />
    </Modal>
  )
}

function NewFileForm({
  onCancel,
  onCreate
}: {
  onCancel: () => void
  onCreate: Props['onCreate']
}): React.JSX.Element {
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const submit = async (): Promise<void> => {
    setBusy(true)
    setError(await onCreate(name.trim()))
    setBusy(false)
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <label htmlFor="school-name" className="block text-sm font-semibold">
        School name
      </label>
      <input
        id="school-name"
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={120}
        className="mt-2 h-12 w-full rounded-xl border border-line-strong bg-surface px-4 text-base"
        placeholder="For example, Riverside Secondary College"
      />
      <div className="mt-5 flex gap-3 rounded-2xl bg-brand-soft p-4 text-sm">
        <FolderSync size={22} className="mt-0.5 shrink-0 text-brand" aria-hidden />
        <p>
          <strong>Next you choose where to keep it.</strong> Pick your school’s shared folder
          (OneDrive, SharePoint, Google Drive or a network drive) so every staff member who uses
          Locker Manager opens the same file. Only one person can change it at a time; everyone else
          can still look things up and print.
        </p>
      </div>
      {error && (
        <p role="alert" className="mt-4 text-sm font-semibold text-bad">
          {error}
        </p>
      )}
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={name.trim().length === 0 || busy}>
          Choose where to save…
        </Button>
      </div>
    </form>
  )
}
