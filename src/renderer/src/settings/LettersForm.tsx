import { useEffect, useRef, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ImagePlus,
  Info,
  Plus,
  RotateCcw,
  Trash2
} from 'lucide-react'
import {
  BLOCK_TEXT,
  BLOCK_TYPES,
  LETTER_IMAGE_TYPES,
  MAX_LETTER_IMAGE_BYTES,
  MERGE_FIELDS,
  SHOW_FOR,
  SHOW_FOR_TEXT,
  TONES,
  TONE_TEXT,
  type BlockType,
  type ImageView,
  type LetterBlock,
  type LetterPreview,
  type LetterTemplate
} from '@shared/letters'
import { Banner } from '@renderer/components/Banner'
import { Button } from '@renderer/components/Button'
import { Field, SectionCard, Select, TextInput, inputClass } from '@renderer/components/Field'
import { useAction, useCanEdit, useRevision, useTerms } from '@renderer/lib/appContext'
import { cn } from '@renderer/lib/cn'
import { call, useRpc } from '@renderer/lib/rpc'
import { SheetPreview } from '@renderer/print/SheetPreview'

// SPEC.md 5.2: the letter designer. A letter is a list of sections; the school
// chooses them and writes the words, and the app lays them out on one page.

function blockTitle(b: LetterBlock, lang: string, first: string): string {
  const heading = b.heading[lang] || b.heading[first] || ''
  if (b.type === 'text' && heading) return heading
  if (b.type === 'header' && heading) return `${BLOCK_TEXT.header}: ${heading}`
  return BLOCK_TEXT[b.type]
}

function newBlock(type: BlockType, lang: string, lockerWord: string): LetterBlock {
  return {
    id: crypto.randomUUID(),
    type,
    show: 'all',
    heading: { [lang]: type === 'text' ? 'New section' : type === 'header' ? 'Your locker' : '' },
    body: {
      [lang]:
        type === 'text'
          ? 'Write the words here.'
          : type === 'student'
            ? [lockerWord, 'Your code', 'Your key number', 'Bring your own padlock'].join('\n')
            : ''
    },
    tone: 'plain',
    imageId: null,
    imageSide: 'right',
    size: type === 'space' ? 6 : 60
  }
}

async function readPicture(file: File): Promise<{
  name: string
  mime: (typeof LETTER_IMAGE_TYPES)[number]
  bytes: Uint8Array<ArrayBuffer>
  width: number
  height: number
}> {
  const mime = LETTER_IMAGE_TYPES.find((t) => t === file.type)
  if (!mime) throw new Error('Pictures must be PNG, JPEG or SVG.')
  if (file.size > MAX_LETTER_IMAGE_BYTES)
    throw new Error('That picture is over 3 MB. Use a smaller one.')
  const bytes = new Uint8Array(await file.arrayBuffer())
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }))
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = () => reject(new Error('That picture could not be read.'))
      i.src = url
    })
    return {
      name: file.name,
      mime,
      bytes,
      width: img.naturalWidth || 800,
      height: img.naturalHeight || 600
    }
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** The two rules every school should know before changing the letter. */
export function HowLettersWork(): React.JSX.Element {
  return (
    <section className="card flex gap-4 p-6" data-testid="letters-how">
      <Info size={22} className="mt-0.5 shrink-0 text-brand" aria-hidden />
      <div className="space-y-3 text-sm">
        <h2 className="text-xl font-semibold">How letters work</h2>
        <p>
          <strong>A letter is built from sections</strong>, top to bottom: a heading band, a colour
          stripe, the student’s name, locker and code, then blocks of words and pictures. You choose
          the sections and write the words. The app does the layout.
        </p>
        <p>
          This is on purpose. It keeps <strong>every letter to exactly one page</strong>, so each
          student’s letter comes off the printer on its own sheet. If any letter would run onto a
          second page, the app names it and prints nothing until you shorten the words or make a
          picture smaller.
        </p>
        <p>
          <strong>
            Letters show lock codes, so they print only while the file is open for editing.
          </strong>{' '}
          Every code that is printed is recorded in the history with your name. If someone else is
          editing, wait until they close the file.
        </p>
      </div>
    </section>
  )
}

