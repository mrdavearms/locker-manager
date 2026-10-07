import { useEffect } from 'react'
import { CheckCircle2, Undo2, X } from 'lucide-react'
import { Button } from './Button'

export interface Message {
  text: string
  undo: boolean
  n: number
}

/**
 * Says what the last change did, for eight seconds, with Undo next to it. One
 * polite live region, so screen readers hear every confirmation (SPEC.md 10).
 */
export function MessageStrip({
  message,
  onUndo,
  onClose
}: {
  message: Message | null
  onUndo: () => void
  onClose: () => void
}): React.JSX.Element {
  useEffect(() => {
    if (!message) return
    const t = setTimeout(onClose, 8000)
    return () => clearTimeout(t)
  }, [message, onClose])
  return (
    <div
      aria-live="polite"
      role="status"
      className="pointer-events-none fixed inset-x-0 bottom-16 z-40 flex justify-center px-4"
    >
      {message && (
        <div
          key={message.n}
          data-testid="message-strip"
          className="pointer-events-auto flex items-center gap-3 rounded-2xl bg-panel px-4 py-2.5 text-sm text-on-panel shadow-[var(--shadow-card)] animate-rise"
        >
          <CheckCircle2 size={18} aria-hidden />
          <span>{message.text}</span>
          {message.undo && (
            <Button size="sm" variant="secondary" onClick={onUndo} data-testid="message-undo">
              <Undo2 size={15} aria-hidden /> Undo
            </Button>
          )}
          <button
            aria-label="Close message"
            className="rounded p-1 hover:bg-white/10"
            onClick={onClose}
          >
            <X size={16} aria-hidden />
          </button>
        </div>
      )}
    </div>
  )
}
