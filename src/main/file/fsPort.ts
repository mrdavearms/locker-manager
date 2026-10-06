import { constants as fsConstants } from 'node:fs'
import { open, readdir, readFile, mkdir, rename, stat, unlink } from 'node:fs/promises'

/**
 * Every file-system call the data-file code makes goes through this interface,
 * so tests can inject failures at any step (including a write cut off half way).
 */
export interface FsPort {
  readFile(path: string): Promise<Uint8Array>
  /** Creates a NEW file (fails if it exists), writes it, flushes it to disk and closes it. */
  writeNewFileDurable(path: string, data: Uint8Array): Promise<void>
  rename(from: string, to: string): Promise<void>
  unlink(path: string): Promise<void>
  stat(path: string): Promise<{ size: number; mtimeMs: number }>
  readdir(dir: string): Promise<string[]>
  mkdirp(dir: string): Promise<void>
}

export const nodeFs: FsPort = {
  async readFile(path) {
    const buf = await readFile(path)
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
  },
  async writeNewFileDurable(path, data) {
    const handle = await open(
      path,
      fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL,
      0o644
    )
    try {
      let offset = 0
      while (offset < data.byteLength) {
        const { bytesWritten } = await handle.write(data, offset, data.byteLength - offset)
        offset += bytesWritten
      }
      await handle.sync()
    } finally {
      await handle.close()
    }
  },
  rename: (from, to) => rename(from, to),
  unlink: (path) => unlink(path),
  async stat(path) {
    const s = await stat(path)
    return { size: s.size, mtimeMs: s.mtimeMs }
  },
  readdir: (dir) => readdir(dir),
  async mkdirp(dir) {
    await mkdir(dir, { recursive: true })
  }
}

export function errorCode(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code: unknown }).code
    return typeof code === 'string' ? code : undefined
  }
  return undefined
}

export async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}
