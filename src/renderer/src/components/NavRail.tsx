import { DoorClosed, FileText, History, Home, Mail, Printer, Settings, Users } from 'lucide-react'
import { cn } from '@renderer/lib/cn'
import { useTerms } from '@renderer/lib/appContext'

export type Screen =
  | 'home'
  | 'students'
  | 'import'
  | 'lockers'
  | 'allocate'
  | 'print'
  | 'letters'
  | 'reports'
  | 'history'
  | 'settings'
  | 'settings-labels'
  | 'settings-letters'
  | 'settings-codes'
  | 'settings-privacy'
  | 'settings-storage'
  | 'settings-computer'
  | 'setup'
  | 'rollover'

/** The left-hand menu while a file is open. Every item has a text label. */
export function NavRail({
  screen,
  onNavigate
}: {
  screen: Screen
  onNavigate: (s: Screen) => void
}): React.JSX.Element {
  const terms = useTerms()
  const items: { id: Screen; label: string; icon: typeof Home }[] = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'students', label: 'Students', icon: Users },
    { id: 'lockers', label: terms.locker.many, icon: DoorClosed },
    { id: 'print', label: 'Labels', icon: Printer },
    { id: 'letters', label: 'Letters', icon: Mail },
    { id: 'reports', label: 'Reports', icon: FileText },
    { id: 'history', label: 'History', icon: History },
    { id: 'settings', label: 'Settings', icon: Settings }
  ]
  return (
    <nav
      aria-label="Main"
      className="sticky top-0 z-10 shrink-0 border-b border-line bg-canvas/95 px-3 py-2 backdrop-blur md:w-48 md:self-start md:border-0 md:bg-transparent md:py-6 md:backdrop-blur-none"
    >
      {/* A row across the top in a narrow window (or at large text sizes); a column otherwise. */}
      <ul className="flex gap-1 overflow-x-auto md:block md:space-y-1">
        {items.map(({ id, label, icon: Icon }) => (
          <li key={id}>
            <button
              data-testid={`nav-${id}`}
              aria-current={
                screen === id ||
                (screen === 'import' && id === 'students') ||
                (screen === 'allocate' && id === 'lockers') ||
                (screen.startsWith('settings-') && id === 'settings')
                  ? 'page'
                  : undefined
              }
              onClick={() => onNavigate(id)}
              className={cn(
                'flex items-center gap-3 whitespace-nowrap rounded-xl px-3.5 py-2.5 text-left font-semibold transition-colors md:w-full',
                screen === id
                  ? 'bg-panel text-on-panel shadow-[var(--shadow-card)]'
                  : 'text-ink-muted hover:bg-surface-muted hover:text-ink'
              )}
            >
              <Icon size={19} aria-hidden /> {label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}
