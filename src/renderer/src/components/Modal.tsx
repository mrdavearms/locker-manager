import type { ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@renderer/lib/cn'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  children: ReactNode
  /** When false the dialog cannot be dismissed with Escape, a click outside, or a close button. */
  dismissable?: boolean
  width?: 'md' | 'lg' | 'xl'
  testId?: string
}

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  dismissable = true,
  width = 'md',
  testId
}: Props): React.JSX.Element {
  const block = (e: Event): void => {
    if (!dismissable) e.preventDefault()
  }
  return (
    <Dialog.Root open={open} onOpenChange={(o) => (dismissable || o ? onOpenChange(o) : undefined)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-[rgb(10_20_24/0.45)] backdrop-blur-[3px] animate-fade" />
        <Dialog.Content
          data-testid={testId}
          onEscapeKeyDown={block}
          onPointerDownOutside={block}
          onInteractOutside={block}
          className={cn(
            'card fixed left-1/2 top-1/2 max-h-[88vh] -translate-x-1/2 -translate-y-1/2 overflow-y-auto p-7 focus:outline-none animate-fade',
            width === 'md' && 'w-[min(540px,92vw)]',
            width === 'lg' && 'w-[min(760px,94vw)]',
            width === 'xl' && 'w-[min(980px,95vw)]'
          )}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="text-2xl font-semibold">{title}</Dialog.Title>
              <Dialog.Description className="mt-1.5 text-ink-muted">
                {description}
              </Dialog.Description>
            </div>
            {dismissable && (
              <Dialog.Close asChild>
                <button
                  className="rounded-lg p-1.5 text-ink-muted hover:bg-surface-muted"
                  aria-label="Close"
                >
                  <X size={20} />
                </button>
              </Dialog.Close>
            )}
          </div>
          <div className="mt-6">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
