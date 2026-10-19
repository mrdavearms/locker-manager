import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { freshStagingDir } from '../../../src/main/update/staging'

let work = ''
afterEach(() => {
  rmSync(work, { recursive: true, force: true })
})

function leftover(): string {
  work = mkdtempSync(join(tmpdir(), 'lm-staging-'))
  const root = join(work, 'pending-update')
  mkdirSync(join(root, 'app'), { recursive: true })
  writeFileSync(join(root, 'app', 'app.asar'), 'SYNTHETIC')
  return root
}

it('clears earlier downloads and gives an empty folder', async () => {
  const root = leftover()
  const notes: string[] = []
  const dir = await freshStagingDir(
    root,
    (p) => Promise.resolve(rmSync(p, { recursive: true })),
    (m) => notes.push(m)
  )
  expect(dirname(dir)).toBe(root)
  expect(readdirSync(dir)).toEqual([])
  expect(existsSync(join(root, 'app'))).toBe(false)
  expect(notes).toEqual([])
})

it('still gives a folder when the leftover will not delete', async () => {
  const root = leftover()
  const notes: string[] = []
  const stuck = (): Promise<void> =>
    Promise.reject(new Error('ENOTEMPTY: directory not empty, rmdir'))
  const first = await freshStagingDir(root, stuck, (m) => notes.push(m))
  const second = await freshStagingDir(root, stuck, (m) => notes.push(m))
  expect(dirname(first)).toBe(root)
  expect(readdirSync(first)).toEqual([])
  expect(second).not.toBe(first)
  expect(notes).toEqual([
    'ENOTEMPTY: directory not empty, rmdir',
    'ENOTEMPTY: directory not empty, rmdir'
  ])
})
