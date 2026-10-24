// A window whose code stops answering never triggers 'render-process-gone', so the
// crash reload in window.ts never runs and staff are left with a frozen window.
// This asks once, closes the question if the window recovers, and on Reload stops
// the window's process so the crash handler reloads it. Electron-free for tests.

export interface HangSource {
  on(event: 'unresponsive' | 'responsive', listener: () => void): unknown
}

export interface HangActions {
  /** Shows the question; resolves 'reload' or 'wait'. Aborted when the window recovers. */
  ask(signal: AbortSignal): Promise<'reload' | 'wait'>
  /** Stops the window's process (the crash handler then reloads it). */
  reload(): void
  log(message: string): void
}

export function watchForHang(win: HangSource, actions: HangActions): void {
  let asking: AbortController | null = null
  win.on('unresponsive', () => {
    actions.log('window not responding')
    if (asking) return
    const controller = new AbortController()
    asking = controller
    actions
      .ask(controller.signal)
      .then((answer) => {
        if (answer === 'reload' && !controller.signal.aborted) actions.reload()
      })
      .catch(() => undefined)
      .finally(() => {
        if (asking === controller) asking = null
      })
  })
  win.on('responsive', () => {
    actions.log('window responding again')
    asking?.abort()
    asking = null
  })
}
