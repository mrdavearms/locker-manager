import { ipcMain } from 'electron'
import log from 'electron-log/main'
import type { z } from 'zod'
import { channels } from '@shared/channels'
import { isRpcMethod, rpcParams, type RpcMethod, type RpcResults } from '@shared/rpc'
import type { LockerDb } from '../db/db'
import type { AuditEntry, OperatorContext } from '../db/context'
import type { DataFileSession, Replayable } from '../file/session'

// Every data request goes through here: the method must be in the shared
// contract, its input must pass the method's Zod schema, and writes go through
// the session (read-only and conflict checks, a history entry, a save).

type Params<M extends RpcMethod> = z.output<(typeof rpcParams)[M]>

export type Handler<M extends RpcMethod> =
  | { kind: 'read'; run: (db: LockerDb, p: Params<M>) => RpcResults[M] }
  | {
      kind: 'write'
      audit: (p: Params<M>, result: RpcResults[M]) => AuditEntry
      run: (db: LockerDb, ctx: OperatorContext, p: Params<M>) => RpcResults[M]
    }
  /** Needs no open file; may be asynchronous (for example reading an Excel file). */
  | { kind: 'pure'; run: (p: Params<M>) => RpcResults[M] | Promise<RpcResults[M]> }

export type Handlers = { [M in RpcMethod]: Handler<M> }

let registered: Handlers | null = null

/**
 * Makes one recorded change again on another version of the file: the conflict
 * merge (SPEC.md 6.4). Runs the same handler, with the same checks, as the first time.
 */
export function replayChange(db: LockerDb, ctx: OperatorContext, change: Replayable): void {
  if (!registered || !isRpcMethod(change.method)) throw new Error('That change cannot be repeated.')
  const h = registered[change.method] as Handler<RpcMethod>
  if (h.kind !== 'write') throw new Error('That change cannot be repeated.')
  const parsed = rpcParams[change.method].safeParse(change.params)
  if (!parsed.success) throw new Error('That change cannot be repeated.')
  h.run(db, ctx, parsed.data as never)
}

export function registerRpc(session: () => DataFileSession, handlers: Handlers): void {
  registered = handlers
  ipcMain.handle(channels.rpc, async (_event, method: unknown, raw: unknown) => {
    if (!isRpcMethod(method)) return { ok: false, message: 'Unknown request.' }
    const parsed = rpcParams[method].safeParse(raw ?? {})
    if (!parsed.success) {
      const first = parsed.error.issues[0]
      return {
        ok: false,
        message: `That was not accepted${first ? `: ${first.path.join('.') || 'value'} ${first.message.toLowerCase()}` : ''}.`
      }
    }
    const h = handlers[method] as Handler<RpcMethod>
    try {
      if (h.kind === 'pure') return { ok: true, value: await h.run(parsed.data as never) }
      const s = session()
      if (h.kind === 'read')
        return { ok: true, value: s.read((db) => h.run(db, parsed.data as never)) }
      const value = s.write<RpcResults[RpcMethod]>(
        (result) => h.audit(parsed.data as never, result),
        (db, ctx) => h.run(db, ctx, parsed.data as never),
        { method, params: parsed.data }
      )
      return { ok: true, value }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      log.info(`rpc ${method} refused`)
      return { ok: false, message }
    }
  })
}
