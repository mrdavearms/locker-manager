import { nodeFs, type FsPort } from '../../../src/main/file/fsPort'

type Method = keyof FsPort

export interface Fault {
  /** Fail the nth call (1-based) across ALL methods, counted in call order. */
  atCall?: number
  /** Or fail every call to this method whose first argument matches. */
  method?: Method
  match?: (path: string) => boolean
  /** How many times to fail before succeeding (default: always). */
  times?: number
  code?: string
  /** For writeNewFileDurable: write this fraction of the data first, as a real crash would. */
  partial?: number
}

/** Wraps the real file system and injects failures. Records every call. */
export function faultyFs(faults: Fault[] = []): FsPort & { calls: string[] } {
  const calls: string[] = []
  const failures = new Map<Fault, number>()
  const wrap = <M extends Method>(method: M): FsPort[M] =>
    (async (...args: unknown[]) => {
      calls.push(`${method} ${String(args[0])}`)
      const n = calls.length
      for (const f of faults) {
        const hit =
          (f.atCall !== undefined && f.atCall === n) ||
          (f.method === method && (f.match ? f.match(String(args[0])) : true))
        if (!hit) continue
        const used = failures.get(f) ?? 0
        if (f.times !== undefined && used >= f.times) continue
        failures.set(f, used + 1)
        if (method === 'writeNewFileDurable' && f.partial !== undefined) {
          const data = args[1] as Uint8Array
          await nodeFs.writeNewFileDurable(
            String(args[0]),
            data.subarray(0, Math.floor(data.byteLength * f.partial))
          )
        }
        const err = new Error(`injected fault in ${method}`) as Error & { code?: string }
        err.code = f.code ?? 'EIO'
        throw err
      }
      return (nodeFs[method] as (...a: unknown[]) => Promise<unknown>)(...args)
    }) as FsPort[M]
  return {
    calls,
    readFile: wrap('readFile'),
    writeNewFileDurable: wrap('writeNewFileDurable'),
    rename: wrap('rename'),
    unlink: wrap('unlink'),
    stat: wrap('stat'),
    readdir: wrap('readdir'),
    mkdirp: wrap('mkdirp')
  }
}