function PicturesCard({ images }: { images: ImageView[] }): React.JSX.Element {
  const act = useAction()
  const canEdit = useCanEdit()
  const input = useRef<HTMLInputElement>(null)
  return (
    <SectionCard
      title="Pictures"
      description="Add your own pictures, such as the steps from your lock maker’s instructions. The app comes with no pictures of its own. Add a picture to a section below."
      actions={
        <>
          <input
            ref={input}
            type="file"
            accept={LETTER_IMAGE_TYPES.join(',')}
            className="hidden"
            data-testid="letter-picture-input"
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (f)
                void act(async () => {
                  const p = await readPicture(f)
                  await call('letters.images.add', p)
                })
            }}
          />
          <Button variant="secondary" disabled={!canEdit} onClick={() => input.current?.click()}>
            <ImagePlus size={17} aria-hidden /> Add a picture…
          </Button>
        </>
      }
    >
      {images.length === 0 ? (
        <p className="text-sm text-ink-muted">No pictures yet.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {images.map((i) => (
            <li key={i.id} className="flex items-center gap-3 rounded-xl border border-line p-2">
              <img src={i.dataUrl} alt="" className="size-14 rounded-lg bg-white object-contain" />
              <span className="min-w-0 flex-1 truncate text-sm">{i.name}</span>
              <button
                className="rounded-lg p-1.5 text-ink-muted hover:bg-surface-muted"
                aria-label={`Remove ${i.name}`}
                disabled={!canEdit}
                onClick={() => void act(() => call('letters.images.delete', { id: i.id }))}
              >
                <Trash2 size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  )
}

function LanguagesEditor({
  t,
  onChange
}: {
  t: LetterTemplate
  onChange: (t: LetterTemplate) => void
}): React.JSX.Element {
  const canEdit = useCanEdit()
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const valid = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(code) && name.trim() !== ''
  return (
    <div>
      <p className="text-sm font-semibold">Languages</p>
      <p className="mt-1 text-xs text-ink-muted">
        The same letter in more than one language. Words you have not translated fall back to{' '}
        {t.languages[0]?.name}.
      </p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {t.languages.map((l, i) => (
          <li
            key={l.code}
            className="inline-flex items-center gap-2 rounded-full border border-line px-3 py-1 text-sm"
          >
            {l.name} <span className="text-ink-muted">{l.code}</span>
            {i > 0 && (
              <button
                aria-label={`Remove ${l.name}`}
                disabled={!canEdit}
                className="text-ink-muted hover:text-bad"
                onClick={() =>
                  onChange({ ...t, languages: t.languages.filter((x) => x.code !== l.code) })
                }
              >
                <Trash2 size={14} />
              </button>
            )}
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <Field label="Language name" htmlFor="lang-name">
          <TextInput
            id="lang-name"
            value={name}
            placeholder="For example Tiếng Việt"
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label="Short code" htmlFor="lang-code">
          <TextInput
            id="lang-code"
            className="w-36"
            placeholder="vi, ar, zh-Hans"
            value={code}
            onChange={(e) => setCode(e.target.value.trim())}
          />
        </Field>
        <Button
          variant="secondary"
          disabled={!canEdit || !valid || t.languages.some((l) => l.code === code)}
          onClick={() => {
            onChange({ ...t, languages: [...t.languages, { code, name: name.trim() }] })
            setCode('')
            setName('')
          }}
        >
          <Plus size={16} aria-hidden /> Add
        </Button>
      </div>
    </div>
  )
}

function BlockEditor({
  block,
  lang,
  images,
  onChange
}: {
  block: LetterBlock
  lang: string
  images: ImageView[]
  onChange: (b: LetterBlock) => void
}): React.JSX.Element {
  const terms = useTerms()
  const area = useRef<HTMLTextAreaElement>(null)
  const heading = block.heading[lang] ?? ''
  const body = block.body[lang] ?? ''
  const setHeading = (v: string): void =>
    onChange({ ...block, heading: { ...block.heading, [lang]: v } })
  const setBody = (v: string): void => onChange({ ...block, body: { ...block.body, [lang]: v } })
  const insert = (field: string): void => {
    const el = area.current
    const at = el ? el.selectionStart : body.length
    const end = el ? el.selectionEnd : body.length
    setBody(`${body.slice(0, at)}{${field}}${body.slice(end)}`)
  }
  const showFor = (
    <Field label="Show this section for" htmlFor="blk-show">
      <Select
        id="blk-show"
        value={block.show}
        onChange={(e) => onChange({ ...block, show: e.target.value as LetterBlock['show'] })}
      >
        {SHOW_FOR.map((s) => (
          <option key={s} value={s}>
            {SHOW_FOR_TEXT[s]}
          </option>
        ))}
      </Select>
    </Field>
  )
  const picture = (
    <div className="grid gap-3 sm:grid-cols-3">
      <Field label="Picture" htmlFor="blk-img">
        <Select
          id="blk-img"
          value={block.imageId ?? ''}
          onChange={(e) => onChange({ ...block, imageId: e.target.value || null })}
        >
          <option value="">None</option>
          {images.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </Select>
      </Field>
      {block.type === 'text' && (
        <Field label="Picture side" htmlFor="blk-side">
          <Select
            id="blk-side"
            value={block.imageSide}
            onChange={(e) =>
              onChange({ ...block, imageSide: e.target.value as LetterBlock['imageSide'] })
            }
          >
            <option value="right">Right</option>
            <option value="left">Left</option>
          </Select>
        </Field>
      )}
      <Field label="Picture width (mm)" htmlFor="blk-size">
        <TextInput
          id="blk-size"
          inputMode="decimal"
          value={String(block.size)}
          onChange={(e) => {
            const n = Number(e.target.value)
            if (Number.isFinite(n)) onChange({ ...block, size: Math.min(180, Math.max(2, n)) })
          }}
        />
      </Field>
    </div>
  )

  switch (block.type) {
    case 'header':
      return (
        <div className="space-y-4">
          <p className="text-sm text-ink-muted">
            A band in your school colour with your logo and school name. Change the colour and logo
            in Settings, School.
          </p>
          <Field label="Title" htmlFor="blk-h">
            <TextInput id="blk-h" value={heading} onChange={(e) => setHeading(e.target.value)} />
          </Field>
          <Field label="Line under the title (optional)" htmlFor="blk-b">
            <TextInput id="blk-b" value={body} onChange={(e) => setBody(e.target.value)} />
          </Field>
        </div>
      )
    case 'stripe':
      return (
        <p className="text-sm text-ink-muted">
          Thin bands in your school’s stripe colours, set in Settings, School.
        </p>
      )
    case 'student': {
      const lines = body.split('\n')
      const setLine = (i: number, v: string): void => {
        const next = [0, 1, 2, 3].map((n) => (n === i ? v : (lines[n] ?? '')))
        setBody(next.join('\n'))
      }
      return (
        <div className="space-y-4">
          <p className="text-sm text-ink-muted">
            The student’s name, {terms.group.one.toLowerCase()} and {terms.locker.one.toLowerCase()}{' '}
            number, with their code in boxes, their key number, or a note about bringing a padlock.
            These are the small words around them.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              `Word for ${terms.locker.one.toLowerCase()}`,
              'Label above the code',
              'Label above a key number',
              'Words when there is no school lock'
            ].map((label, i) => (
              <Field key={label} label={label} htmlFor={`blk-l${i}`}>
                <TextInput
                  id={`blk-l${i}`}
                  value={lines[i] ?? ''}
                  onChange={(e) => setLine(i, e.target.value)}
                />
              </Field>
            ))}
          </div>
        </div>
      )
    }
    case 'space':
      return (
        <Field label="Height (mm)" htmlFor="blk-size">
          <TextInput
            id="blk-size"
            inputMode="decimal"
            value={String(block.size)}
            onChange={(e) => {
              const n = Number(e.target.value)
              if (Number.isFinite(n)) onChange({ ...block, size: Math.min(180, Math.max(2, n)) })
            }}
          />
        </Field>
      )
    case 'image':
      return (
        <div className="space-y-4">
          {showFor}
          {picture}
        </div>
      )
    case 'text':
      return (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {showFor}
            <Field label="Look" htmlFor="blk-tone">
              <Select
                id="blk-tone"
                value={block.tone}
                onChange={(e) =>
                  onChange({ ...block, tone: e.target.value as LetterBlock['tone'] })
                }
              >
                {TONES.map((t) => (
                  <option key={t} value={t}>
                    {TONE_TEXT[t]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Heading" htmlFor="blk-h">
            <TextInput id="blk-h" value={heading} onChange={(e) => setHeading(e.target.value)} />
          </Field>
          <Field
            label="Words"
            htmlFor="blk-b"
            hint="A blank line starts a new paragraph. Start a line with - for a bullet point or 1. for a step. Put **two stars** around words to make them bold."
          >
            <textarea
              id="blk-b"
              ref={area}
              rows={7}
              className={cn(inputClass, 'font-[inherit] leading-relaxed')}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              data-testid="letter-block-body"
            />
          </Field>
          <div>
            <p className="text-xs font-semibold text-ink-muted">
              Put in a detail for each student:
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {MERGE_FIELDS.map(([f, label]) => (
                <button
                  key={f}
                  type="button"
                  title={label}
                  onClick={() => insert(f)}
                  className="rounded-full border border-line px-2.5 py-1 text-xs hover:bg-surface-muted"
                >
                  {label.replace(/ \(.*\)$/, '')}
                </button>
              ))}
            </div>
          </div>
          {picture}
        </div>
      )
  }
}

function Designer({
  saved,
  images
}: {
  saved: LetterTemplate
  images: ImageView[]
}): React.JSX.Element {
  const act = useAction()
  const canEdit = useCanEdit()
  const terms = useTerms()
  const revision = useRevision()
  const [draft, setDraft] = useState<LetterTemplate | null>(null)
  const t = draft ?? saved
  const [selected, setSelected] = useState<string>(t.blocks[2]?.id ?? t.blocks[0]?.id ?? '')
  const [lang, setLang] = useState(t.languages[0]?.code ?? 'en')
  const [preview, setPreview] = useState<LetterPreview | null>(null)
  const [check, setCheck] = useState<{ key: string; overflow: string[] } | null>(null)
  const first = t.languages[0]?.code ?? 'en'
  const editLang = t.languages.some((l) => l.code === lang) ? lang : first
  const block = t.blocks.find((b) => b.id === selected) ?? null
  const update = (next: LetterTemplate): void => setDraft(next)
  const setBlock = (b: LetterBlock): void =>
    update({ ...t, blocks: t.blocks.map((x) => (x.id === b.id ? b : x)) })
  const move = (id: string, by: number): void => {
    const i = t.blocks.findIndex((b) => b.id === id)
    const j = i + by
    if (i < 0 || j < 0 || j >= t.blocks.length) return
    const blocks = [...t.blocks]
    ;[blocks[i], blocks[j]] = [blocks[j]!, blocks[i]!]
    update({ ...t, blocks })
  }

  const key = JSON.stringify([t, editLang, revision])
  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(() => {
      const [tpl, lg] = JSON.parse(key) as [LetterTemplate, string]
      void window.api
        .rpc('letters.preview', {
          selection: { mode: 'all' },
          language: { kind: 'one', code: lg },
          index: 0,
          template: tpl
        })
        .then((r) => {
          if (!cancelled && r.ok) setPreview(r.value)
        })
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [key])

  return (
    <SectionCard
      title="The letter"
      description="Click a section to change it. Changes show in the preview straight away; nothing is kept until you click Save."
      actions={
        <Button
          variant="ghost"
          disabled={!canEdit}
          onClick={() =>
            void act(async () => {
              await call('letters.template.reset', {})
              setDraft(null)
            })
          }
        >
          <RotateCcw size={16} aria-hidden /> Start again from the standard letter
        </Button>
      }
    >
      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Paper" htmlFor="tpl-page">
          <Select
            id="tpl-page"
            value={t.pageSize}
            onChange={(e) =>
              update({ ...t, pageSize: e.target.value as LetterTemplate['pageSize'] })
            }
          >
            <option value="A4">A4</option>
            <option value="Letter">US Letter</option>
          </Select>
        </Field>
        <Field label="Colour" htmlFor="tpl-colour">
          <Select
            id="tpl-colour"
            value={t.colour}
            onChange={(e) => update({ ...t, colour: e.target.value as LetterTemplate['colour'] })}
          >
            <option value="colour">Colour</option>
            <option value="mono">Black and white</option>
          </Select>
        </Field>
        <label className="flex items-center gap-2 self-end pb-3 text-sm">
          <input
            type="checkbox"
            checked={t.usePreferredName}
            onChange={(e) => update({ ...t, usePreferredName: e.target.checked })}
          />
          Use preferred names
        </label>
      </div>
      <div className="mt-5">
        <LanguagesEditor t={t} onChange={update} />
      </div>

      {t.languages.length > 1 && (
        <div
          className="mt-6 flex flex-wrap items-center gap-2"
          role="tablist"
          aria-label="Words in"
        >
          <span className="text-sm font-semibold">Words in:</span>
          {t.languages.map((l) => (
            <button
              key={l.code}
              role="tab"
              aria-selected={editLang === l.code}
              onClick={() => setLang(l.code)}
              className={cn(
                'rounded-full px-3 py-1 text-sm',
                editLang === l.code ? 'bg-panel text-on-panel' : 'border border-line'
              )}
            >
              {l.name}
            </button>
          ))}
        </div>
      )}

      <div className="mt-6 grid items-start gap-6 xl:grid-cols-[16rem_minmax(0,1fr)_minmax(0,22rem)]">
        <div>
          <ol className="space-y-1" aria-label="Sections, top to bottom">
            {t.blocks.map((b, i) => (
              <li key={b.id} className="flex items-center gap-1">
                <button
                  onClick={() => setSelected(b.id)}
                  className={cn(
                    'min-w-0 flex-1 truncate rounded-lg px-3 py-2 text-left text-sm',
                    b.id === selected ? 'bg-panel text-on-panel' : 'hover:bg-surface-muted'
                  )}
                >
                  {blockTitle(b, editLang, first)}
                  {b.show !== 'all' && (
                    <span className="block truncate text-xs opacity-75">
                      {SHOW_FOR_TEXT[b.show]}
                    </span>
                  )}
                </button>
                <button
                  aria-label="Move up"
                  disabled={i === 0}
                  onClick={() => move(b.id, -1)}
                  className="rounded p-1 text-ink-muted hover:bg-surface-muted disabled:opacity-30"
                >
                  <ArrowUp size={14} />
                </button>
                <button
                  aria-label="Move down"
                  disabled={i === t.blocks.length - 1}
                  onClick={() => move(b.id, 1)}
                  className="rounded p-1 text-ink-muted hover:bg-surface-muted disabled:opacity-30"
                >
                  <ArrowDown size={14} />
                </button>
              </li>
            ))}
          </ol>
          <div className="mt-3">
            <Select
              aria-label="Add a section"
              value=""
              data-testid="letter-add-section"
              onChange={(e) => {
                const type = e.target.value as BlockType
                if (!type) return
                const b = newBlock(type, editLang, terms.locker.one)
                update({ ...t, blocks: [...t.blocks, b] })
                setSelected(b.id)
              }}
            >
              <option value="">Add a section…</option>
              {BLOCK_TYPES.map((type) => (
                <option key={type} value={type}>
                  {BLOCK_TEXT[type]}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="min-w-0">
          {block ? (
            <>
              <BlockEditor block={block} lang={editLang} images={images} onChange={setBlock} />
              <div className="mt-4">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    update({ ...t, blocks: t.blocks.filter((b) => b.id !== block.id) })
                    setSelected('')
                  }}
                >
                  <Trash2 size={15} aria-hidden /> Remove this section
                </Button>
              </div>
            </>
          ) : (
            <p className="text-sm text-ink-muted">Choose a section to change it.</p>
          )}
        </div>

        <div className="min-w-0 space-y-3">
          {preview && preview.letters > 0 ? (
            <SheetPreview
              html={preview.html}
              pageWidthMm={preview.pageWidth}
              pageHeightMm={preview.pageHeight}
              sheets={1.06}
              title="Letter preview"
            />
          ) : (
            <p className="rounded-xl bg-surface-muted p-4 text-sm text-ink-muted">
              The preview uses the first student with a {terms.locker.one.toLowerCase()}. Give out{' '}
              {terms.locker.many.toLowerCase()} to see one.
            </p>
          )}
          <Button
            size="sm"
            variant="secondary"
            disabled={!preview || preview.letters === 0}
            data-testid="letters-check"
            onClick={() =>
              void act(async () => {
                const r = await window.api.lettersCheck({
                  selection: { mode: 'all' },
                  language: { kind: 'each' },
                  template: t
                })
                setCheck({ key, overflow: r.overflow })
              })
            }
          >
            <CheckCircle2 size={15} aria-hidden /> Check every letter fits
          </Button>
          {check && check.key === key && (
            <p
              className={cn('text-sm', check.overflow.length ? 'text-bad' : 'text-good')}
              data-testid="letters-check-result"
            >
              {check.overflow.length === 0
                ? 'Every letter fits on one page.'
                : `Too long for one page: ${check.overflow.slice(0, 5).join(', ')}${check.overflow.length > 5 ? ' and others' : ''}.`}
            </p>
          )}
        </div>
      </div>

      {draft && (
        <div className="sticky bottom-4 mt-6 flex justify-end gap-2 rounded-2xl bg-surface/95 p-3 shadow-[var(--shadow-lift)]">
          <Button variant="secondary" onClick={() => setDraft(null)}>
            Undo my changes
          </Button>
          <Button
            disabled={!canEdit}
            data-testid="letters-save-template"
            onClick={() =>
              void act(async () => {
                await call('letters.template.set', { template: draft })
                setDraft(null)
              })
            }
          >
            Save the letter
          </Button>
        </div>
      )}
    </SectionCard>
  )
}

export function LettersForm(): React.JSX.Element {
  const canEdit = useCanEdit()
  const { data: template } = useRpc('letters.template.get', {})
  const { data: images } = useRpc('letters.images.list', {})
  return (
    <div className="space-y-6">
      <HowLettersWork />
      {!template || !images ? (
        <SectionCard title="The letter">Loading…</SectionCard>
      ) : (
        <Designer key={JSON.stringify(template)} saved={template} images={images} />
      )}
      {images && <PicturesCard images={images} />}
      {!canEdit && (
        <Banner tone="info" title="Read-only">
          The file is open read-only, so the letter cannot be changed from this computer now.
        </Banner>
      )}
    </div>
  )
}
