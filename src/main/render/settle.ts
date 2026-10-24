// Waiting on a hidden render window, without waiting forever. A page whose process
// crashes, or a PDF that never comes back, would otherwise leave the app marked as
// busy printing, so the updater never restarts it and quitting has to wait.
// Electron-free so it can be tested on plain Node.

/** The part of webContents this needs: its crash event. */
export interface CrashSource {
  once(
    event: 'render-process-gone',
    listener: (e: unknown, details: { reason: string }) => void
  ): unknown
  off(
    event: 'render-process-gone',
    listener: (e: unknown, details: { reason: string }) => void
  ): unknown
}

/** Making a PDF or measuring letters; generous for 2,000 letters on a slow school laptop. */
export const RENDER_LIMIT_MS = 5 * 60 * 1000

/**
 * Resolves with `work`, or fails when the page crashes or `limitMs` passes first.
 * `limitMs` null means no time limit (a print dialog a person is still using).
 */
export function settleWithin<T>(
  work: Promise<T>,
  crashes: CrashSource,
  limitMs: number | null
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const gone = (_e: unknown, details: { reason: string }): void =>
      reject(
        new Error(
          `The hidden page used for printing stopped unexpectedly (${details.reason}). Please try again.`
        )
      )
    const timer =
      limitMs === null
        ? null
        : setTimeout(
            () =>
              reject(
                new Error(
                  'This took too long and was stopped. Please try again; if it keeps happening, restart Locker Manager.'
                )
              ),
            limitMs
          )
    crashes.once('render-process-gone', gone)
    work.then(resolve, reject).finally(() => {
      if (timer) clearTimeout(timer)
      crashes.off('render-process-gone', gone)
    })
  })
}
