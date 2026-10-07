import { useState } from 'react'
import { Ban } from 'lucide-react'
import type { GroupView } from '@shared/students'
import { SectionCard, TextInput } from '@renderer/components/Field'
import { useAction, useCanEdit, useTerms } from '@renderer/lib/appContext'
import { call, useRpc } from '@renderer/lib/rpc'

function GroupRow({ g }: { g: GroupView }): React.JSX.Element {
  const terms = useTerms()
  const act = useAction()
  const canEdit = useCanEdit()
  const [display, setDisplay] = useState(g.display === g.code ? '' : g.display)
  const saved = g.display === g.code ? '' : g.display
  return (
    <tr className="border-t border-line">
      <td className="py-2 pr-4 font-mono text-sm">{g.code}</td>
      <td className="py-2 pr-4">
        <TextInput
          aria-label={`Display name for ${g.code}`}
          className="h-9 max-w-[10rem]"
          disabled={!canEdit}
          value={display}
          maxLength={40}
          placeholder={g.code}
          onChange={(e) => setDisplay(e.target.value)}
          onBlur={() => {
            if (display.trim() === saved) return
            void act(() =>
              call('group.setDisplay', { code: g.code, display: display.trim() || null })
            )
          }}
        />
      </td>
      <td className="py-2 pr-4">
        <input
          type="checkbox"
          className="size-5 accent-[var(--color-brand)]"
          aria-label={`Place ${g.display} last`}
          disabled={!canEdit}
          checked={g.sortLast}
          onChange={(e) =>
            void act(() => call('group.setSortLast', { code: g.code, sortLast: e.target.checked }))
          }
        />
      </td>
      <td className="py-2 pr-4 tabular-nums">{g.students}</td>
      <td className="py-2 text-sm text-warn">
        {g.excluded && (
          <span className="flex items-center gap-1.5">
            <Ban size={14} aria-hidden /> Never gets a {terms.locker.one.toLowerCase()}
          </span>
        )}
      </td>
    </tr>
  )
}

/** How each group code shows, and which groups are placed last (SPEC.md 4.4). */
export function GroupsForm(): React.JSX.Element {
  const terms = useTerms()
  const { data: groups } = useRpc('groups.list', {})
  const groupWord = terms.group.one.toLowerCase()
  return (
    <SectionCard
      title={`${terms.yearLevel.many} and ${terms.group.many.toLowerCase()}`}
      description={`How each ${groupWord} code from your student system shows on screen, labels and letters, and which ${terms.group.many.toLowerCase()} are placed last when ${terms.locker.many.toLowerCase()} are given out.`}
    >
      {!groups ? (
        <p className="text-sm text-ink-muted">Loading…</p>
      ) : groups.length === 0 ? (
        <p className="text-sm text-ink-muted">
          No {terms.group.many.toLowerCase()} yet. They appear after your first import.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm" data-testid="groups-table">
            <thead>
              <tr className="text-xs font-bold uppercase tracking-wider text-ink-muted">
                <th className="pb-2 pr-4">Code</th>
                <th className="pb-2 pr-4">Shows as</th>
                <th className="pb-2 pr-4">Placed last</th>
                <th className="pb-2 pr-4">Students</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <GroupRow key={`${g.code}-${g.display}-${g.sortLast}`} g={g} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  )
}
