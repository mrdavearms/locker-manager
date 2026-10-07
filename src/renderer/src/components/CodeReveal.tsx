import { useEffect, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Button } from './Button'
import { useAction, useCanEdit, useLockedReason } from '@renderer/lib/appContext'
import { call, useRpc } from '@renderer/lib/rpc'
import { useCodeGate } from './PinGate'

/** The code as dial boxes. */
export function CodeBoxes({ code }: { code: string }): React.JSX.Element {
  const parts = code.includes('-') ? code.split('-') : code.split('')
  return (
    <span className="inline-flex gap-1.5" aria-label={`Code ${parts.join(' ')}`}>
      {parts.map((p, i) => (
        <span
          key={i}
          className="stencil flex h-12 min-w-10 items-center justify-center rounded-lg border-2 border-panel bg-surface px-2 text-3xl text-ink"
        >
          {p}
        </span>
      ))}
    </span>
  )
}

/**
 * Codes are hidden until asked for, every reveal is logged, and they hide again
 * after the school's chosen time, 30 seconds unless changed (SPEC.md 2.8, 4.11, 7).
 */
export function CodeReveal({ lockerId }: { lockerId: string }): React.JSX.Element {
  const act = useAction()
  const canEdit = useCanEdit()
  const gate = useCodeGate()
  const lockedReason = useLockedReason()
  const { data: privacy } = useRpc('privacy.get', {})
  const hideAfter = privacy?.autoHideSeconds ?? 30
  const [code, setCode] = useState<string | null>(null)
  const [left, setLeft] = useState(0)
  useEffect(() => {
    if (code === null) return
    const t = setInterval(() => {
      setLeft((n) => {
        if (n <= 1) {
          setCode(null)
          return 0
        }
        return n - 1
      })
    }, 1000)
    return () => clearInterval(t)
  }, [code])
  if (code !== null) {
    return (
      <div className="flex flex-wrap items-center gap-3" data-testid="code-shown">
        <CodeBoxes code={code} />
        <Button size="sm" variant="ghost" onClick={() => setCode(null)}>
          <EyeOff size={16} aria-hidden /> Hide ({left})
        </Button>
      </div>
    )
  }
  const button = (
    <Button
      size="sm"
      variant="secondary"
      disabled={!canEdit}
      title="Shows the code; this is recorded"
      onClick={() =>
        void act(async () => {
          if (!(await gate())) return
          const r = await call('codes.reveal', { lockerId })
          if (r.code === null) throw new Error('This lock has no code yet.')
          setCode(r.code)
          setLeft(hideAfter)
        })
      }
      data-testid="show-code"
    >
      <Eye size={16} aria-hidden /> Show code
    </Button>
  )
  if (canEdit) return button
  return (
    <div>
      {button}
      <p className="mt-1 text-xs text-ink-muted" data-testid="codes-locked-reason">
        {lockedReason}
      </p>
    </div>
  )
}
