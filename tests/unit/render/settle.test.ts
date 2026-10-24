import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { settleWithin } from '../../../src/main/render/settle'

afterEach(() => {
  vi.useRealTimers()
})

describe('settleWithin (hidden render windows never wait forever)', () => {
  it('passes the result through and stops listening', async () => {
    const wc = new EventEmitter()
    await expect(settleWithin(Promise.resolve(7), wc, 1000)).resolves.toBe(7)
    expect(wc.listenerCount('render-process-gone')).toBe(0)
  })

  it('passes a failure through', async () => {
    const wc = new EventEmitter()
    await expect(settleWithin(Promise.reject(new Error('no printer')), wc, 1000)).rejects.toThrow(
      'no printer'
    )
    expect(wc.listenerCount('render-process-gone')).toBe(0)
  })

  it('fails when the page crashes, even if the work never settles', async () => {
    const wc = new EventEmitter()
    const result = settleWithin(new Promise<never>(() => undefined), wc, null)
    wc.emit('render-process-gone', {}, { reason: 'crashed' })
    await expect(result).rejects.toThrow('stopped unexpectedly (crashed)')
  })

  it('fails after the time limit when the work never settles', async () => {
    vi.useFakeTimers()
    const wc = new EventEmitter()
    const result = settleWithin(new Promise<never>(() => undefined), wc, 5000)
    const caught = result.catch((e: unknown) => e)
    await vi.advanceTimersByTimeAsync(5001)
    expect(String(await caught)).toContain('took too long')
  })

  it('with no time limit, keeps waiting', async () => {
    vi.useFakeTimers()
    const wc = new EventEmitter()
    let settled = false
    void settleWithin(new Promise<never>(() => undefined), wc, null).finally(() => {
      settled = true
    })
    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000)
    expect(settled).toBe(false)
  })
})
