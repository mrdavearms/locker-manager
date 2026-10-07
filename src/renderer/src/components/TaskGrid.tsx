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

// The home-screen tasks from SPEC.md section 10, in that order. Tasks that change
// the file are shown greyed out while it is open read-only.
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

export type TaskId = (typeof tasks)[number]['title']

/** Tasks with a handler are live; the rest (changes, while read-only) show "Read-only". */
export function TaskGrid({
  handlers = {}
}: {
  handlers?: Partial<Record<TaskId, () => void>>
}): React.JSX.Element {
  return (
    <section aria-labelledby="tasks-heading">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="tasks-heading" className="text-xl font-semibold">
          What do you want to do?
        </h2>
        {tasks.some((t) => !handlers[t.title]) && (
          <p className="text-sm text-ink-muted">Grey tasks need the file open for editing.</p>
        )}
      </div>
      <ul className="stagger mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tasks.map(({ icon: Icon, title, hint }) => {
          const run = handlers[title]
          return (
            <li key={title}>
              <button
                type="button"
                disabled={!run}
                aria-disabled={!run}
                onClick={run}
                title={run ? undefined : 'The file is open read-only on this computer'}
                data-testid={`task-${title.toLowerCase().replace(/[^a-z]+/g, '-')}`}
                className={
                  run
                    ? 'card group flex w-full items-center gap-4 p-4 text-left transition-[box-shadow,transform] hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)]'
                    : 'card flex w-full items-center gap-4 p-4 text-left opacity-60'
                }
              >
                <span
                  className={
                    run
                      ? 'flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand'
                      : 'flex size-11 shrink-0 items-center justify-center rounded-xl bg-surface-muted text-ink-muted'
                  }
                >
                  <Icon size={22} aria-hidden />
                </span>
                <span className="flex-1">
                  <span className="block font-semibold">{title}</span>
                  <span className="block text-sm text-ink-muted">{hint}</span>
                </span>
                {!run && (
                  <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs font-semibold text-ink-muted">
                    Read-only
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
