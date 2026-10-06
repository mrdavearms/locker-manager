import { useEffect, useState } from 'react'
import { ArchiveRestore, Cloud, HardDrive } from 'lucide-react'
import type { BackupPreview, BackupView } from '@shared/fileState'
import { cn } from '@renderer/lib/cn'
import { describeAction, formatBytes, formatWhen, plural } from '@renderer/lib/format'
import { Button } from './Button'
import { Modal } from './Modal'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  canEdit: boolean
}

/** SPEC.md 4.12: pick a dated backup, see what differs, restore it as the current file. */
export function BackupsDialog({ open, onOpenChange, canEdit }: Props): React.JSX.Element {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      width="xl"
      title="Backups"
      description="Every save keeps the version it replaced, in the shared folder and on this computer. Choose one to see how it differs."
      testId="backups-dialog"
    >
      <BackupsBody canEdit={canEdit} onRestored={() => onOpenChange(false)} />
    </Modal>
  )
}

/** Mounted fresh each time the dialog opens, so the list is always current. */
function BackupsBody({
  canEdit,
  onRestored
}: {
  canEdit: boolean
  onRestored: () => void
}): React.JSX.Element {
  const [list, setList] = useState<BackupView[] | null>(null)
  const [selected, setSelected] = useState<BackupView | null>(null)
  const [preview, setPreview] = useState<BackupPreview | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    void window.api.listBackups().then((l) => {
      if (!cancelled) setList(l)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const choose = async (b: BackupView): Promise<void> => {
    setSelected(b)
    setPreview(null)
    setConfirming(false)
    setMessage(null)
    const p = await window.api.previewBackup({ source: b.source, name: b.name })
    if ('error' in p) setMessage(p.error)
    else setPreview(p)
  }

  const restore = async (): Promise<void> => {
    if (!selected) return
    setBusy(true)
    const r = await window.api.restoreBackup({ source: selected.source, name: selected.name })
    setBusy(false)
    if (r.ok) onRestored()
    else setMessage(r.message)
  }

  return (
    <>
      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="max-h-[46vh] overflow-y-auto rounded-2xl border border-line">
          {list === null && <p className="p-4 text-sm text-ink-muted">Looking for backups…</p>}
          {list?.length === 0 && (
            <p className="p-4 text-sm text-ink-muted">
              No backups yet. One is made the first time a change is saved.
            </p>
          )}
          <ul>
            {list?.map((b) => (
              <li key={`${b.source}/${b.name}`}>
                <button
                  type="button"
                  onClick={() => void choose(b)}
                  className={cn(
                    'flex w-full items-center gap-3 border-b border-line px-4 py-3 text-left last:border-b-0 hover:bg-surface-muted',
                    selected?.name === b.name && selected.source === b.source && 'bg-brand-soft'
                  )}
                >
                  {b.source === 'shared' ? (
                    <Cloud size={18} className="shrink-0 text-brand" aria-label="Shared folder" />
                  ) : (
                    <HardDrive
                      size={18}
                      className="shrink-0 text-ink-muted"
                      aria-label="This computer"
                    />
                  )}
                  <span className="flex-1">
                    <span className="block font-semibold">{formatWhen(b.at)}</span>
                    <span className="block text-xs text-ink-muted">
                      {b.label ?? (b.source === 'shared' ? 'Shared folder' : 'This computer')} ·{' '}
                      {formatBytes(b.size)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl bg-surface-muted p-5">
          {!selected && <p className="text-sm text-ink-muted">Choose a backup on the left.</p>}
          {selected && !preview && !message && (
            <p className="text-sm text-ink-muted">Reading the backup…</p>
          )}
          {preview && (
            <div data-testid="backup-preview">
              <h3 className="text-lg font-semibold">Backup from {formatWhen(preview.backup.at)}</h3>
              <p className="mt-1 text-sm text-ink-muted">
                {preview.backupSummary.schoolName} ·{' '}
                {plural(preview.backupSummary.counts.students, 'student')} ·{' '}
                {plural(preview.backupSummary.counts.lockers, 'locker')}
              </p>
              <h4 className="mt-4 text-sm font-semibold">
                Restoring it undoes {plural(preview.undone.length, 'change')}:
              </h4>
              <ul className="mt-2 space-y-1 text-sm">
                {preview.undone.slice(0, 8).map((h) => (
                  <li key={h.id}>
                    <span className="text-ink-muted tabular-nums">{formatWhen(h.at)}</span>{' '}
                    {describeAction(h.action)} ({h.operator})
                  </li>
                ))}
                {preview.undone.length > 8 && (
                  <li className="text-ink-muted">and {preview.undone.length - 8} more</li>
                )}
              </ul>
              <p className="mt-4 text-sm text-ink-muted">
                The current version is kept as a backup first, so you can come back to it.
              </p>
              {!canEdit && (
                <p className="mt-2 text-sm font-semibold">
                  Only the person editing the file can restore a backup.
                </p>
              )}
              <div className="mt-5 flex justify-end gap-2">
                {confirming ? (
                  <>
                    <Button variant="secondary" onClick={() => setConfirming(false)}>
                      Cancel
                    </Button>
                    <Button variant="accent" disabled={busy} onClick={() => void restore()}>
                      <ArchiveRestore size={18} aria-hidden /> Yes, restore it
                    </Button>
                  </>
                ) : (
                  <Button disabled={!canEdit} onClick={() => setConfirming(true)}>
                    Restore this backup…
                  </Button>
                )}
              </div>
            </div>
          )}
          {message && (
            <p role="alert" className="mt-3 text-sm font-semibold text-bad">
              {message}
            </p>
          )}
        </div>
      </div>
    </>
  )
}
