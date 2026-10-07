import { useState } from 'react'
import {
  ArrowRight,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  DoorClosed,
  Home,
  Printer,
  Sparkles,
  Undo2
} from 'lucide-react'
import { Button } from '@renderer/components/Button'
import { Modal } from '@renderer/components/Modal'
import type { Screen } from '@renderer/components/NavRail'
import { useTerms } from '@renderer/lib/appContext'
import { cn } from '@renderer/lib/cn'

interface Card {
  icon: typeof Home
  title: string
  body: string[]
  showMe?: Screen
}

function useCards(): Card[] {
  const terms = useTerms()
  const locker = terms.locker.one.toLowerCase()
  const lockers = terms.locker.many.toLowerCase()
  const isMac = navigator.platform.toLowerCase().includes('mac')
  const mod = isMac ? 'Cmd' : 'Ctrl'
  return [
    {
      icon: Sparkles,
      title: 'Welcome to Locker Manager',
      body: [
        `Locker Manager keeps every ${locker}, lock code and student in one file in your school’s shared folder.`,
        'This tour takes about a minute. You can skip it now and take it again at any time from the Guide.'
      ]
    },
    {
      icon: Home,
      title: 'Home is where everyday jobs start',
      body: [
        `The big buttons on Home cover the everyday jobs: a new student, a student who has left, a forgotten code, a move or a swap.`,
        'Below them, Needs attention lists anything to fix, each with a button that takes you there.'
      ],
      showMe: 'home'
    },
    {
      icon: DoorClosed,
      title: `Students and ${lockers}`,
      body: [
        'Students lists everyone imported from your student system. Click a name to see their locker and code.',
        `${terms.locker.many} shows each bank as it looks on the wall. Click a ${locker} to see who has it and what lock is on it.`
      ],
      showMe: 'lockers'
    },
    {
      icon: Printer,
      title: 'Labels, letters and reports',
      body: [
        `Labels prints a name label for each ${locker} on standard label sheets.`,
        'Letters prints one page per student with their locker and code. Reports gives lists for staff, printed or as a spreadsheet.'
      ],
      showMe: 'print'
    },
    {
      icon: Undo2,
      title: 'Mistakes are easy to put right',
      body: [
        `Press ${mod}+Z to undo your last change. Press ${mod}+K to find any student or ${locker}.`,
        'History lists every change with who made it and when. A backup is kept every time the file saves.'
      ],
      showMe: 'history'
    },
    {
      icon: BookOpen,
      title: 'Help is always one click away',
      body: [
        'Click Guide at the top to read how to do any task. It opens at the help for the screen you are on.',
        'Only one person can change the file at a time. Everyone else can still look things up and print.'
      ]
    }
  ]
}

/**
 * The welcome tour: shown once per computer the first time a school file opens,
 * and again whenever someone asks for it (Guide, or the Help menu).
 */
export function Tour({
  open,
  onClose,
  onShowMe
}: {
  open: boolean
  onClose: () => void
  /** Null when no file is open: "Show me" needs one. */
  onShowMe: ((s: Screen) => void) | null
}): React.JSX.Element {
  const cards = useCards()
  const [step, setStep] = useState(0)
  const card = cards[step]!
  const last = step === cards.length - 1
  const Icon = card.icon
  const close = (): void => {
    setStep(0)
    onClose()
  }
  return (
    <Modal
      open={open}
      onOpenChange={(o) => !o && close()}
      title={card.title}
      description={`Step ${step + 1} of ${cards.length}`}
      testId="tour"
    >
      <div className="mt-5 flex gap-5">
        <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-brand">
          <Icon size={28} aria-hidden />
        </span>
        <div className="space-y-3 leading-relaxed">
          {card.body.map((p) => (
            <p key={p}>{p}</p>
          ))}
          {card.showMe && onShowMe && (
            <Button
              size="sm"
              variant="secondary"
              data-testid="tour-show-me"
              onClick={() => {
                const target = card.showMe!
                close()
                onShowMe(target)
              }}
            >
              Show me <ArrowRight size={15} aria-hidden />
            </Button>
          )}
        </div>
      </div>
      <ol className="mt-6 flex justify-center gap-2" aria-label="Tour steps">
        {cards.map((c, i) => (
          <li key={c.title}>
            <button
              onClick={() => setStep(i)}
              aria-label={`Step ${i + 1}: ${c.title}`}
              aria-current={i === step ? 'step' : undefined}
              className={cn(
                'block h-2.5 rounded-full transition-all',
                i === step ? 'w-6 bg-brand' : 'w-2.5 bg-line hover:bg-ink-muted'
              )}
            />
          </li>
        ))}
      </ol>
      <div className="mt-6 flex items-center justify-between gap-3">
        <Button variant="ghost" onClick={close} data-testid="tour-skip">
          {last ? 'Close' : 'Skip the tour'}
        </Button>
        <div className="flex gap-2">
          {step > 0 && (
            <Button variant="secondary" onClick={() => setStep(step - 1)}>
              <ChevronLeft size={18} aria-hidden /> Back
            </Button>
          )}
          {last ? (
            <Button onClick={close} data-testid="tour-finish">
              Finish
            </Button>
          ) : (
            <Button onClick={() => setStep(step + 1)} data-testid="tour-next">
              Next <ChevronRight size={18} aria-hidden />
            </Button>
          )}
        </div>
      </div>
    </Modal>
  )
}
