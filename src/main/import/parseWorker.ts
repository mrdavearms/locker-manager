import { parentPort, workerData } from 'node:worker_threads'
import { parseFile } from './parse'

// Reads one import file in a worker thread with its own memory limit
// (parseInWorker.ts). Built as out/main/importWorker.cjs.

const { name, bytes } = workerData as { name: string; bytes: Uint8Array }
parseFile(name, bytes).then(
  (file) => parentPort?.postMessage({ ok: true, file }),
  (error: unknown) =>
    parentPort?.postMessage({
      ok: false,
      message: error instanceof Error ? error.message : String(error)
    })
)
