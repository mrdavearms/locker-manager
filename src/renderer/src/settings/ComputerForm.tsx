import { Lock } from 'lucide-react'
import { TEXT_SIZES, type ComputerSettings, type ComputerView } from '@shared/computer'
import { Banner } from '@renderer/components/Banner'
import { SectionCard } from '@renderer/components/Field'
import { cn } from '@renderer/lib/cn'
import { useComputer } from '@renderer/lib/useComputer'

function Choice<T extends string | number>({
  label,
  value,
  options,
  locked,
  onPick,
  testId
}: {
  label: string
  value: T
  options: [T, string][]
  locked?: boolean
  onPick: (v: T) => void
  testId?: string
}): React.JSX.Element {
  return (
    <fieldset className="space-y-2" data-testid={testId}>
      <legend className="flex items-center gap-2 text-sm font-semibold">
        {label}
        {locked && (
          <span className="inline-flex items-center gap-1 rounded-full bg-surface-muted px-2 py-0.5 text-xs font-normal text-ink-muted">
            <Lock size={12} aria-hidden /> Set by your IT team
          </span>
        )}
      </legend>
      <div className="flex flex-wrap gap-2">
        {options.map(([v, text]) => (
          <button
            key={String(v)}
            type="button"
            disabled={locked}
            aria-pressed={v === value}
            onClick={() => onPick(v)}
            className={cn(
              'rounded-xl border px-4 py-2 text-sm font-semibold disabled:opacity-60',
              v === value
                ? 'border-panel bg-panel text-on-panel'
                : 'border-line-strong hover:bg-surface-muted'
            )}
          >
            {text}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

/** Settings that belong to this computer only (SPEC.md 7, items 14 and 15). */
export function ComputerForm(): React.JSX.Element {
  const view: ComputerView | null = useComputer()
  if (!view) return <SectionCard title="This computer">Loading…</SectionCard>
  const s = view.settings
  const set = (patch: Partial<ComputerSettings>): void => void window.api.setComputer(patch)
  return (
    <div className="space-y-6">
      {view.managedProblem && (
        <Banner tone="warn" title="Your IT team’s settings file has a problem">
          {view.managedProblem} ({view.managedPath})
        </Banner>
      )}
      <SectionCard
        title="Appearance"
        description="Only on this computer. Everyone else keeps their own."
      >
        <div className="space-y-5">
          <Choice
            label="Light or dark"
            value={s.theme}
            options={[
              ['system', 'Same as this computer'],
              ['light', 'Light'],
              ['dark', 'Dark']
            ]}
            onPick={(theme) => set({ theme })}
            testId="theme"
          />
          <Choice
            label="Text size"
            value={s.textSize}
            options={TEXT_SIZES.map((n) => [n, `${n}%`] as [typeof n, string])}
            onPick={(textSize) => set({ textSize })}
            testId="text-size"
          />
          <Choice
            label="Contrast"
            value={s.contrast}
            options={[
              ['normal', 'Normal'],
              ['high', 'High']
            ]}
            onPick={(contrast) => set({ contrast })}
            testId="contrast"
          />
        </div>
      </SectionCard>
      <SectionCard title="Updates" description="Updates come from the app’s GitHub page.">
        <div className="space-y-5">
          <Choice
            label="Install updates by themselves"
            value={s.autoUpdate ? 'on' : 'off'}
            locked={view.managed.autoUpdate !== undefined}
            options={[
              ['on', 'Yes, when the app is closed'],
              ['off', 'No, tell me and I will download it']
            ]}
            onPick={(v) => set({ autoUpdate: v === 'on' })}
          />
          <Choice
            label="Which updates"
            value={s.channel}
            locked={view.managed.updateChannel !== undefined}
            options={[
              ['stable', 'Finished versions (recommended)'],
              ['beta', 'Test versions too']
            ]}
            onPick={(channel) => set({ channel })}
          />
          <p className="text-xs text-ink-muted">
            On a Mac, the app installs updates itself while it is in the Applications folder. Test
            versions arrive first and may have problems; use them only if you are helping to test.
          </p>
        </div>
      </SectionCard>
    </div>
  )
}
