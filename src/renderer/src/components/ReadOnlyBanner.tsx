import { useState } from 'react'
import { Banner } from '@renderer/components/Banner'
import { Button } from '@renderer/components/Button'
import { formatWhen } from '@renderer/lib/format'
import type { OpenFileState } from '@renderer/lib/useFileState'

interface Props {
  state: OpenFileState
  onError: (message: string) => void
}

export function ReadOnlyBanner({ state, onError }: Props): React.JSX.Element | null {
  const ro = state.readOnly
  const [busy, setBusy] = useState(false)
  if (!ro) return null
  const holder = ro.holder
  const act = async (fn: () => Promise<{ ok: boolean; message?: string }>): Promise<void> => {
    setBusy(true)
    const r = await fn()
    setBusy(false)
    if (!r.ok && r.message) onError(r.message)
  }
  if (ro.reason === 'newer_version') {
    return (
      <Banner
        tone="warn"
        title="This file was saved by a newer version of Locker Manager"
        testId="read-only-banner"
      >
        You can look things up and print lists, but not change anything, show codes or print
        letters. Update Locker Manager (Help, Check for updates) to edit it.
      </Banner>
    )
  }
  const who = holder ? `${holder.operator} on ${holder.computer}` : 'someone else'
  const title =
    ro.reason === 'lost_lock'
      ? `${who} has taken over editing`
      : ro.canStartEditing
        ? `${holder?.operator ?? 'The other editor'} has finished`
        : `Being edited by ${who}${holder ? ` since ${formatWhen(holder.startedAt)}` : ''}`
  return (
    <Banner
      tone="locked"
      title={title}
      testId="read-only-banner"
      actions={
        ro.canStartEditing ? (
          <Button disabled={busy} onClick={() => void act(() => window.api.startEditing())}>
            Start editing
          </Button>
        ) : ro.canTakeOver ? (
          <Button
            variant="accent"
            disabled={busy}
            onClick={() => void act(() => window.api.takeOver())}
          >
            Take over editing
          </Button>
        ) : undefined
      }
    >
      {ro.canStartEditing ? (
        'You can start editing now.'
      ) : ro.canTakeOver ? (
        <>
          Their computer has not been heard from since {formatWhen(holder?.heartbeatAt)}. If you are
          sure they are not working on it, you can take over. Anything they had not saved stays on
          their computer as a backup.
        </>
      ) : ro.reason === 'lost_lock' ? (
        'You can still look things up and print lists, but not show codes or print letters. Anything you had not saved was kept as a backup.'
      ) : (
        'You can look things up and print lists, but not change anything, show codes or print letters. Every code shown is recorded, and only the editing computer can record it. This updates by itself when they save.'
      )}
    </Banner>
  )
}
