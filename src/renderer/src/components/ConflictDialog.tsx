import { useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import type { ConflictView } from '@shared/fileState'
import { Button } from './Button'
import { Modal } from './Modal'
import { VersionCard } from './VersionCard'
import { describeAction, formatWhen } from '@renderer/lib/format'

interface Props {
  conflict: ConflictView
  canEdit: boolean
  /** Tells the operator how a merge went, after the dialog has closed. */
  onMerged: (title: string, body: string) => void
}

/**
 * SPEC.md 6.4. Shown when someone else saved over this file, when it vanished, or
 * when comparing with a sync copy. Whichever version is not kept becomes a backup.
 */
export function ConflictDialog({ conflict, canEdit, onMerged }: Props): React.JSX.Element {
  const [busy, setBusy] = useState(false)
  const addable = conflict.myChanges.filter((c) => c.canAdd)
  const [picked, setPicked] = useState<Set<number>>(() => new Set(addable.map((c) => c.index)))
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

      {!isCopy && conflict.theirs && conflict.myChanges.length > 0 && (
        <section className="mt-5 rounded-2xl border border-line p-4" data-testid="merge-changes">
          <h3 className="font-semibold">Or keep the other version and add my changes</h3>
          <p className="mt-1 text-sm text-ink-muted">
            Your changes since the last save, in order. Untick any you do not want. Each ticked
            change is made again on the other version; one that no longer fits (for example the
            locker is now taken) is skipped and you are told.
          </p>
          <ul className="mt-3 max-h-48 space-y-1.5 overflow-y-auto text-sm">
            {conflict.myChanges.map((c) => (
              <li key={c.index}>
                <label
                  className={
                    c.canAdd ? 'flex items-center gap-2' : 'flex items-center gap-2 text-ink-muted'
                  }
                >
                  <input
                    type="checkbox"
                    disabled={!c.canAdd}
                    checked={c.canAdd && picked.has(c.index)}
                    onChange={(e) => {
                      const next = new Set(picked)
                      if (e.target.checked) next.add(c.index)
                      else next.delete(c.index)
                      setPicked(next)
                    }}
                  />
                  {describeAction(c.action)}
                  <span className="text-xs text-ink-muted">{formatWhen(c.at)}</span>
                  {!c.canAdd && (
                    <span className="text-xs">(cannot be added; it is in the backup)</span>
                  )}
                </label>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex justify-end">
            <Button
              variant="secondary"
              disabled={busy || picked.size === 0}
              data-testid="merge-apply"
              onClick={() =>
                void run(async () => {
                  const r = await window.api.mergeConflict([...picked])
                  if (!r.ok) return r
                  onMerged(
                    r.skipped.length === 0
                      ? `${r.added} of your changes added`
                      : `${r.added} added, ${r.skipped.length} skipped`,
                    r.skipped.length === 0
                      ? 'The other version is now open, with your changes added. Your whole version is kept as a backup.'
                      : `These did not fit the other version and were skipped: ${r.skipped
                          .map(
                            (x) => `${describeAction(x.action)} (${x.message.replace(/\.$/, '')})`
                          )
                          .join('; ')}. Your whole version is kept as a backup.`
                  )
                  return { ok: true }
                })
              }
            >
              Use the other version and add the ticked changes
            </Button>
          </div>
        </section>
      )}

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
