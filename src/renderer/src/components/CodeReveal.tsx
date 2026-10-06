import { useEffect, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Button } from './Button'
import { useAction, useCanEdit } from '@renderer/lib/appContext'
import { call } from '@renderer/lib/rpc'

const HIDE_AFTER_S = 30

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
 * after 30 seconds (SPEC.md 2.8 and 4.11).
 */
export function CodeReveal({ lockerId }: { lockerId: string }): React.JSX.Element {
  const act = useAction()
  const canEdit = useCanEdit()
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
  return (
    <Button
      size="sm"
      variant="secondary"
      disabled={!canEdit}
      title={
        canEdit ? 'Shows the code; this is recorded' : 'Only the person editing can show codes'
      }
      onClick={() =>
        void act(async () => {
          const r = await call('codes.reveal', { lockerId })
          if (r.code === null) throw new Error('This lock has no code yet.')
          setCode(r.code)
          setLeft(HIDE_AFTER_S)
        })
      }
      data-testid="show-code"
    >
      <Eye size={16} aria-hidden /> Show code
    </Button>
  )
}
