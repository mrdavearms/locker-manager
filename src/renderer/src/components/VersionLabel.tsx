import { useAppInfo } from '@renderer/lib/useAppInfo'
import { versionLine } from '@renderer/lib/format'
import { cn } from '@renderer/lib/cn'

/**
 * The version, the short Git commit and the build date, so anyone can say exactly
 * which build they have when they report a problem. Shown on Welcome, Home and
 * the bottom bar as well as in About.
 */
export function VersionLabel({ className }: { className?: string }): React.JSX.Element | null {
  const info = useAppInfo()
  if (!info) return null
  return (
    <span
      data-testid="version-label"
      className={cn('tabular-nums', className)}
      title={info.packaged ? undefined : 'Development build'}
    >
      {versionLine(info)}
      {info.packaged ? '' : ' (development)'}
    </span>
  )
}
