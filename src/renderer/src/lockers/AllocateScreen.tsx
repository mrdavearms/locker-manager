import { useMemo, useState } from 'react'
import { CheckCircle2, Plus, Shuffle, Trash2, Wand2 } from 'lucide-react'
import type { AllocationPlan, AllocationRule, DraftAssignment, DraftView } from '@shared/allocation'
import { Banner } from '@renderer/components/Banner'
import { Button } from '@renderer/components/Button'
import { Field, SectionCard, Select, TextInput } from '@renderer/components/Field'
import { useAction, useCanEdit, useTerms } from '@renderer/lib/appContext'
import { cn } from '@renderer/lib/cn'
import { plural } from '@renderer/lib/format'
import { call, useRpc } from '@renderer/lib/rpc'

// SPEC.md 4.4: rules, a draft to check and rearrange, then commit.

const GROUP_COLOURS = [
  '#dceae9',
  '#fbe5d8',
  '#e3ecd5',
  '#e7e0f3',
  '#fbefcf',
  '#d9e8f6',
  '#f6dde6',
  '#e9e4d8',
  '#d6efe8',
  '#f0e3d2'
]

function PlanEditor({
  plan,
  onChange
}: {
  plan: AllocationPlan
  onChange: (p: AllocationPlan) => void
}): React.JSX.Element {
  const terms = useTerms()
  const { data: areas } = useRpc('locations.list', {})
  const setRule = (i: number, patch: Partial<AllocationRule>): void =>
    onChange({ ...plan, rules: plan.rules.map((r, j) => (j === i ? { ...r, ...patch } : r)) })
  const csv = (t: string): string[] =>
    t
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean)
  return (
    <div className="space-y-6">
      <SectionCard
        title="Who goes where"
        description={`Each line sends some students to an ${terms.area.one.toLowerCase()}. Lines run in order; a student is placed by the first line that fits them.`}
        actions={
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              onChange({
                ...plan,
                rules: [
                  ...plan.rules,
                  {
                    id: crypto.randomUUID(),
                    label: `Line ${plan.rules.length + 1}`,
                    yearLevels: [],
                    groups: [],
                    areaIds: [],
                    bankIds: []
                  }
                ]
              })
            }
          >
            <Plus size={16} aria-hidden /> Add a line
          </Button>
        }
      >
        {plan.rules.length === 0 && (
          <p className="text-sm text-ink-muted">
            No lines yet. Add one, or give each {terms.area.one.toLowerCase()} its year levels in
            Settings.
          </p>
        )}
        <ul className="space-y-3">
          {plan.rules.map((r, i) => (
            <li
              key={r.id}
              className="grid items-end gap-3 rounded-2xl border border-line p-4 md:grid-cols-[1fr_1fr_1fr_1.4fr_auto]"
            >
              <Field label="Name" htmlFor={`rule-label-${i}`}>
                <TextInput
                  id={`rule-label-${i}`}
                  value={r.label}
                  maxLength={80}
                  onChange={(e) => setRule(i, { label: e.target.value })}
                />
              </Field>
              <Field label={`${terms.yearLevel.many} (blank for all)`} htmlFor={`rule-years-${i}`}>
                <TextInput
                  id={`rule-years-${i}`}
                  value={r.yearLevels.join(', ')}
                  placeholder="7"
                  onChange={(e) => setRule(i, { yearLevels: csv(e.target.value) })}
                />
              </Field>
              <Field label={`${terms.group.many} (blank for all)`} htmlFor={`rule-groups-${i}`}>
                <TextInput
                  id={`rule-groups-${i}`}
                  value={r.groups.join(', ')}
                  placeholder="07A, 07B"
                  onChange={(e) => setRule(i, { groups: csv(e.target.value) })}
                />
              </Field>
              <Field label={`Into ${terms.area.one.toLowerCase()}`} htmlFor={`rule-area-${i}`}>
                <Select
                  id={`rule-area-${i}`}
                  value={r.areaIds[0] ?? ''}
                  onChange={(e) => setRule(i, { areaIds: e.target.value ? [e.target.value] : [] })}
                >
                  <option value="">Any {terms.area.one.toLowerCase()}</option>
                  {areas?.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <button
                className="mb-2 rounded-lg p-2 text-ink-muted hover:bg-surface-muted"
                aria-label={`Remove ${r.label}`}
                onClick={() => onChange({ ...plan, rules: plan.rules.filter((_, j) => j !== i) })}
              >
                <Trash2 size={17} />
              </button>
            </li>
          ))}
        </ul>
      </SectionCard>

      <SectionCard
        title="Order"
        description="How students and lockers are lined up before they are matched, first to first."
      >
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Students in order of" htmlFor="plan-sorder">
            <Select
              id="plan-sorder"
              value={plan.studentOrder}
              onChange={(e) =>
                onChange({
                  ...plan,
                  studentOrder: e.target.value as AllocationPlan['studentOrder']
                })
              }
            >
              <option value="group_then_name">{terms.group.one}, then surname</option>
              <option value="name">Surname only</option>
              <option value="house_then_name">{terms.house.one}, then surname</option>
              <option value="keep_last_year">
                Keep last year’s {terms.locker.one.toLowerCase()} where possible
              </option>
              <option value="random">Random</option>
            </Select>
          </Field>
          <Field
            label={`${terms.group.many} placed last`}
            hint="For example HUB"
            htmlFor="plan-last"
          >
            <TextInput
              id="plan-last"
              value={plan.groupsLast.join(', ')}
              onChange={(e) => onChange({ ...plan, groupsLast: csv(e.target.value) })}
            />
          </Field>
          <Field label={`${terms.locker.many} in order of`} htmlFor="plan-lorder">
            <Select
              id="plan-lorder"
              value={plan.lockerOrder}
              onChange={(e) =>
                onChange({ ...plan, lockerOrder: e.target.value as AllocationPlan['lockerOrder'] })
              }
            >
              <option value="number">Number</option>
              <option value="bank_then_number">{terms.bank.one}, then number</option>
              <option value="column">Column by column (top to bottom)</option>
              <option value="tier_preference">Middle and bottom first</option>
            </Select>
          </Field>
          <Field
            label={`Spare ${terms.locker.many.toLowerCase()} after each ${terms.group.one.toLowerCase()}`}
            hint="So late enrolments land near their group"
            htmlFor="plan-gapg"
          >
            <Select
              id="plan-gapg"
              value={plan.gapAfterGroup}
              onChange={(e) => onChange({ ...plan, gapAfterGroup: Number(e.target.value) })}
            >
              {[0, 1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label={`Spare ${terms.locker.many.toLowerCase()} at the end of each ${terms.bank.one.toLowerCase()}`}
            htmlFor="plan-gapb"
          >
            <Select
              id="plan-gapb"
              value={plan.gapAfterBank}
              onChange={(e) => onChange({ ...plan, gapAfterBank: Number(e.target.value) })}
            >
              {[0, 1, 2, 3, 5, 10].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          </Field>
          <label className="flex items-center gap-3 self-end pb-2 text-sm">
            <input
              type="checkbox"
              className="size-4"
              checked={plan.accessibleFirst}
              onChange={(e) => onChange({ ...plan, accessibleFirst: e.target.checked })}
            />
            Accessible {terms.locker.many.toLowerCase()} first for students who need one
          </label>
        </div>
      </SectionCard>
    </div>
  )
}

function DraftPreview({
  view,
  assignments,
  onAssignments
}: {
  view: DraftView
  assignments: DraftAssignment[]
  onAssignments: (a: DraftAssignment[]) => void
}): React.JSX.Element {
  const terms = useTerms()
  const { data: areas } = useRpc('locations.list', {})
  const { data: lockers } = useRpc('lockers.list', {})
  const [picked, setPicked] = useState<string | null>(null)
  const byLocker = useMemo(() => {
    const m = new Map<string, string[]>()
    for (const a of assignments) m.set(a.lockerId, [...(m.get(a.lockerId) ?? []), a.studentId])
    return m
  }, [assignments])
  const groupColour = useMemo(() => {
    const groups = [...new Set(Object.values(view.students).map((s) => s.group ?? ''))].sort()
    return (g: string | null) => GROUP_COLOURS[groups.indexOf(g ?? '') % GROUP_COLOURS.length]
  }, [view])

  // Click one locker, then another: their draft students change places.
  const click = (lockerId: string): void => {
    if (picked === null) {
      setPicked(lockerId)
      return
    }
    if (picked === lockerId) {
      setPicked(null)
      return
    }
    const a = picked
    onAssignments(
      assignments.map((x) =>
        x.lockerId === a ? { ...x, lockerId } : x.lockerId === lockerId ? { ...x, lockerId: a } : x
      )
    )
    setPicked(null)
  }

  return (
    <SectionCard
      title="The draft"
      description={`Nothing is saved yet. To change places, click one ${terms.locker.one.toLowerCase()}, then another. Colours show the ${terms.group.many.toLowerCase()}.`}
    >
      <div className="space-y-5">
        {areas?.map((a) =>
          a.banks.map((b) => {
            const list = (lockers ?? []).filter((l) => l.bankId === b.id)
            if (list.length === 0) return null
            return (
              <div key={b.id}>
                <p className="mb-2 text-sm font-semibold">
                  {a.name} · {b.name}
                </p>
                <div className="overflow-x-auto">
                  <div
                    className="grid w-max gap-1"
                    style={{ gridTemplateColumns: `repeat(${b.columns ?? 1}, 4.4rem)` }}
                  >
                    {list.map((l) => {
                      const ids = byLocker.get(l.id) ?? []
                      const s = ids[0] ? view.students[ids[0]] : undefined
                      const existing = l.holders[0]
                      const blocked = l.status !== 'in_service'
                      return (
                        <button
                          key={l.id}
                          disabled={blocked || (!!existing && !s)}
                          onClick={() => click(l.id)}
                          style={{
                            gridRow: l.row ?? undefined,
                            gridColumn: l.column ?? undefined,
                            background: s ? groupColour(s.group) : undefined
                          }}
                          className={cn(
                            'flex h-16 flex-col items-center justify-center rounded-md border px-1 text-center text-[0.68rem] leading-tight text-[#17222b]',
                            s
                              ? 'border-black/10'
                              : existing
                                ? 'border-line bg-surface-muted text-ink-muted'
                                : blocked
                                  ? 'border-bad/30 bg-bad-soft'
                                  : 'border-dashed border-line-strong bg-surface text-ink-muted',
                            picked === l.id && 'ring-3 ring-accent'
                          )}
                          aria-label={`${terms.locker.one} ${l.number}: ${s ? s.name : existing ? existing.name : 'spare'}`}
                        >
                          <span className="stencil text-base leading-none">{l.number}</span>
                          <span className="mt-0.5 w-full truncate">
                            {s
                              ? s.name.split(' ')[0]
                              : existing
                                ? existing.name.split(' ')[0]
                                : blocked
                                  ? 'out'
                                  : 'spare'}
                          </span>
                          {s && <span className="opacity-70">{s.groupDisplay}</span>}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </SectionCard>
  )
}

export function AllocateScreen({ onDone }: { onDone: () => void }): React.JSX.Element {
  const terms = useTerms()
  const canEdit = useCanEdit()
  const act = useAction()
  const { data: saved } = useRpc('allocation.plan.get', {})
  const [plan, setPlan] = useState<AllocationPlan | null>(null)
  const [view, setView] = useState<DraftView | null>(null)
  const [assignments, setAssignments] = useState<DraftAssignment[]>([])
  const [issueCodes, setIssueCodes] = useState(true)
  const [result, setResult] = useState<{ assigned: number; codes: number } | null>(null)
  const p = plan ?? saved

  if (!p) return <div className="px-6 py-8">Loading…</div>
  const excluded = view?.draft.skipped.filter((s) => s.reason === 'excluded').length ?? 0
  const noRule = view?.draft.skipped.filter((s) => s.reason === 'no_rule').length ?? 0

  if (result) {
    return (
      <div className="px-6 py-8">
        <section className="card p-8 text-center animate-rise" data-testid="allocation-done">
          <CheckCircle2 size={40} className="mx-auto text-good" aria-hidden />
          <h1 className="mt-3 text-2xl font-semibold">
            {plural(result.assigned, terms.locker.one.toLowerCase())} given out
          </h1>
          <p className="mt-2 text-ink-muted">
            {result.codes > 0 ? `${plural(result.codes, 'code')} issued. ` : ''}Next: print labels
            and letters (in the next update). A backup was kept, and Undo puts everything back.
          </p>
          <Button className="mt-6" size="lg" onClick={onDone}>
            See the {terms.locker.many.toLowerCase()}
          </Button>
        </section>
      </div>
    )
  }

  return (
    <div className="w-full space-y-6 px-6 py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Allocate {terms.locker.many.toLowerCase()}</h1>
          <p className="mt-1 text-ink-muted">
            Gives a {terms.locker.one.toLowerCase()} to every student who has none, by your rules.
            You check the draft before anything is saved.
          </p>
        </div>
        <Button variant="secondary" onClick={onDone}>
          Close
        </Button>
      </header>

      <PlanEditor plan={p} onChange={(next) => (setPlan(next), setView(null))} />

      <div className="flex flex-wrap justify-end gap-2">
        <Button
          size="lg"
          data-testid="make-draft"
          onClick={() =>
            void act(async () => {
              const v = await call('allocation.draft', { plan: p })
              setView(v)
              setAssignments(v.draft.assignments)
            })
          }
        >
          <Wand2 size={18} aria-hidden /> {view ? 'Make the draft again' : 'Make a draft'}
        </Button>
      </div>

      {view && (
        <>
          <SectionCard
            title="Summary"
            description={`${plural(assignments.length, 'student')} placed. ${excluded > 0 ? `${excluded} never get a ${terms.locker.one.toLowerCase()} (exclusions). ` : ''}${noRule > 0 ? `${noRule} match no line above. ` : ''}`}
          >
            <table className="w-full text-sm">
              <thead className="text-left text-ink-muted">
                <tr>
                  <th className="pb-2 font-semibold">Line</th>
                  <th className="pb-2 font-semibold">Students</th>
                  <th className="pb-2 font-semibold">Free {terms.locker.many.toLowerCase()}</th>
                  <th className="pb-2 font-semibold">Placed</th>
                </tr>
              </thead>
              <tbody>
                {view.draft.byRule.map((r) => (
                  <tr key={r.ruleId} className="border-t border-line">
                    <td className="py-1.5">{r.label}</td>
                    <td className="py-1.5 tabular-nums">{r.students}</td>
                    <td className="py-1.5 tabular-nums">{r.lockers}</td>
                    <td
                      className={cn(
                        'py-1.5 tabular-nums',
                        r.placed < r.students && 'font-semibold text-bad'
                      )}
                    >
                      {r.placed}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </SectionCard>
          {view.draft.unplaced.length > 0 && (
            <Banner
              tone="bad"
              title={`${plural(view.draft.unplaced.length, 'student')} did not fit`}
              testId="unplaced"
            >
              Not enough {terms.locker.many.toLowerCase()}:{' '}
              {view.draft.unplaced
                .slice(0, 12)
                .map((u) => view.students[u.studentId]?.name ?? '?')
                .join(', ')}
              {view.draft.unplaced.length > 12 ? '…' : ''}. Add {terms.locker.many.toLowerCase()},
              allow sharing, or shorten the list; or commit the rest and place these by hand.
            </Banner>
          )}
          <DraftPreview view={view} assignments={assignments} onAssignments={setAssignments} />
          <div className="card flex flex-wrap items-center justify-between gap-4 p-5">
            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                className="size-4"
                checked={issueCodes}
                onChange={(e) => setIssueCodes(e.target.checked)}
              />
              Issue a code to each {terms.locker.one.toLowerCase()} now (from this year’s code set
              when there is one)
            </label>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setAssignments(view.draft.assignments)}>
                <Shuffle size={16} aria-hidden /> Back to the draft as made
              </Button>
              <Button
                variant="accent"
                size="lg"
                disabled={!canEdit || assignments.length === 0}
                data-testid="commit-allocation"
                onClick={() =>
                  void act(async () => {
                    await call('allocation.plan.set', { plan: p })
                    setResult(await call('allocation.commit', { assignments, issueCodes }))
                  })
                }
              >
                Give out {plural(assignments.length, terms.locker.one.toLowerCase())}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
