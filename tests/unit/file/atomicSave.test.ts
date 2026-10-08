import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { saveAtomically, SaveFailedError } from '../../../src/main/file/atomicSave'
import { nodeFs } from '../../../src/main/file/fsPort'
import { sha256 } from '../../../src/main/file/hash'
import { faultyFs } from './faultyFs'
import { tempDir } from './tmp'

const enc = (s: string): Uint8Array => new TextEncoder().encode(s)
let n = 0
const suffix = (): string => `t${++n}`
const noSleep = async (): Promise<void> => {}

function setup(original = 'ORIGINAL VERSION') {
  const dir = tempDir()
  const path = join(dir, 'Locker data.lockers')
  writeFileSync(path, original)
  return { dir, path, hash: sha256(enc(original)) }
}

function onlyDataFile(dir: string): void {
  expect(readdirSync(dir).filter((f) => f.includes('.tmp-'))).toEqual([])
}

describe('saveAtomically', () => {
  it('replaces the file and returns the new hash', async () => {
    const { dir, path, hash } = setup()
    const out = await saveAtomically({
      fs: nodeFs,
      path,
      bytes: enc('NEW VERSION'),
      expectedHash: hash,
      randomSuffix: suffix
    })
    expect(out.kind).toBe('saved')
    expect(readFileSync(path, 'utf8')).toBe('NEW VERSION')
    if (out.kind === 'saved') expect(out.hash).toBe(sha256(enc('NEW VERSION')))
    onlyDataFile(dir)
  })

  it('creates a new file when none is expected', async () => {
    const dir = tempDir()
    const path = join(dir, 'New.lockers')
    const out = await saveAtomically({
      fs: nodeFs,
      path,
      bytes: enc('FIRST'),
      expectedHash: null,
      randomSuffix: suffix
    })
    expect(out.kind).toBe('saved')
    expect(readFileSync(path, 'utf8')).toBe('FIRST')
  })

  it('refuses to create over an existing file', async () => {
    const { path } = setup()
    const out = await saveAtomically({
      fs: nodeFs,
      path,
      bytes: enc('X'),
      expectedHash: null,
      randomSuffix: suffix
    })
    expect(out.kind).toBe('conflict')
    expect(readFileSync(path, 'utf8')).toBe('ORIGINAL VERSION')
  })

  it('reports a conflict, and writes nothing, when someone else changed the file', async () => {
    const { dir, path, hash } = setup()
    writeFileSync(path, 'SOMEONE ELSE SAVED')
    const out = await saveAtomically({
      fs: nodeFs,
      path,
      bytes: enc('MINE'),
      expectedHash: hash,
      randomSuffix: suffix
    })
    expect(out).toEqual({ kind: 'conflict', diskHash: sha256(enc('SOMEONE ELSE SAVED')) })
    expect(readFileSync(path, 'utf8')).toBe('SOMEONE ELSE SAVED')
    onlyDataFile(dir)
  })

  it('reports a conflict when the file has gone', async () => {
    const { path, hash } = setup()
    await nodeFs.unlink(path)
    const out = await saveAtomically({
      fs: nodeFs,
      path,
      bytes: enc('MINE'),
      expectedHash: hash,
      randomSuffix: suffix
    })
    expect(out).toEqual({ kind: 'conflict', diskHash: null })
    expect(existsSync(path)).toBe(false)
  })

  it('reports a conflict when the file changes between writing and renaming', async () => {
    const { dir, path, hash } = setup()
    const out = await saveAtomically({
      fs: nodeFs,
      path,
      bytes: enc('MINE'),
      expectedHash: hash,
      randomSuffix: suffix,
      backupPrevious: async () => {
        writeFileSync(path, 'SNUCK IN')
      }
    })
    expect(out.kind).toBe('conflict')
    expect(readFileSync(path, 'utf8')).toBe('SNUCK IN')
    onlyDataFile(dir)
  })

  it('keeps the previous version through backupPrevious', async () => {
    const { path, hash } = setup()
    let kept = ''
    await saveAtomically({
      fs: nodeFs,
      path,
      bytes: enc('NEW'),
      expectedHash: hash,
      randomSuffix: suffix,
      backupPrevious: async (prev) => {
        kept = new TextDecoder().decode(prev)
      }
    })
    expect(kept).toBe('ORIGINAL VERSION')
  })

  it('starts the backup while the new version is written, and waits for it before the swap', async () => {
    const { path, hash } = setup()
    const fs = faultyFs()
    let callsAtStart: string[] = []
    let finished = false
    const out = await saveAtomically({
      fs,
      path,
      bytes: enc('NEW'),
      expectedHash: hash,
      randomSuffix: suffix,
      backupPrevious: async () => {
        callsAtStart = [...fs.calls]
        await new Promise((resolve) => setTimeout(resolve, 30))
        finished = true
        expect(fs.calls.some((c) => c.startsWith('rename'))).toBe(false)
      }
    })
    expect(out.kind).toBe('saved')
    expect(finished).toBe(true)
    // Compressing a large backup takes time: it overlaps the write of the new version.
    expect(callsAtStart.some((c) => c.startsWith('writeNewFileDurable'))).toBe(false)
  })

  it('waits for the backup before reporting a failed write', async () => {
    const { path, hash } = setup()
    let finished = false
    await expect(
      saveAtomically({
        fs: faultyFs([{ method: 'writeNewFileDurable' }]),
        path,
        bytes: enc('NEW'),
        expectedHash: hash,
        randomSuffix: suffix,
        backupPrevious: async () => {
          await new Promise((resolve) => setTimeout(resolve, 30))
          finished = true
        }
      })
    ).rejects.toThrow()
    expect(finished).toBe(true)
  })

  it('still saves when the backup fails, and says so', async () => {
    const { path, hash } = setup()
    const out = await saveAtomically({
      fs: nodeFs,
      path,
      bytes: enc('NEW'),
      expectedHash: hash,
      randomSuffix: suffix,
      backupPrevious: async () => {
        throw new Error('backup folder full')
      }
    })
    expect(out.kind).toBe('saved')
    if (out.kind === 'saved') expect(out.backupError).toBe('backup folder full')
    expect(readFileSync(path, 'utf8')).toBe('NEW')
  })

  it('leaves the original intact when the write is cut off half way', async () => {
    const { dir, path, hash } = setup()
    const fs = faultyFs([{ method: 'writeNewFileDurable', partial: 0.5 }])
    await expect(
      saveAtomically({
        fs,
        path,
        bytes: enc('A MUCH LONGER NEW VERSION'),
        expectedHash: hash,
        randomSuffix: suffix
      })
    ).rejects.toMatchObject({ step: 'write' })
    expect(readFileSync(path, 'utf8')).toBe('ORIGINAL VERSION')
    onlyDataFile(dir)
  })

  it('does not use a temporary file that reads back wrong', async () => {
    const { dir, path, hash } = setup()
    const fs = faultyFs()
    const realRead = fs.readFile
    fs.readFile = async (p: string) => {
      const b = await realRead(p)
      return p.includes('.tmp-') ? b.map((x) => x ^ 1) : b
    }
    await expect(
      saveAtomically({ fs, path, bytes: enc('NEW'), expectedHash: hash, randomSuffix: suffix })
    ).rejects.toMatchObject({
      step: 'verify'
    })
    expect(readFileSync(path, 'utf8')).toBe('ORIGINAL VERSION')
    onlyDataFile(dir)
  })

  it('retries a rename that OneDrive or antivirus briefly blocks', async () => {
    const { path, hash } = setup()
    const fs = faultyFs([{ method: 'rename', code: 'EBUSY', times: 3 }])
    const out = await saveAtomically({
      fs,
      path,
      bytes: enc('NEW'),
      expectedHash: hash,
      randomSuffix: suffix,
      sleep: noSleep
    })
    expect(out.kind).toBe('saved')
    expect(readFileSync(path, 'utf8')).toBe('NEW')
    expect(fs.calls.filter((c) => c.startsWith('rename'))).toHaveLength(4)
  })

  it('gives up on a rename that stays blocked, original intact', async () => {
    const { dir, path, hash } = setup()
    const fs = faultyFs([{ method: 'rename', code: 'EPERM' }])
    const err = await saveAtomically({
      fs,
      path,
      bytes: enc('NEW'),
      expectedHash: hash,
      randomSuffix: suffix,
      sleep: noSleep
    }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(SaveFailedError)
    expect((err as SaveFailedError).step).toBe('rename')
    expect(readFileSync(path, 'utf8')).toBe('ORIGINAL VERSION')
    onlyDataFile(dir)
  })

  it('does not retry a rename that fails for a reason that will not pass', async () => {
    const { path, hash } = setup()
    const fs = faultyFs([{ method: 'rename', code: 'ENOSPC' }])
    await expect(
      saveAtomically({
        fs,
        path,
        bytes: enc('NEW'),
        expectedHash: hash,
        randomSuffix: suffix,
        sleep: noSleep
      })
    ).rejects.toThrow()
    expect(fs.calls.filter((c) => c.startsWith('rename'))).toHaveLength(1)
  })

  it('never damages the original, whichever call fails (property test)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uint8Array({ minLength: 0, maxLength: 5000 }),
        fc.integer({ min: 1, max: 12 }),
        fc.constantFrom('EIO', 'EPERM', 'EBUSY', 'ENOSPC', 'EACCES'),
        fc.option(fc.double({ min: 0, max: 1, noNaN: true }), { nil: undefined }),
        async (data, atCall, code, partial) => {
          const { path, hash } = setup()
          const fs = faultyFs([{ atCall, code, ...(partial !== undefined ? { partial } : {}) }])
          let outcome: 'saved' | 'conflict' | 'failed'
          try {
            outcome = (
              await saveAtomically({
                fs,
                path,
                bytes: data,
                expectedHash: hash,
                randomSuffix: suffix,
                sleep: noSleep,
                renameAttempts: 2
              })
            ).kind
          } catch {
            outcome = 'failed'
          }
          const onDisk = new Uint8Array(readFileSync(path))
          if (outcome === 'saved') {
            expect(sha256(onDisk)).toBe(sha256(data))
          } else {
            expect(new TextDecoder().decode(onDisk)).toBe('ORIGINAL VERSION')
          }
        }
      ),
      { numRuns: 150 }
    )
  })
})
