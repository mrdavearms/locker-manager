import { useEffect, useState } from 'react'
import { FolderOpen, Lock } from 'lucide-react'
import { DEFAULT_BACKUP_RULES, type BackupRules, type StorageView } from '@shared/storage'
import { Button } from '@renderer/components/Button'
import { Field, SectionCard, TextInput } from '@renderer/components/Field'
import { useAction, useCanEdit, useRevision } from '@renderer/lib/appContext'
import { call } from '@renderer/lib/rpc'

const LIMITS: Record<keyof BackupRules, [number, number]> = {
  keepAllDays: [1, 90],
  dailyDays: [7, 730],
  maxMb: [50, 5000]
}

/** SPEC.md 7 item 13: where the file and its backups are, and how long backups stay. */
export function StorageForm(): React.JSX.Element {
  const act = useAction()
  const canEdit = useCanEdit()
  const revision = useRevision()
  const [view, setView] = useState<StorageView | null>(null)
  const [draft, setDraft] = useState<BackupRules | null>(null)
  useEffect(() => {
    let cancelled = false
    void window.api.storage().then((v) => !cancelled && setView(v))
    return () => {
      cancelled = true
    }
  }, [revision])
  if (!view) return <SectionCard title="Storage">Loading…</SectionCard>
  const r = draft ?? view.rules
  const valid = (Object.keys(LIMITS) as (keyof BackupRules)[]).every(
    (k) => Number.isInteger(r[k]) && r[k] >= LIMITS[k][0] && r[k] <= LIMITS[k][1]
  )
  const field = (k: keyof BackupRules, label: string, hint: string): React.JSX.Element => (
    <Field label={label} hint={hint} htmlFor={`st-${k}`}>
      <TextInput
        id={`st-${k}`}
        inputMode="numeric"
        disabled={!canEdit}
        value={String(r[k])}
        onChange={(e) => setDraft({ ...r, [k]: Number(e.target.value.replace(/\D/g, '')) || 0 })}
      />
    </Field>
  )
  return (
    <div className="space-y-6">
      <SectionCard
        title="The data file"
        description="Everyone who uses Locker Manager opens this one file. To move it, close it on every computer, move it with File Explorer or Finder (with its Locker Manager backups folder), then open it from the new place."
      >
        <p
          className="break-all rounded-xl bg-surface-muted px-3 py-2 font-mono text-sm"
          data-testid="storage-path"
        >
          {view.path}
        </p>
        <div className="mt-3">
          <Button variant="secondary" onClick={() => void window.api.showInFolder()}>
            <FolderOpen size={16} aria-hidden /> Show in folder
          </Button>
        </div>
      </SectionCard>

      <SectionCard
        title="Backups"
        description="A backup is kept every time the file is saved: one in the Locker Manager backups folder beside the file, and one on this computer. Older backups are thinned out by these rules. Backups you name (for example before starting next year) are always kept."
      >
        <table className="mb-5 text-sm">
          <tbody>
            <tr>
              <td className="pr-6 py-1">Beside the file</td>
              <td className="tabular-nums">
                {view.backups.shared} backups, {view.backups.sharedMb} MB
              </td>
            </tr>
            <tr>
              <td className="pr-6 py-1">On this computer</td>
              <td className="tabular-nums">
                {view.backups.thisComputer} backups, {view.backups.thisComputerMb} MB
              </td>
            </tr>
          </tbody>
        </table>
        <div className="grid gap-4 md:grid-cols-3">
          {field('keepAllDays', 'Keep every backup for (days)', '1 to 90. Usually 7.')}
          {field(
            'dailyDays',
            'Then one a day until (days old)',
            '7 to 730. After that, one a week.'
          )}
          {field('maxMb', 'Keep the backups folder under (MB)', '50 to 5000. Usually 500.')}
        </div>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          {JSON.stringify(r) !== JSON.stringify(DEFAULT_BACKUP_RULES) && (
            <Button
              variant="ghost"
              disabled={!canEdit}
              onClick={() => setDraft(DEFAULT_BACKUP_RULES)}
            >
              Back to the usual rules
            </Button>
          )}
          {draft && (
            <>
              <Button variant="secondary" onClick={() => setDraft(null)}>
                Undo
              </Button>
              <Button
                disabled={!canEdit || !valid}
                data-testid="storage-save"
                onClick={() =>
                  void act(async () => {
                    await call('storage.rules.set', { rules: draft })
                    setDraft(null)
                  })
                }
              >
                Save backup rules
              </Button>
            </>
          )}
        </div>
      </SectionCard>

      <SectionCard
        title="One person editing at a time"
        description="While someone edits, their computer marks the file as in use and checks in regularly. These timings are the same on every computer and cannot be changed: if two computers used different timings, one could wrongly decide the other had stopped."
      >
        <ul className="space-y-1.5 text-sm">
          <li className="flex items-center gap-2">
            <Lock size={15} className="text-ink-muted" aria-hidden /> Checks in every{' '}
            {view.heartbeatSeconds} seconds.
          </li>
          <li className="flex items-center gap-2">
            <Lock size={15} className="text-ink-muted" aria-hidden /> Treated as stopped after{' '}
            {view.staleMinutes} minutes without checking in (for example after a crash), so someone
            else can take over.
          </li>
        </ul>
      </SectionCard>
    </div>
  )
}
