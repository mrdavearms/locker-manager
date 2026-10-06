import type { ReactNode } from 'react'
import { AlertTriangle, Info, Lock, ShieldAlert } from 'lucide-react'
import { cn } from '@renderer/lib/cn'

type Tone = 'info' | 'warn' | 'bad' | 'locked'

const tones: Record<Tone, { box: string; icon: ReactNode }> = {
  info: {
    box: 'bg-brand-soft border-brand/25',
    icon: <Info size={20} className="text-brand" aria-hidden />
  },
  warn: {
    box: 'bg-warn-soft border-warn/30',
    icon: <AlertTriangle size={20} className="text-warn" aria-hidden />
  },
  bad: {
    box: 'bg-bad-soft border-bad/30',
    icon: <ShieldAlert size={20} className="text-bad" aria-hidden />
  },
  locked: {
    box: 'bg-accent-soft border-accent/30',
    icon: <Lock size={20} className="text-accent" aria-hidden />
  }
}

interface Props {
  tone: Tone
  title: string
  children?: ReactNode
  actions?: ReactNode
  testId?: string
}

export function Banner({ tone, title, children, actions, testId }: Props): React.JSX.Element {
  const t = tones[tone]
  return (
    <div
      role={tone === 'bad' ? 'alert' : 'status'}
      data-testid={testId}
      className={cn(
        'flex flex-wrap items-start gap-3 rounded-2xl border px-5 py-4 animate-rise',
        t.box
      )}
    >
      <span className="mt-0.5">{t.icon}</span>
      <div className="min-w-[16rem] flex-1">
        <p className="font-semibold">{title}</p>
        {children && <div className="mt-1 text-sm text-ink-muted">{children}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
