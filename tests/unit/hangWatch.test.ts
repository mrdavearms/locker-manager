import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { watchForHang, type HangActions } from '../../src/main/hangWatch'

function setup(answer: () => Promise<'reload' | 'wait'>): {
  win: EventEmitter
  actions: HangActions & { signals: AbortSignal[] }
} {
  const win = new EventEmitter()
  const signals: AbortSignal[] = []
  const actions = {
    signals,
    ask: vi.fn((signal: AbortSignal) => {
      signals.push(signal)
      return answer()
    }),
    reload: vi.fn(),
    log: vi.fn()
  }
  watchForHang(win, actions)
  return { win, actions }
}

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

describe('watchForHang (a frozen window can be reloaded)', () => {
  it('reloads when the person chooses Reload', async () => {
    const { win, actions } = setup(() => Promise.resolve('reload'))
    win.emit('unresponsive')
    await tick()
    expect(actions.reload).toHaveBeenCalledTimes(1)
  })

  it('does nothing when the person chooses Wait', async () => {
    const { win, actions } = setup(() => Promise.resolve('wait'))
    win.emit('unresponsive')
    await tick()
    expect(actions.reload).not.toHaveBeenCalled()
  })

  it('asks only once while the question is open', async () => {
    const { win, actions } = setup(() => new Promise(() => undefined))
    win.emit('unresponsive')
    win.emit('unresponsive')
    win.emit('unresponsive')
    expect(actions.ask).toHaveBeenCalledTimes(1)
  })

  it('closes the question when the window recovers, and never reloads late', async () => {
    let answer: (a: 'reload') => void = () => undefined
    const { win, actions } = setup(() => new Promise((r) => (answer = r)))
    win.emit('unresponsive')
    win.emit('responsive')
    expect(actions.signals[0]?.aborted).toBe(true)
    answer('reload')
    await tick()
    expect(actions.reload).not.toHaveBeenCalled()
  })

  it('asks again if the window freezes again later', async () => {
    const { win, actions } = setup(() => Promise.resolve('wait'))
    win.emit('unresponsive')
    await tick()
    win.emit('unresponsive')
    await tick()
    expect(actions.ask).toHaveBeenCalledTimes(2)
  })
})
