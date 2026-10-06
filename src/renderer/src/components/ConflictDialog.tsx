import { useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import type { ConflictView } from '@shared/fileState'
import { Button } from './Button'
import { Modal } from './Modal'
import { VersionCard } from './VersionCard'

interface Props {
  conflict: ConflictView
  canEdit: boolean
}

/**
 * SPEC.md 6.4. Shown when someone else saved over this file, when it vanished, or
 * when comparing with a sync copy. Whichever version is not kept becomes a backup.
 */
export function ConflictDialog({ conflict, canEdit }: Props): React.JSX.Element {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isCopy = conflict.reason === 'copy'
  const copyName = conflict.copyName ?? ''

  const run = async (fn: () => Promise<{ ok: boolean; message?: string }>): Promise<void> => {
    setBusy(true)
    setError(null)
    const r = await fn()
    setBusy(false)
    if (!r.ok && r.message) setError(r.message)
  }

  const title = isCopy
    ? 'Compare with a copy'
    : conflict.reason === 'missing'
      ? 'The data file has disappeared'
      : 'Someone else changed this file'
  const description = isCopy
    ? `Your sync service made a copy called “${copyName}”. Here is how it differs from the file you have open.`
    : conflict.reason === 'missing'
      ? 'The file was moved, renamed or deleted while you were working. Your version is safe here.'
      : 'While you were working, another version was saved over the file. Nothing has been lost. Choose which version to keep.'

  return (
    <Modal
      open
      onOpenChange={() => isCopy && void window.api.closeComparison()}
      dismissable={isCopy}
      width="xl"
      title={title}
      description={description}
      testId="conflict-dialog"
    >
      <div className="grid gap-4 md:grid-cols-2">
        <VersionCard
          tone="brand"
          subheading={isCopy ? 'The file you have open' : 'This computer'}
          heading={isCopy ? 'Current file' : 'Your version'}
          summary={conflict.mine}
          onlyHere={conflict.onlyMine}
          onlyHereLabel={isCopy ? 'Done only in the current file' : 'Done only here'}
        />
        <VersionCard
          tone="accent"
          subheading={isCopy ? copyName : 'On disk now'}
          heading={
            isCopy ? 'The copy' : conflict.reason === 'missing' ? 'No file' : 'The other version'
          }
          summary={conflict.theirs}
          onlyHere={conflict.onlyTheirs}
          onlyHereLabel={isCopy ? 'Done only in the copy' : 'Done only in the other version'}
        />
      </div>

      <div className="mt-5 flex gap-3 rounded-2xl bg-good-soft p-4 text-sm">
        <ShieldCheck size={22} className="mt-0.5 shrink-0 text-good" aria-hidden />
        <p>
          Whichever you choose, the other version is kept in the “Locker Manager backups” folder
          beside the file. Nothing is thrown away.
        </p>
      </div>

      {error && (
        <p role="alert" className="mt-4 text-sm font-semibold text-bad">
          {error}
        </p>
      )}
      {!canEdit && isCopy && (
        <p className="mt-4 text-sm text-ink-muted">
          Only the person editing the file can sort out copies.
        </p>
      )}

      <div className="mt-6 flex flex-wrap justify-end gap-2">
        {isCopy ? (
          <>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => void run(() => window.api.resolveCopy(copyName, 'ignore'))}
            >
              This is not a copy
            </Button>
            <Button
              variant="secondary"
              disabled={busy || !canEdit}
              onClick={() => void run(() => window.api.resolveCopy(copyName, 'use_copy'))}
            >
              Use the copy instead
            </Button>
            <Button
              disabled={busy || !canEdit}
              onClick={() => void run(() => window.api.resolveCopy(copyName, 'keep_current'))}
            >
              Keep the current file
            </Button>
          </>
        ) : (
          <>
            {conflict.theirs && (
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => void run(() => window.api.resolveConflict('keep_theirs'))}
              >
                Keep the other version
              </Button>
            )}
            <Button
              disabled={busy}
              onClick={() => void run(() => window.api.resolveConflict('keep_mine'))}
            >
              {conflict.reason === 'missing' ? 'Save my version back' : 'Keep my version'}
            </Button>
          </>
        )}
      </div>
    </Modal>
  )
}
