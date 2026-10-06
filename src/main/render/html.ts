/** Escapes text for HTML. Every name and value that reaches a page goes through this. */
export function esc(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!
  )
}

/** Millimetres with at most three decimals, for CSS. */
export function mm(n: number): string {
  return `${Math.round(n * 1000) / 1000}mm`
}
