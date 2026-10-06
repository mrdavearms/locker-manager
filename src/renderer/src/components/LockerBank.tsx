import { cn } from '@renderer/lib/cn'

// Decoration for the Welcome screen: a short bank of lockers with stencilled
// numbers. One door carries the accent dial. Purely visual.
const doors = [112, 113, 114, 115, 116, 117, 118, 119]

export function LockerBank({ className }: { className?: string }): React.JSX.Element {
  return (
    <div aria-hidden className={cn('grid grid-cols-4 gap-2.5', className)}>
      {doors.map((n, i) => (
        <div
          key={n}
          className="relative aspect-[3/5] overflow-hidden rounded-xl border border-white/10 bg-[color-mix(in_oklab,var(--color-panel)_82%,black)] shadow-[inset_0_-10px_20px_rgb(0_0_0/0.18)] animate-rise"
          style={{ animationDelay: `${120 + i * 55}ms` }}
        >
          <div className="perforated absolute inset-x-3 top-3 h-8 rounded-md opacity-90" />
          <span className="stencil absolute inset-x-0 top-[44%] text-center text-[1.65rem] leading-none text-white/85">
            {n}
          </span>
          <span
            className={cn(
              'absolute bottom-4 left-1/2 size-5 -translate-x-1/2 rounded-full ring-2',
              n === 114 ? 'bg-accent ring-accent/40 animate-dial' : 'bg-white/25 ring-white/10'
            )}
          />
        </div>
      ))}
    </div>
  )
}
