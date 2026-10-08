import { describe, expect, it } from 'vitest'
import { recordThenPrint } from '../../src/main/printFlow'

// Decision 15: anything with codes is recorded BEFORE it leaves the app, on paper too.

describe('printing straight to a printer records first', () => {
  it('records, then prints', async () => {
    const steps: string[] = []
    const r = await recordThenPrint({
      record: () => {
        steps.push('record')
        return { undo: () => steps.push('undo') }
      },
      print: async () => {
        steps.push('print')
        return { printed: true }
      }
    })
    expect(r).toEqual({ ok: true })
    expect(steps).toEqual(['record', 'print'])
  })

  it('prints nothing when the record is refused (for example the PIN has timed out)', async () => {
    let printed = false
    const r = await recordThenPrint({
      record: () => ({ refused: 'Enter the PIN to print codes.' }),
      print: async () => {
        printed = true
        return { printed: true }
      }
    })
    expect(printed).toBe(false)
    expect(r).toEqual({ ok: false, message: 'Enter the PIN to print codes. Nothing was printed.' })
  })

  it('a cancelled print notes that it was not printed', async () => {
    const steps: string[] = []
    const r = await recordThenPrint({
      record: () => ({ undo: () => steps.push('undo') }),
      print: async () => ({ printed: false, reason: 'cancelled' })
    })
    expect(r).toEqual({ ok: false, cancelled: true, message: '' })
    expect(steps).toEqual(['undo'])
  })

  it('a failed print says why, and a failing note does not hide it', async () => {
    const r = await recordThenPrint({
      record: () => ({
        undo: () => {
          throw new Error('read-only')
        }
      }),
      print: async () => {
        throw new Error('no printer')
      }
    })
    expect(r).toEqual({
      ok: false,
      cancelled: false,
      message: 'Printing did not finish: Error: no printer.'
    })
  })
})
