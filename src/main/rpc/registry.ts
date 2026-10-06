import { ipcMain } from 'electron'
import log from 'electron-log/main'
import type { z } from 'zod'
import { channels } from '@shared/channels'
import { isRpcMethod, rpcParams, type RpcMethod, type RpcResults } from '@shared/rpc'
import type { LockerDb } from '../db/db'
import type { AuditEntry, OperatorContext } from '../db/context'
import type { DataFileSession } from '../file/session'

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

export function registerRpc(session: () => DataFileSession, handlers: Handlers): void {
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
        (db, ctx) => h.run(db, ctx, parsed.data as never)
      )
      return { ok: true, value }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      log.info(`rpc ${method} refused`)
      return { ok: false, message }
    }
  })
}
