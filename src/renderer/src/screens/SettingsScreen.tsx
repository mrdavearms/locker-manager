import { useState } from 'react'
import { Search } from 'lucide-react'
import { cn } from '@renderer/lib/cn'
import { useTerms } from '@renderer/lib/appContext'
import { CodesForm } from '@renderer/settings/CodesForm'
import { ComputerForm } from '@renderer/settings/ComputerForm'
import { GroupsForm } from '@renderer/settings/GroupsForm'
import { LabelsForm } from '@renderer/settings/LabelsForm'
import { LettersForm } from '@renderer/settings/LettersForm'
import { LocationsEditor } from '@renderer/settings/LocationsEditor'
import { LocksForm } from '@renderer/settings/LocksForm'
import { PrivacyForm } from '@renderer/settings/PrivacyForm'
import { SchoolForm } from '@renderer/settings/SchoolForm'
import { ShareSetupCard } from '@renderer/settings/ShareSetupCard'
import { StorageForm } from '@renderer/settings/StorageForm'
import { TermsForm } from '@renderer/settings/TermsForm'

type Tab =
  | 'school'
  | 'terms'
  | 'locations'
  | 'groups'
  | 'locks'
  | 'codes'
  | 'labels'
  | 'letters'
  | 'privacy'
  | 'storage'
  | 'computer'

/** SPEC.md section 7, grouped into tabs. More tabs arrive with later features. */
export type SettingsTab = Tab

export function SettingsScreen({ initialTab = 'school' }: { initialTab?: Tab }): React.JSX.Element {
  const terms = useTerms()
  const [tab, setTab] = useState<Tab>(initialTab)
  const [query, setQuery] = useState('')
  const tabs: { id: Tab; label: string }[] = [
    { id: 'school', label: 'School' },
    { id: 'terms', label: 'Words we use' },
    { id: 'locations', label: `${terms.area.many} and ${terms.locker.many.toLowerCase()}` },
    { id: 'groups', label: `${terms.yearLevel.many} and ${terms.group.many.toLowerCase()}` },
    { id: 'locks', label: 'Locks' },
    { id: 'codes', label: 'Lock codes' },
    { id: 'labels', label: 'Labels' },
    { id: 'letters', label: 'Letters' },
    { id: 'privacy', label: 'Privacy' },
    { id: 'storage', label: 'Storage' },
    { id: 'computer', label: 'This computer' }
  ]
  // What each tab covers, so a search finds the right one (SPEC.md 7: a search box).
  const words: Record<Tab, string> = {
    school: 'school name logo colours stripes address share set-up settings file other school',
    terms: `words names homeroom form group year level leader office ${terms.group.one}`,
    locations: 'areas banks lockers add build number renumber layout tiers accessible',
    groups: `year levels groups ${terms.group.many} display name codes placed last excluded students`,
    locks: 'locks kind type combination padlock keyed key dial built-in',
    codes: 'codes rules digits unique spares code set next year 0000',
    labels: 'labels sheets avery stock measure printer nudge calibration layout qr',
    letters: 'letters sections pictures images language translation words',
    privacy: 'pin privacy hide codes seconds security',
    storage: 'storage backups file folder location move size days editing lock',
    computer: 'appearance dark light text size zoom contrast updates beta'
  }
  const q = query.trim().toLowerCase()
  const shown = q
    ? tabs.filter((t) =>
        q.split(/\s+/).every((w) => `${t.label} ${words[t.id]}`.toLowerCase().includes(w))
      )
    : tabs
  return (
    <div className="w-full space-y-6 px-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-3xl font-semibold">Settings</h1>
        <label className="flex w-full max-w-xs items-center gap-2 rounded-xl border border-line-strong bg-surface px-3 py-2">
          <Search size={16} className="text-ink-muted" aria-hidden />
          <span className="sr-only">Search settings</span>
          <input
            className="w-full bg-transparent outline-none placeholder:text-ink-muted"
            placeholder="Search settings, for example PIN"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              const qq = e.target.value.trim().toLowerCase()
              const first = tabs.find(
                (t) =>
                  qq &&
                  qq
                    .split(/\s+/)
                    .every((w) => `${t.label} ${words[t.id]}`.toLowerCase().includes(w))
              )
              if (first) setTab(first.id)
            }}
            data-testid="settings-search"
          />
        </label>
      </div>
      <div
        role="tablist"
        aria-label="Settings"
        className="flex flex-wrap gap-1 rounded-2xl bg-surface-muted p-1"
      >
        {shown.map((t) => (
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
      {shown.length === 0 && (
        <p className="text-sm text-ink-muted">No settings match “{query}”. Try another word.</p>
      )}
      <div role="tabpanel">
        {tab === 'school' && (
          <div className="space-y-6">
            <SchoolForm />
            <ShareSetupCard />
          </div>
        )}
        {tab === 'terms' && <TermsForm />}
        {tab === 'locations' && <LocationsEditor />}
        {tab === 'groups' && <GroupsForm />}
        {tab === 'locks' && <LocksForm />}
        {tab === 'codes' && <CodesForm />}
        {tab === 'labels' && <LabelsForm />}
        {tab === 'letters' && <LettersForm />}
        {tab === 'privacy' && <PrivacyForm />}
        {tab === 'storage' && <StorageForm />}
        {tab === 'computer' && <ComputerForm />}
      </div>
    </div>
  )
}
