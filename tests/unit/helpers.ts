import type { OperatorContext } from '../../src/main/db/context'

/** A fixed operator and a clock that moves only when told to. */
export function testContext(
  start = '2026-10-06T09:12:00.000Z'
): OperatorContext & { advance: (ms: number) => void } {
  let t = new Date(start).getTime()
  return {
    operator: 'Test Operator',
    machine: 'TEST-PC',
    now: () => new Date(t),
    advance: (ms: number) => {
      t += ms
    }
  }
}
