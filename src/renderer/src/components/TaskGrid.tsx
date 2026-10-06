import {
  ArrowLeftRight,
  CalendarRange,
  FileInput,
  KeyRound,
  Mail,
  Search,
  Tags,
  UserMinus,
  UserPlus
} from 'lucide-react'

// The home-screen tasks from SPEC.md section 10, in that order. Each lights up in
// the milestone that builds it; until then it is shown, disabled, so staff can
// see where the app is going.
const tasks = [
  { icon: Search, title: 'Find a student', hint: 'Locker, group and code' },
  { icon: UserPlus, title: 'New student', hint: 'Give a locker and a code' },
  { icon: UserMinus, title: 'Student has left', hint: 'Free the locker, new code' },
  { icon: KeyRound, title: 'New code', hint: 'Forgotten or shared code' },
  { icon: ArrowLeftRight, title: 'Move or swap', hint: 'Whole records move together' },
  { icon: Tags, title: 'Print labels', hint: 'Exact millimetre geometry' },
  { icon: Mail, title: 'Print letters', hint: 'One student per page' },
  { icon: FileInput, title: 'Import students', hint: 'From your student system' },
  { icon: CalendarRange, title: 'Start next year', hint: 'Guided, reversible rollover' }
] as const

export function TaskGrid(): React.JSX.Element {
  return (
    <section aria-labelledby="tasks-heading">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="tasks-heading" className="text-xl font-semibold">
          What do you want to do?
        </h2>
        <p className="text-sm text-ink-muted">These arrive in the next updates.</p>
      </div>
      <ul className="stagger mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tasks.map(({ icon: Icon, title, hint }) => (
          <li key={title}>
            <button
              type="button"
              disabled
              aria-disabled="true"
              title="Coming in a later version"
              className="card flex w-full items-center gap-4 p-4 text-left opacity-75"
            >
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-surface-muted text-ink-muted">
                <Icon size={22} aria-hidden />
              </span>
              <span className="flex-1">
                <span className="block font-semibold">{title}</span>
                <span className="block text-sm text-ink-muted">{hint}</span>
              </span>
              <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs font-semibold text-ink-muted">
                Soon
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
