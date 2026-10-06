import { useRef, useState } from 'react'
import { ImageUp, Trash2 } from 'lucide-react'
import { Banner } from '@renderer/components/Banner'
import { Button } from '@renderer/components/Button'
import { Field, SectionCard, TextInput } from '@renderer/components/Field'
import { useAction, useCanEdit } from '@renderer/lib/appContext'
import { prepareLogo } from '@renderer/lib/logoImage'
import { call, useRpc } from '@renderer/lib/rpc'

function ColourPicker({
  id,
  value,
  onChange,
  disabled
}: {
  id: string
  value: string | null
  onChange: (v: string | null) => void
  disabled: boolean
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <input
        id={id}
        type="color"
        disabled={disabled}
        value={value ?? '#0e4a57'}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        className="h-11 w-14 cursor-pointer rounded-xl border border-line-strong bg-surface p-1"
      />
      <span className="font-mono text-sm text-ink-muted">{value ?? 'not set'}</span>
      {value && !disabled && (
        <button className="text-sm text-ink-muted underline" onClick={() => onChange(null)}>
          clear
        </button>
      )}
    </div>
  )
}

export function SchoolForm(): React.JSX.Element {
  const { data: school } = useRpc('school.get', {})
  const canEdit = useCanEdit()
  const act = useAction()
  const fileInput = useRef<HTMLInputElement>(null)
  const monoInput = useRef<HTMLInputElement>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const [draft, setDraft] = useState<{ name: string; shortName: string; address: string } | null>(
    null
  )

  if (!school) return <SectionCard title="School details">Loading…</SectionCard>
  const d = draft ?? {
    name: school.name,
    shortName: school.shortName ?? '',
    address: school.address ?? ''
  }

  const saveText = (): Promise<unknown> =>
    act(async () => {
      await call('school.update', {
        name: d.name,
        shortName: d.shortName || null,
        address: d.address || null
      })
      setDraft(null)
    })

  const onLogo = async (file: File | undefined): Promise<void> => {
    if (!file) return
    await act(async () => {
      const p = await prepareLogo(file)
      await call('school.setLogo', { which: 'colour', bytes: p.bytes, type: p.type })
      await call('school.setLogo', { which: 'mono', bytes: p.mono, type: 'image/png' })
      setWarning(
        p.analysis.vanishesOnWhite
          ? 'This logo has light lettering on a see-through background, so it would vanish on white labels. A dark version has been made for labels; check it below.'
          : null
      )
    })
  }

  const onMono = async (file: File | undefined): Promise<void> => {
    if (!file) return
    await act(async () => {
      const p = await prepareLogo(file)
      await call('school.setLogo', { which: 'mono', bytes: p.bytes, type: p.type })
    })
  }

  return (
    <div className="space-y-6">
      <SectionCard
        title="School details"
        description="The name and look of your school on screen, labels and letters."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="School name" htmlFor="sf-name">
            <TextInput
              id="sf-name"
              disabled={!canEdit}
              value={d.name}
              maxLength={120}
              onChange={(e) => setDraft({ ...d, name: e.target.value })}
            />
          </Field>
          <Field
            label="Short name"
            hint="Used where space is tight, such as labels."
            htmlFor="sf-short"
          >
            <TextInput
              id="sf-short"
              disabled={!canEdit}
              value={d.shortName}
              maxLength={40}
              onChange={(e) => setDraft({ ...d, shortName: e.target.value })}
            />
          </Field>
          <div className="md:col-span-2">
            <Field label="Address (optional)" htmlFor="sf-address">
              <TextInput
                id="sf-address"
                disabled={!canEdit}
                value={d.address}
                maxLength={300}
                onChange={(e) => setDraft({ ...d, address: e.target.value })}
              />
            </Field>
          </div>
        </div>
        {draft && (
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDraft(null)}>
              Undo
            </Button>
            <Button onClick={() => void saveText()} disabled={d.name.trim().length === 0}>
              Save details
            </Button>
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Colours"
        description="Used for the letter header and stripes. Labels print in black."
      >
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Main colour" htmlFor="sf-primary">
            <ColourPicker
              id="sf-primary"
              disabled={!canEdit}
              value={school.colourPrimary}
              onChange={(v) => void act(() => call('school.update', { colourPrimary: v }))}
            />
          </Field>
          <Field label="Accent colour" htmlFor="sf-accent">
            <ColourPicker
              id="sf-accent"
              disabled={!canEdit}
              value={school.colourAccent}
              onChange={(v) => void act(() => call('school.update', { colourAccent: v }))}
            />
          </Field>
          <Field label="Stripe colours (up to three)" htmlFor="sf-stripe-0">
            <div className="flex flex-wrap gap-2">
              {[0, 1, 2].map((i) => (
                <input
                  key={i}
                  id={`sf-stripe-${i}`}
                  type="color"
                  disabled={!canEdit}
                  aria-label={`Stripe colour ${i + 1}`}
                  value={school.colourStripes[i] ?? '#cccccc'}
                  onChange={(e) => {
                    const next = [...school.colourStripes]
                    next[i] = e.target.value.toUpperCase()
                    void act(() =>
                      call('school.update', { colourStripes: next.filter(Boolean).slice(0, 3) })
                    )
                  }}
                  className="h-11 w-14 cursor-pointer rounded-xl border border-line-strong bg-surface p-1"
                />
              ))}
            </div>
          </Field>
        </div>
        {(school.colourPrimary || school.colourStripes.length > 0) && (
          <div
            className="mt-5 overflow-hidden rounded-xl border border-line"
            aria-label="Preview of the letter header"
          >
            <div
              className="flex h-14 items-center px-5 font-display text-lg font-semibold text-white"
              style={{ background: school.colourPrimary ?? '#0e4a57' }}
            >
              {school.name}
            </div>
            <div className="flex h-2">
              {school.colourStripes.map((c, i) => (
                <div key={i} className="flex-1" style={{ background: c }} />
              ))}
            </div>
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Logo"
        description="PNG, JPEG or SVG, up to 2 MB. A one-colour version is made for black-and-white labels."
      >
        {warning && (
          <div className="mb-4">
            <Banner tone="warn" title="Check the label version of your logo">
              {warning}
            </Banner>
          </div>
        )}
        <div className="grid gap-4 md:grid-cols-2">
          <figure className="rounded-2xl border border-line p-4">
            <figcaption className="text-sm font-semibold">Colour (screen and letters)</figcaption>
            <div className="mt-3 flex h-36 items-center justify-center rounded-xl bg-[repeating-conic-gradient(#e9e4d8_0_25%,#fffdf8_0_50%)] bg-[length:16px_16px]">
              {school.logoDataUrl ? (
                <img
                  src={school.logoDataUrl}
                  alt="School logo"
                  className="max-h-32 max-w-full object-contain"
                />
              ) : (
                <span className="text-sm text-ink-muted">No logo yet</span>
              )}
            </div>
          </figure>
          <figure className="rounded-2xl border border-line p-4">
            <figcaption className="text-sm font-semibold">
              One colour (labels), shown on white
            </figcaption>
            <div className="mt-3 flex h-36 items-center justify-center rounded-xl bg-white">
              {school.monoLogoDataUrl ? (
                <img
                  src={school.monoLogoDataUrl}
                  alt="One-colour school logo"
                  className="max-h-32 max-w-full object-contain"
                />
              ) : (
                <span className="text-sm text-[#56616b]">Made when you add a logo</span>
              )}
            </div>
          </figure>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <input
            ref={fileInput}
            type="file"
            accept="image/png,image/jpeg,image/svg+xml"
            className="hidden"
            onChange={(e) => void onLogo(e.target.files?.[0])}
          />
          <input
            ref={monoInput}
            type="file"
            accept="image/png,image/jpeg,image/svg+xml"
            className="hidden"
            onChange={(e) => void onMono(e.target.files?.[0])}
          />
          <Button disabled={!canEdit} onClick={() => fileInput.current?.click()}>
            <ImageUp size={18} aria-hidden /> {school.hasLogo ? 'Replace logo…' : 'Add logo…'}
          </Button>
          <Button
            variant="secondary"
            disabled={!canEdit || !school.hasLogo}
            onClick={() => monoInput.current?.click()}
          >
            Use my own one-colour logo…
          </Button>
          {school.hasLogo && (
            <Button
              variant="ghost"
              disabled={!canEdit}
              onClick={() =>
                void act(async () => {
                  await call('school.setLogo', { which: 'colour', bytes: null, type: null })
                  await call('school.setLogo', { which: 'mono', bytes: null, type: null })
                  setWarning(null)
                })
              }
            >
              <Trash2 size={16} aria-hidden /> Remove logo
            </Button>
          )}
        </div>
      </SectionCard>
    </div>
  )
}
