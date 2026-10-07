import { useEffect, useState } from 'react'
import { ShieldAlert } from 'lucide-react'
import { DEFAULT_CODE_RULES, RULE_TEXT, type CodeRules, type CodeRulesSummary } from '@shared/codes'
import { Banner } from '@renderer/components/Banner'
import { Button } from '@renderer/components/Button'
import { Field, SectionCard, Select, TextInput } from '@renderer/components/Field'
import { useAction, useCanEdit, useTerms } from '@renderer/lib/appContext'
import { formatWhen } from '@renderer/lib/format'
import { call, useRpc } from '@renderer/lib/rpc'

/** SPEC.md 4.6 and settings tab 6: code rules with a live preview, and code sets. */
export function CodesForm({
  rulesOnly = false
}: {
  /** The set-up step shows only the rules; code sets wait for Settings. */
  rulesOnly?: boolean
}): React.JSX.Element {
  const terms = useTerms()
  const canEdit = useCanEdit()
  const act = useAction()
  const { data: saved } = useRpc('codes.rules.get', {})
  const { data: sets } = useRpc('codes.sets.list', {})
  const [draft, setDraft] = useState<CodeRules | null>(null)
  const [summary, setSummary] = useState<CodeRulesSummary | null>(null)
  const [setName, setSetName] = useState(`${new Date().getFullYear() + 1} codes`)
  const r = draft ?? saved

  useEffect(() => {
    if (!r) return
    let cancelled = false
    void window.api.rpc('codes.rules.preview', { rules: r }).then((x) => {
      if (!cancelled && x.ok) setSummary(x.value)
    })
    return () => {
      cancelled = true
    }
  }, [r])

  if (!r) return <SectionCard title="Lock codes">Loading…</SectionCard>
  const set = (patch: Partial<CodeRules>): void => setDraft({ ...r, ...patch })
  const lockers = sets?.find((s) => s.purpose === 'year')?.total ?? 0

  return (
    <div className="space-y-6">
      <SectionCard
        title="Lock code rules"
        description="Codes that break any ticked rule are never issued. The defaults follow lock makers' advice: nothing one number away from 0 0 0 0, nothing all the same."
      >
        <div className="grid gap-4 md:grid-cols-4">
          <Field label="Numbers in a code" htmlFor="cr-len">
            <Select
              id="cr-len"
              disabled={!canEdit}
              value={r.length}
              onChange={(e) => set({ length: Number(e.target.value) })}
            >
              {[3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Each number goes" htmlFor="cr-pos">
            <Select
              id="cr-pos"
              disabled={!canEdit}
              value={r.positions}
              onChange={(e) => set({ positions: Number(e.target.value) })}
            >
              <option value={10}>0 to 9</option>
              <option value={40}>0 to 39</option>
              <option value={36}>0 to 35</option>
              <option value={60}>0 to 59</option>
            </Select>
          </Field>
          <Field label="No two locks share a code" htmlFor="cr-uniq">
            <Select
              id="cr-uniq"
              disabled={!canEdit}
              value={r.uniqueness}
              onChange={(e) => set({ uniqueness: e.target.value as CodeRules['uniqueness'] })}
            >
              <option value="school">Across the whole school</option>
              <option value="area">Within each {terms.area.one.toLowerCase()}</option>
              <option value="none">Not required</option>
            </Select>
          </Field>
          <Field label="Spare codes kept ready" htmlFor="cr-spare">
            <TextInput
              id="cr-spare"
              disabled={!canEdit}
              inputMode="numeric"
              value={r.sparePoolSize}
              onChange={(e) =>
                set({ sparePoolSize: Math.max(0, Math.min(5000, Number(e.target.value) || 0)) })
              }
            />
          </Field>
        </div>
        <fieldset className="mt-5">
          <legend className="text-sm font-semibold">Never issue</legend>
          <div className="mt-2 grid gap-2 md:grid-cols-2">
            {(Object.keys(RULE_TEXT) as (keyof typeof RULE_TEXT)[]).map((k) => (
              <label key={k} className="flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  className="size-4"
                  disabled={!canEdit}
                  checked={r[k]}
                  onChange={(e) => set({ [k]: e.target.checked } as Partial<CodeRules>)}
                />
                {RULE_TEXT[k]}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <Field label="Do not reuse a lock’s codes from the last (years)" htmlFor="cr-hist">
            <TextInput
              id="cr-hist"
              disabled={!canEdit}
              inputMode="numeric"
              value={r.historyYears}
              onChange={(e) =>
                set({ historyYears: Math.max(0, Math.min(20, Number(e.target.value) || 0)) })
              }
            />
          </Field>
          <Field label="Also never issue (comma separated)" htmlFor="cr-block">
            <TextInput
              id="cr-block"
              disabled={!canEdit}
              value={r.blocklist.join(', ')}
              onChange={(e) =>
                set({
                  blocklist: e.target.value
                    .split(',')
                    .map((x) => x.trim())
                    .filter(Boolean)
                })
              }
            />
          </Field>
        </div>
        {summary && (
          <div className="mt-5 rounded-2xl bg-surface-muted p-4">
            <p className="text-sm">
              These rules allow{' '}
              <strong>
                {summary.estimated ? 'about ' : ''}
                {summary.validCount.toLocaleString('en-AU')}
              </strong>{' '}
              codes. Ten examples:
            </p>
            <p className="mt-2 flex flex-wrap gap-2 font-mono">
              {summary.samples.map((s) => (
                <span key={s} className="rounded-lg bg-surface px-2.5 py-1">
                  {s}
                </span>
              ))}
            </p>
          </div>
        )}
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          {JSON.stringify(r) !== JSON.stringify(DEFAULT_CODE_RULES) && (
            <Button
              variant="ghost"
              disabled={!canEdit}
              onClick={() => setDraft(DEFAULT_CODE_RULES)}
              data-testid="codes-reset"
            >
              Back to the recommended rules
            </Button>
          )}
        </div>
        {draft && (
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDraft(null)}>
              Undo
            </Button>
            <Button
              onClick={() =>
                void act(
                  async () => (await call('codes.rules.set', { rules: draft }), setDraft(null))
                )
              }
            >
              Save rules
            </Button>
          </div>
        )}
      </SectionCard>

      {!rulesOnly && (
        <SectionCard
          title="Code sets"
          description={`Make next year's codes in advance: one for every ${terms.locker.one.toLowerCase()}, never the same as its code before, plus spares for changes during the year. A set made while ${terms.locker.many.toLowerCase()} are given out is kept for next year and used when you start next year.`}
        >
          {summary && lockers + r.sparePoolSize > summary.validCount / 2 && (
            <div className="mb-4">
              <Banner tone="warn" title="This would use more than half the codes the rules allow">
                Codes become easier to guess. Allow longer codes or fewer spares.
              </Banner>
            </div>
          )}
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-64">
              <Field label="Name for the set" htmlFor="cs-name">
                <TextInput
                  id="cs-name"
                  disabled={!canEdit}
                  value={setName}
                  maxLength={80}
                  onChange={(e) => setSetName(e.target.value)}
                />
              </Field>
            </div>
            <Button
              disabled={!canEdit || setName.trim() === ''}
              onClick={() =>
                void act(() => call('codes.sets.generate', { name: setName, seed: null }))
              }
              data-testid="generate-set"
            >
              Make the code set
            </Button>
          </div>
          {sets && sets.length > 0 && (
            <table className="mt-5 w-full text-sm">
              <thead className="text-left text-ink-muted">
                <tr>
                  <th className="pb-2 font-semibold">Set</th>
                  <th className="pb-2 font-semibold">For</th>
                  <th className="pb-2 font-semibold">Codes</th>
                  <th className="pb-2 font-semibold">Not yet used</th>
                  <th className="pb-2 font-semibold">Made</th>
                </tr>
              </thead>
              <tbody>
                {sets.map((s) => (
                  <tr key={s.id} className="border-t border-line">
                    <td className="py-1.5 font-semibold">{s.name}</td>
                    <td className="py-1.5">
                      {s.purpose === 'year' ? `Each ${terms.locker.one.toLowerCase()}` : 'Spares'}
                      {s.forNextYear && (
                        <span className="ml-2 rounded-full bg-brand-soft px-2 py-0.5 text-xs text-brand">
                          Kept for next year
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 tabular-nums">{s.total}</td>
                    <td className="py-1.5 tabular-nums">{s.available}</td>
                    <td className="py-1.5">{formatWhen(s.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </SectionCard>
      )}

      <section className="flex gap-3 rounded-2xl border border-line p-5 text-sm text-ink-muted">
        <ShieldAlert size={20} className="shrink-0 text-ink-muted" aria-hidden />
        <p>
          Codes are stored scrambled (AES-256) inside the data file, so they cannot be read by
          opening the file in another program. Anyone who has the file and this app can still see
          them, and backups hold codes too: keep the shared folder to staff who should see codes.
          Every time a code is shown, it is recorded.
        </p>
      </section>
    </div>
  )
}
