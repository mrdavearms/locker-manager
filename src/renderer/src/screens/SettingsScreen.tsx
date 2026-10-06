import { useState } from 'react'
import { cn } from '@renderer/lib/cn'
import { useTerms } from '@renderer/lib/appContext'
import { CodesForm } from '@renderer/settings/CodesForm'
import { LabelsForm } from '@renderer/settings/LabelsForm'
import { LettersForm } from '@renderer/settings/LettersForm'
import { LocationsEditor } from '@renderer/settings/LocationsEditor'
import { LocksForm } from '@renderer/settings/LocksForm'
import { SchoolForm } from '@renderer/settings/SchoolForm'
import { TermsForm } from '@renderer/settings/TermsForm'

type Tab = 'school' | 'terms' | 'locations' | 'locks' | 'codes' | 'labels' | 'letters'

/** SPEC.md section 7, grouped into tabs. More tabs arrive with later features. */
export type SettingsTab = Tab

export function SettingsScreen({ initialTab = 'school' }: { initialTab?: Tab }): React.JSX.Element {
  const terms = useTerms()
  const [tab, setTab] = useState<Tab>(initialTab)
  const tabs: { id: Tab; label: string }[] = [
    { id: 'school', label: 'School' },
    { id: 'terms', label: 'Words we use' },
    { id: 'locations', label: `${terms.area.many} and ${terms.locker.many.toLowerCase()}` },
    { id: 'locks', label: 'Locks' },
    { id: 'codes', label: 'Lock codes' },
    { id: 'labels', label: 'Labels' },
    { id: 'letters', label: 'Letters' }
  ]
  return (
    <div className="w-full space-y-6 px-6 py-8">
      <h1 className="text-3xl font-semibold">Settings</h1>
      <div
        role="tablist"
        aria-label="Settings"
        className="flex flex-wrap gap-1 rounded-2xl bg-surface-muted p-1"
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'rounded-xl px-4 py-2 text-sm font-semibold transition-colors',
              tab === t.id
                ? 'bg-surface text-ink shadow-[var(--shadow-card)]'
                : 'text-ink-muted hover:text-ink'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel">
        {tab === 'school' && <SchoolForm />}
        {tab === 'terms' && <TermsForm />}
        {tab === 'locations' && <LocationsEditor />}
        {tab === 'locks' && <LocksForm />}
        {tab === 'codes' && <CodesForm />}
        {tab === 'labels' && <LabelsForm />}
        {tab === 'letters' && <LettersForm />}
      </div>
    </div>
  )
}
