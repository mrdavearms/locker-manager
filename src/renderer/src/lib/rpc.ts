import { useCallback, useEffect, useState } from 'react'
import type { RpcMethod, RpcParams, RpcResults } from '@shared/rpc'
import { useRevision } from './appContext'

/** Calls the main process; returns the value or throws an Error with a plain message. */
export async function call<M extends RpcMethod>(
  method: M,
  params: RpcParams<M>
): Promise<RpcResults[M]> {
  const r = await window.api.rpc(method, params)
  if (!r.ok) throw new Error(r.message)
  return r.value
}

/** Fetches a value and fetches it again whenever the open file changes. */
export function useRpc<M extends RpcMethod>(
  method: M,
  params: RpcParams<M>
): { data: RpcResults[M] | null; error: string | null; reload: () => void } {
  const revision = useRevision()
  const [data, setData] = useState<RpcResults[M] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)
  const key = JSON.stringify(params)
  useEffect(() => {
    let cancelled = false
    void window.api.rpc(method, JSON.parse(key) as RpcParams<M>).then((r) => {
      if (cancelled) return
      if (r.ok) {
        setData(r.value)
        setError(null)
      } else setError(r.message)
    })
    return () => {
      cancelled = true
    }
  }, [method, key, revision, nonce])
  const reload = useCallback(() => setNonce((n) => n + 1), [])
  return { data, error, reload }
}
