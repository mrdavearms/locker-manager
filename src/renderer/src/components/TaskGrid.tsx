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

// The home-screen tasks from SPEC.md section 10, in that order. Each one lights
// up in the milestone that builds it; until then it is shown but disabled so
// staff can see where the app is going.
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
      <h2 id="tasks-heading" className="text-lg font-semibold">
        What do you want to do?
      </h2>
      <p className="mt-1 text-sm text-ink-muted">
        These tasks arrive over the next releases. Updates install themselves.
      </p>
      <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tasks.map(({ icon: Icon, title, hint }) => (
          <li key={title}>
            <button
              type="button"
              disabled
              aria-disabled="true"
              title="Coming in a later version"
              className="card flex w-full items-center gap-4 p-4 text-left opacity-70"
            >
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
                <Icon size={22} />
              </span>
              <span>
                <span className="block font-medium">{title}</span>
                <span className="block text-sm text-ink-muted">{hint}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
