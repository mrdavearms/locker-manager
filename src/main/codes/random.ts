import { createHmac, randomInt } from 'node:crypto'

// Random numbers for codes (SPEC.md 4.6): the operating system's secure generator,
// or, for test sets that must regenerate identically, a deterministic stream from
// a stored seed (HMAC-SHA256 in counter mode).

export interface IntSource {
  /** A whole number from 0 to max - 1. */
  below(max: number): number
}

export const secureSource: IntSource = { below: (max) => randomInt(0, max) }

export function seededSource(seed: string): IntSource {
  let counter = 0
  let pool: Buffer = Buffer.alloc(0)
  const next32 = (): number => {
    if (pool.length < 4) {
      pool = Buffer.concat([pool, createHmac('sha256', seed).update(String(counter++)).digest()])
    }
    const v = pool.readUInt32BE(0)
    pool = pool.subarray(4)
    return v
  }
  return {
    below(max) {
      // Rejection sampling: no bias towards small numbers.
      const limit = Math.floor(0x1_0000_0000 / max) * max
      for (;;) {
        const v = next32()
        if (v < limit) return v % max
      }
    }
  }
}
