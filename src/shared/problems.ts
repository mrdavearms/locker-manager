// The problems panel on Home (SPEC.md 10): everything that needs attention, each
// with a Fix button that opens the right screen.

export type ProblemScreen =
  'students' | 'lockers' | 'allocate' | 'letters' | 'settings' | 'home' | 'print'

export interface Problem {
  id: string
  tone: 'warn' | 'bad'
  title: string
  detail: string
  fix: { label: string; screen: ProblemScreen } | null
}
