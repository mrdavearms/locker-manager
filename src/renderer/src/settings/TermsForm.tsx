import { useState } from 'react'
import { Check } from 'lucide-react'
import { TERM_KEYS, TERM_LABELS, TERMINOLOGY_PRESETS, type Terminology } from '@shared/terminology'
import { Button } from '@renderer/components/Button'
import { SectionCard, TextInput } from '@renderer/components/Field'
import { useAction, useCanEdit, useTerms } from '@renderer/lib/appContext'
import { call } from '@renderer/lib/rpc'
import { cn } from '@renderer/lib/cn'

/** SPEC.md 3.9: the words your school uses, from a preset or typed in. */
export function TermsForm(): React.JSX.Element {
  const current = useTerms()
  const canEdit = useCanEdit()
  const act = useAction()
  const [draft, setDraft] = useState<Terminology | null>(null)
  const t = draft ?? current
  const matching = TERMINOLOGY_PRESETS.find((p) => JSON.stringify(p.terms) === JSON.stringify(t))

  return (
    <SectionCard
      title="Words your school uses"
      description="Every screen, label, letter and report uses these words. Pick the closest set, then change any word."
    >
      <div className="grid gap-3 md:grid-cols-3">
        {TERMINOLOGY_PRESETS.map((p) => (
          <button
            key={p.id}
            disabled={!canEdit}
            onClick={() => setDraft(p.terms)}
            className={cn(
              'rounded-2xl border p-4 text-left transition-colors disabled:opacity-60',
              matching?.id === p.id
                ? 'border-brand bg-brand-soft'
                : 'border-line hover:bg-surface-muted'
            )}
          >
            <span className="flex items-center justify-between font-semibold">
              {p.name}{' '}
              {matching?.id === p.id && <Check size={18} className="text-brand" aria-hidden />}
            </span>
            <span className="mt-1 block text-sm text-ink-muted">{p.description}</span>
          </button>
        ))}
      </div>
      <table className="mt-6 w-full text-sm">
        <thead>
          <tr className="text-left text-ink-muted">
            <th className="pb-2 font-semibold">What it means</th>
            <th className="pb-2 font-semibold">One</th>
            <th className="pb-2 font-semibold">More than one</th>
          </tr>
        </thead>
        <tbody>
          {TERM_KEYS.map((k) => (
            <tr key={k} className="border-t border-line">
              <td className="py-2 pr-4">{TERM_LABELS[k]}</td>
              <td className="py-2 pr-2">
                <TextInput
                  aria-label={`${TERM_LABELS[k]}: one`}
                  disabled={!canEdit}
                  value={t[k].one}
                  maxLength={40}
                  onChange={(e) => setDraft({ ...t, [k]: { ...t[k], one: e.target.value } })}
                />
              </td>
              <td className="py-2">
                <TextInput
                  aria-label={`${TERM_LABELS[k]}: more than one`}
                  disabled={!canEdit}
                  value={t[k].many}
                  maxLength={40}
                  onChange={(e) => setDraft({ ...t, [k]: { ...t[k], many: e.target.value } })}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {draft && (
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDraft(null)}>
            Undo
          </Button>
          <Button
            disabled={TERM_KEYS.some((k) => !t[k].one.trim() || !t[k].many.trim())}
            onClick={() =>
              void act(async () => {
                await call('terms.set', { terms: t })
                setDraft(null)
              })
            }
          >
            Save words
          </Button>
        </div>
      )}
    </SectionCard>
  )
}
