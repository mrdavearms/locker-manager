import { useState } from 'react'
import { Redo2, Search, Undo2 } from 'lucide-react'
import type { RecordRestorePreview } from '@shared/history'
import { Button } from '@renderer/components/Button'
import { Modal } from '@renderer/components/Modal'
import { useAction } from '@renderer/lib/appContext'
import { describeAction, formatWhen } from '@renderer/lib/format'
import { useRpc } from '@renderer/lib/rpc'
import type { OpenFileState } from '@renderer/lib/useFileState'

/** SPEC.md 4.12: who changed what and when. Append-only: nothing here can be edited. */
export function HistoryScreen({ state }: { state: OpenFileState }): React.JSX.Element {
  const act = useAction()
  const [search, setSearch] = useState('')
  const [limit, setLimit] = useState(200)
  const [restore, setRestore] = useState<{
    entryId: string
    label: string
    preview: RecordRestorePreview
  } | null>(null)
  const { data: entries } = useRpc('history.list', { limit, ...(search.trim() ? { search } : {}) })
  const run = (fn: () => Promise<{ ok: boolean; message?: string }>): Promise<unknown> =>
    act(async () => {
      const r = await fn()
      if (!r.ok && r.message) throw new Error(r.message)
    })
  return (
    <div className="w-full space-y-6 px-6 py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">History</h1>
          <p className="mt-1 text-ink-muted">
            Every change, who made it, on which computer, and when. It cannot be edited or deleted.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            disabled={!state.undo.canUndo}
            onClick={() => void run(() => window.api.undo())}
            data-testid="undo"
          >
            <Undo2 size={17} aria-hidden /> Undo{' '}
            {state.undo.undoAction ? describeAction(state.undo.undoAction).toLowerCase() : ''}
          </Button>
          <Button
            variant="secondary"
            disabled={!state.undo.canRedo}
            onClick={() => void run(() => window.api.redo())}
            data-testid="redo"
          >
            <Redo2 size={17} aria-hidden /> Redo
          </Button>
        </div>
      </header>
      <label className="relative block max-w-md">
        <span className="sr-only">Search the history</span>
        <Search
          size={17}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted"
          aria-hidden
        />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="A name, a person, a locker number…"
          className="h-11 w-full rounded-xl border border-line-strong bg-surface pl-9 pr-3"
        />
      </label>
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-muted text-left text-ink-muted">
            <tr>
              <th className="px-4 py-2.5 font-semibold">When</th>
              <th className="px-4 py-2.5 font-semibold">What</th>
              <th className="px-4 py-2.5 font-semibold">About</th>
              <th className="px-4 py-2.5 font-semibold">Who</th>
            </tr>
          </thead>
          <tbody data-testid="history-rows">
            {entries?.map((e) => (
              <tr key={e.id} className="border-t border-line align-top">
                <td className="whitespace-nowrap px-4 py-2 tabular-nums text-ink-muted">
                  {formatWhen(e.at)}
                </td>
                <td className="px-4 py-2">
                  {describeAction(e.action)}
                  {e.reason && <span className="block text-ink-muted">{e.reason}</span>}
                </td>
                <td className="px-4 py-2">
                  {e.detail ?? ''}
                  {(e.entity === 'student' || e.entity === 'locker') &&
                    e.entityId &&
                    e.action !== 'record.restored' &&
                    state.mode === 'edit' && (
                      <button
                        className="mt-0.5 block text-xs font-semibold text-brand hover:underline"
                        onClick={() =>
                          void act(async () => {
                            const r = await window.api.previewRecordRestore(e.id)
                            if (!r.ok) throw new Error(r.message)
                            setRestore({ entryId: e.id, label: e.detail ?? '', preview: r.value })
                          })
                        }
                      >
                        Put back to before this…
                      </button>
                    )}
                </td>
                <td className="px-4 py-2">
                  {e.operator}
                  <span className="block text-xs text-ink-muted">{e.machine}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {entries && entries.length >= limit && (
          <div className="border-t border-line p-3 text-center">
            <Button variant="ghost" onClick={() => setLimit(limit + 200)}>
              Show more
            </Button>
          </div>
        )}
      </div>
      <Modal
        open={restore !== null}
        onOpenChange={(o) => !o && setRestore(null)}
        title={`Put back ${restore?.label || 'this record'}?`}
        description={
          restore
            ? `As it was in the backup from ${formatWhen(restore.preview.backupAt)}, before this change. Only its own details change; lockers, codes and history stay as they are. You can undo it.`
            : ''
        }
        testId="restore-record"
      >
        {restore && restore.preview.changes.length === 0 ? (
          <p>It is already the same as before this change. Nothing to put back.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-ink-muted">
              <tr>
                <th className="py-1 font-semibold">Detail</th>
                <th className="py-1 font-semibold">Now</th>
                <th className="py-1 font-semibold">Back to</th>
              </tr>
            </thead>
            <tbody>
              {restore?.preview.changes.map((c) => (
                <tr key={c.field} className="border-t border-line">
                  <td className="py-1.5">{c.field}</td>
                  <td className="py-1.5 text-ink-muted">{c.now}</td>
                  <td className="py-1.5 font-semibold">{c.before}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setRestore(null)}>
            Cancel
          </Button>
          <Button
            disabled={!restore || restore.preview.changes.length === 0}
            data-testid="restore-record-apply"
            onClick={() =>
              void act(async () => {
                if (!restore) return
                const r = await window.api.restoreRecord(restore.entryId)
                if (!r.ok) throw new Error(r.message)
                setRestore(null)
              })
            }
          >
            Put it back
          </Button>
        </div>
      </Modal>
    </div>
  )
}
