import type { WebContents } from 'electron'

// The hidden windows that measure and print our pages show only the page they were
// given. A crafted data file could otherwise slip in markup (a meta refresh, say)
// that sends the window to a web page; a Content-Security-Policy does not stop
// navigation, so these handlers do.

/** Stops the window going anywhere else, by link, refresh or redirect. */
export function guardRenderContents(contents: Pick<WebContents, 'on'>): void {
  const stop = (event: { preventDefault: () => void }): void => event.preventDefault()
  contents.on('will-navigate', stop)
  contents.on('will-redirect', stop)
  contents.on('will-frame-navigate', stop)
}

/** Only the page's own temporary file and the data addresses inside it may load. */
export function renderRequestAllowed(url: string): boolean {
  return url.startsWith('file:') || url.startsWith('data:')
}
