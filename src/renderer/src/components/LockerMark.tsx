import { cn } from '@renderer/lib/cn'

/** The app's mark: a locker door with vents and a dial that turns into place. */
export function LockerMark({
  className,
  animate = false
}: {
  className?: string
  animate?: boolean
}): React.JSX.Element {
  return (
    <svg viewBox="0 0 48 48" className={cn('shrink-0', className)} aria-hidden>
      <rect x="1" y="1" width="46" height="46" rx="12" className="fill-brand" />
      <rect
        x="12"
        y="7"
        width="24"
        height="34"
        rx="4"
        className="fill-[var(--color-on-brand)]"
        opacity="0.96"
      />
      <g className="fill-brand" opacity="0.35">
        <rect x="17" y="12" width="14" height="2.4" rx="1.2" />
        <rect x="17" y="16.5" width="14" height="2.4" rx="1.2" />
        <rect x="17" y="21" width="14" height="2.4" rx="1.2" />
      </g>
      <g style={{ transformOrigin: '24px 32px' }} className={animate ? 'animate-dial' : undefined}>
        <circle cx="24" cy="32" r="5" className="fill-accent" />
        <rect x="23.2" y="27.6" width="1.6" height="3.4" rx="0.8" fill="white" />
      </g>
    </svg>
  )
}
