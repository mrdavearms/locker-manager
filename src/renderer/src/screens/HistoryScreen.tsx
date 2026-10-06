import { useState } from 'react'
import { Redo2, Search, Undo2 } from 'lucide-react'
import { Button } from '@renderer/components/Button'
import { useAction } from '@renderer/lib/appContext'
import { describeAction, formatWhen } from '@renderer/lib/format'
import { useRpc } from '@renderer/lib/rpc'
import type { OpenFileState } from '@renderer/lib/useFileState'

/** SPEC.md 4.12: who changed what and when. Append-only: nothing here can be edited. */
export function HistoryScreen({ state }: { state: OpenFileState }): React.JSX.Element {
  const act = useAction()
  const [search, setSearch] = useState('')
  const [limit, setLimit] = useState(200)
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
                <td className="px-4 py-2">{e.detail ?? ''}</td>
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
    </div>
  )
}
