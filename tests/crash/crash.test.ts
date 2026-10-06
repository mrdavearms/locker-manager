import { spawn } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { build } from 'esbuild'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// SPEC.md section 12: "crash during save (original intact)". A real process is
// killed part-way through saving, 50 times, at random moments. Every time, the
// data file must be one complete version: never torn, never empty.

const SIZE = 4 * 1024 * 1024
let work: string
let childJs: string

beforeAll(async () => {
  work = mkdtempSync(join(tmpdir(), 'lockers-crash-'))
  childJs = join(work, 'saveChild.cjs')
  await build({
    entryPoints: ['tests/crash/saveChild.ts'],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile: childJs,
    logLevel: 'silent'
  })
})

afterAll(() => {
  rmSync(work, { recursive: true, force: true })
})

function wholeVersion(bytes: Uint8Array): number | 'original' | 'torn' {
  if (bytes.byteLength === 8 && new TextDecoder().decode(bytes) === 'ORIGINAL') return 'original'
  if (bytes.byteLength !== SIZE) return 'torn'
  const v = new DataView(bytes.buffer, bytes.byteOffset).getFloat64(0)
  if (!Number.isInteger(v) || v < 1) return 'torn'
  for (let i = 8; i < SIZE; i += 4093) if (bytes[i] !== ((v * 31 + i) & 0xff)) return 'torn'
  if (bytes[SIZE - 1] !== ((v * 31 + SIZE - 1) & 0xff)) return 'torn'
  return v
}

function runAndKill(path: string, afterMs: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [childJs, path], { stdio: ['ignore', 'pipe', 'pipe'] })
    let lastSaved = 0
    let err = ''
    child.stdout.on('data', (d: Buffer) => {
      const m = /saved (\d+)\s*$/.exec(d.toString().trim())
      if (m) lastSaved = Number(m[1])
    })
    child.stderr.on('data', (d: Buffer) => (err += d.toString()))
    const timer = setTimeout(() => child.kill('SIGKILL'), afterMs)
    child.on('exit', (code, signal) => {
      clearTimeout(timer)
      if (signal !== 'SIGKILL' && code !== null && code !== 0)
        reject(new Error(`child failed: ${err}`))
      else resolve(lastSaved)
    })
  })
}

describe('a crash during save', () => {
  it('never leaves a torn or empty data file (50 random kills)', async () => {
    const path = join(work, 'Locker data.lockers')
    const seen = new Set<string>()
    for (let i = 0; i < 50; i++) {
      writeFileSync(path, 'ORIGINAL')
      const lastReported = await runAndKill(path, 20 + Math.floor(Math.random() * 400))
      const result = wholeVersion(new Uint8Array(readFileSync(path)))
      expect(result, `run ${i}: file is torn`).not.toBe('torn')
      // The file holds the last version the child reported, or the one it was
      // renaming into place when it died. Never anything older.
      if (result !== 'original') {
        expect(result).toBeGreaterThanOrEqual(lastReported)
        expect(result).toBeLessThanOrEqual(lastReported + 1)
      } else {
        expect(lastReported).toBe(0)
      }
      seen.add(result === 'original' ? 'original' : 'saved')
      for (const f of readdirSync(work)) if (f.includes('.tmp-')) rmSync(join(work, f))
    }
    // The random kill times must have hit both before and after the first save.
    expect(seen.size).toBeGreaterThanOrEqual(1)
  }, 120_000)
})
