/** Escapes text for HTML. Every name and value that reaches a page goes through this. */
export function esc(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!
  )
}

/**
 * Picture types that may go into a page. The app itself makes PNG, JPEG and SVG; a
 * type read from a file is never trusted, because it is written into HTML and CSS.
 */
export const PAGE_IMAGE_TYPES: readonly string[] = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/svg+xml'
]

/** A data address for a picture, or null when its type is not an allowed picture type. */
export function imageDataUrl(bytes: Uint8Array | null, type: string | null): string | null {
  if (!bytes || !type || !PAGE_IMAGE_TYPES.includes(type)) return null
  return `data:${type};base64,${Buffer.from(bytes).toString('base64')}`
}

const SAFE_IMAGE_URL = /^data:image\/(?:png|jpeg|gif|webp|svg\+xml);base64,[A-Za-z0-9+/]*={0,2}$/

/** The address itself if it is a plain base64 picture, else null. Checked again at the page. */
export function safeImageUrl(url: string | null | undefined): string | null {
  return url && SAFE_IMAGE_URL.test(url) ? url : null
}

/**
 * The DEMO mark (SPEC.md 4.1): a pale diagonal word over each label, letter or report
 * page from the demo school, so a demo printout is never mistaken for a real one.
 * `size` is the CSS font size; the parent needs `position: relative` or absolute.
 */
export function demoMarkCss(size: string, position: 'absolute' | 'fixed' = 'absolute'): string {
  return `.demo-mark{position:${position};inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:9;font-family:LMArimo,Arial,sans-serif;font-size:${size};font-weight:700;letter-spacing:.08em;line-height:1;color:rgba(0,0,0,.16);transform:rotate(-24deg)}`
}

export const DEMO_MARK = '<div class="demo-mark" aria-hidden="true">DEMO</div>'

/** Millimetres with at most three decimals, for CSS. */
export function mm(n: number): string {
  return `${Math.round(n * 1000) / 1000}mm`
}
