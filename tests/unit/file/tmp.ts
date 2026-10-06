import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach } from 'vitest'

const made: string[] = []

/** A fresh empty folder, removed after the test. */
export function tempDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'lockers-test-'))
  made.push(d)
  return d
}

afterEach(() => {
  while (made.length > 0) {
    const d = made.pop()
    if (d) rmSync(d, { recursive: true, force: true })
  }
})
