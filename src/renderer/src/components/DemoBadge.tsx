/** Shown on every screen while the demo school is open (SPEC.md 4.1). */
export function DemoBadge({ onPanel = false }: { onPanel?: boolean }): React.JSX.Element {
  return (
    <span
      data-testid="demo-badge"
      className={`stencil inline-flex items-center rounded-md border-2 px-2 py-0.5 text-sm leading-none ${
        onPanel ? 'border-on-panel text-on-panel' : 'border-accent text-accent'
      }`}
      title="This is the demo school. Every student in it is made up."
    >
      DEMO
    </span>
  )
}

/** Shown on every screen while a practice copy is open (SPEC.md 10). */
export function PracticeBadge(): React.JSX.Element {
  return (
    <span
      data-testid="practice-badge"
      className="stencil inline-flex items-center rounded-md border-2 border-brand px-2 py-0.5 text-sm leading-none text-brand"
      title="A practice copy: nothing done here reaches your school’s file."
    >
      PRACTICE
    </span>
  )
}
