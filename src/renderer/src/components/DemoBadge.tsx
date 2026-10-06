/** Shown on every screen while the demo school is open (SPEC.md 4.1). */
export function DemoBadge(): React.JSX.Element {
  return (
    <span
      data-testid="demo-badge"
      className="stencil inline-flex items-center rounded-md border-2 border-accent px-2 py-0.5 text-sm leading-none text-accent"
      title="This is the demo school. Every student in it is made up."
    >
      DEMO
    </span>
  )
}
