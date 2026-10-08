import { useEffect, useState } from 'react'
import { FolderOpen, Lock } from 'lucide-react'
import {
  DEFAULT_BACKUP_RULES,
  type BackupReachView,
  type FullBackupRules,
  type StorageView
} from '@shared/storage'
import { Banner } from '@renderer/components/Banner'
import { Button } from '@renderer/components/Button'
import { Field, SectionCard, TextInput } from '@renderer/components/Field'
import { useAction, useCanEdit, useRevision } from '@renderer/lib/appContext'
import { formatDateTime } from '@renderer/lib/format'
import { call } from '@renderer/lib/rpc'

const LIMITS: Record<keyof FullBackupRules, [number, number]> = {
  keepAllDays: [1, 90],
  hourlyDays: [1, 90],
  dailyDays: [7, 730],
  maxMb: [50, 5000]
}

/** SPEC.md 7 item 13: where the file and its backups are, and how long backups stay. */
export function StorageForm(): React.JSX.Element {
  const act = useAction()
  const canEdit = useCanEdit()
  const revision = useRevision()
  const [view, setView] = useState<StorageView | null>(null)
  const [draft, setDraft] = useState<FullBackupRules | null>(null)
  useEffect(() => {
    let cancelled = false
    void window.api.storage().then((v) => !cancelled && setView(v))
    return () => {
      cancelled = true
    }
  }, [revision])
  if (!view) return <SectionCard title="Storage">Loading…</SectionCard>
  const r = draft ?? view.rules
  const valid =
    (Object.keys(LIMITS) as (keyof FullBackupRules)[]).every(
      (k) => Number.isInteger(r[k]) && r[k] >= LIMITS[k][0] && r[k] <= LIMITS[k][1]
    ) &&
    r.keepAllDays <= r.hourlyDays &&
    r.hourlyDays <= r.dailyDays
  const usual = (Object.keys(LIMITS) as (keyof FullBackupRules)[]).every(
    (k) => r[k] === DEFAULT_BACKUP_RULES[k]
  )
  const reachText = (x: BackupReachView): string =>
    x.oldest ? `back to ${formatDateTime(x.oldest)}` : 'none yet'
  const short = [
    ...(view.reach.shared.short ? ['beside the file'] : []),
    ...(view.reach.thisComputer.short ? ['on this computer'] : [])
  ]
  const field = (k: keyof FullBackupRules, label: string, hint: string): React.JSX.Element => (
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
        description="A backup is kept every time the file is saved: one in the Locker Manager backups folder beside the file, and one on this computer. Backups are compressed to about a third of the file's size, so they open through Backups in Locker Manager, not by double-clicking them. Older backups are thinned out by these rules. Backups you name (for example before starting next year) are the last to go if a folder runs out of room."
      >
        {short.length > 0 && (
          <div className="mb-5">
            <Banner
              tone="warn"
              title={`Backups do not reach back ${view.rules.dailyDays} days`}
              testId="storage-short"
            >
              The backups folder {short.join(' and the one ')} has reached its limit of{' '}
              {view.rules.maxMb} MB, so older backups have been deleted sooner than these rules
              promise. To keep backups for longer, raise &ldquo;Keep the backups folder under&rdquo;
              below if the drive has room, or move the data file (with its Locker Manager backups
              folder) to a folder with more space.
            </Banner>
          </div>
        )}
        <table className="mb-5 text-sm">
          <tbody>
            <tr>
              <td className="pr-6 py-1">Beside the file</td>
              <td className="tabular-nums">
                {view.backups.shared} backups, {view.backups.sharedMb} MB
              </td>
              <td className="pl-6 tabular-nums" data-testid="storage-reach-shared">
                {reachText(view.reach.shared)}
              </td>
            </tr>
            <tr>
              <td className="pr-6 py-1">On this computer</td>
              <td className="tabular-nums">
                {view.backups.thisComputer} backups, {view.backups.thisComputerMb} MB
              </td>
              <td className="pl-6 tabular-nums">{reachText(view.reach.thisComputer)}</td>
            </tr>
          </tbody>
        </table>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {field('keepAllDays', 'Keep every backup for (days)', '1 to 90. Usually 1.')}
          {field('hourlyDays', 'Then one an hour until (days old)', '1 to 90. Usually 7.')}
          {field(
            'dailyDays',
            'Then one a day until (days old)',
            '7 to 730. Usually 99. After that, one a week while there is room.'
          )}
          {field('maxMb', 'Keep the backups folder under (MB)', '50 to 5000. Usually 500.')}
        </div>
        {draft && !valid && (
          <p className="mt-3 text-sm text-bad">
            Use whole numbers within the ranges shown, with each number of days at least as large as
            the one before it.
          </p>
        )}
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          {!usual && (
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
