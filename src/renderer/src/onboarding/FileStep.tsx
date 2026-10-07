import { FolderOpen } from 'lucide-react'
import { Banner } from '@renderer/components/Banner'
import { Button } from '@renderer/components/Button'
import { useFileState } from '@renderer/lib/useFileState'

/** SPEC.md 4.1 step 8: where the data file is, and why a shared folder matters. */
export function FileStep(): React.JSX.Element | null {
  const file = useFileState()
  if (file?.status !== 'open') return null
  return (
    <div className="space-y-6">
      <section className="card space-y-4 p-6" data-testid="setup-file">
        <h2 className="text-xl font-semibold">Your school’s file</h2>
        <div className="rounded-xl bg-surface-muted px-4 py-3">
          <p className="font-semibold">{file.fileName}</p>
          <p className="break-all text-sm text-ink-muted">{file.folder}</p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => void window.api.showInFolder()}>
          <FolderOpen size={16} aria-hidden /> Show it in its folder
        </Button>
        <div className="space-y-3 text-sm leading-relaxed">
          <p>
            <strong>Everyone opens this one file.</strong> Keep it in a folder every staff member
            who uses Locker Manager can reach, such as a shared OneDrive or SharePoint folder. Then
            they all see the same students, lockers and codes.
          </p>
          <p>
            Only one person can change the file at a time. Anyone else who opens it can look things
            up and print, and the app tells them who is editing.
          </p>
          <p>
            A backup is kept every time the file saves, in a folder beside it called{' '}
            <strong>Locker Manager backups</strong>. Leave that folder where it is.
          </p>
        </div>
      </section>
      {file.locationWarning && (
        <Banner tone="warn" title="This might not be a shared folder">
          {file.locationWarning}
        </Banner>
      )}
    </div>
  )
}
