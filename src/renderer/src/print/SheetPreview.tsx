import { useEffect, useRef, useState } from 'react'

const PX_PER_MM = 96 / 25.4

/** A cheap fingerprint of a page, so a changed page gets a fresh frame. */
function fingerprint(html: string): string {
  let h = 0
  for (let i = 0; i < html.length; i += 7) h = (h * 31 + html.charCodeAt(i)) | 0
  return `${html.length}-${h}`
}

/**
 * Shows our own page HTML exactly as it will print, scaled to fit. The frame is
 * sandboxed with scripts off; the HTML is built in the main process with every
 * value escaped.
 */
export function SheetPreview({
  html,
  pageWidthMm,
  pageHeightMm,
  sheets,
  title
}: {
  html: string
  pageWidthMm: number
  pageHeightMm: number
  sheets: number
  title: string
}): React.JSX.Element {
  const box = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(600)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const pageW = pageWidthMm * PX_PER_MM
  const pageH = pageHeightMm * PX_PER_MM
  const scale = Math.min(1, width / pageW)
  const fullH = pageH * Math.max(1, sheets)
  return (
    <div ref={box} className="w-full min-w-0" aria-label={title}>
      <div
        className="overflow-hidden rounded-xl border border-line bg-white shadow-[var(--shadow-card)]"
        style={{ height: fullH * scale }}
      >
        {/* A new frame for each page: changing srcdoc in place left it blank. */}
        <iframe
          key={fingerprint(html)}
          title={title}
          sandbox=""
          srcDoc={html}
          style={{
            width: pageW,
            height: fullH,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            border: 0,
            background: '#fff'
          }}
        />
      </div>
    </div>
  )
}

/** One label, enlarged, cut from the sheet: for the layout designer. */
export function LabelZoom({
  html,
  left,
  top,
  labelW,
  labelH,
  pxPerMm,
  children
}: {
  html: string
  left: number
  top: number
  labelW: number
  labelH: number
  pxPerMm: number
  children?: React.ReactNode
}): React.JSX.Element {
  const s = pxPerMm / PX_PER_MM
  return (
    <div
      className="relative overflow-hidden rounded-lg bg-white shadow-[var(--shadow-lift)] ring-1 ring-line-strong"
      style={{ width: labelW * pxPerMm, height: labelH * pxPerMm }}
    >
      <iframe
        key={fingerprint(html)}
        title="Label layout"
        sandbox=""
        srcDoc={html}
        style={{
          position: 'absolute',
          left: -left * pxPerMm,
          top: -top * pxPerMm,
          width: 260 * PX_PER_MM,
          height: 320 * PX_PER_MM,
          transform: `scale(${s})`,
          transformOrigin: 'top left',
          border: 0,
          pointerEvents: 'none'
        }}
      />
      {children}
    </div>
  )
}
