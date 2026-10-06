// Run in a child process by crash.test.ts, which kills it at a random moment.
// Saves version after version of a large file through the real atomic save.
// Each version is self-checking: an 8-byte version number, then filler derived
// from it, so the parent can tell a whole version from a torn one.
import { readFileSync } from 'node:fs'
import { saveAtomically } from '../../src/main/file/atomicSave'
import { nodeFs } from '../../src/main/file/fsPort'
import { sha256 } from '../../src/main/file/hash'

const path = process.argv[2]
if (!path) throw new Error('usage: saveChild <path>')
const SIZE = 4 * 1024 * 1024

export function versionBytes(v: number): Uint8Array {
  const b = new Uint8Array(SIZE)
  new DataView(b.buffer).setFloat64(0, v)
  for (let i = 8; i < SIZE; i++) b[i] = (v * 31 + i) & 0xff
  return b
}

let expected = sha256(new Uint8Array(readFileSync(path)))
let suffix = 0
async function loop(): Promise<void> {
  for (let v = 1; ; v++) {
    const out = await saveAtomically({
      fs: nodeFs,
      path,
      bytes: versionBytes(v),
      expectedHash: expected,
      randomSuffix: () => `${process.pid}-${++suffix}`
    })
    if (out.kind !== 'saved') throw new Error('unexpected conflict')
    expected = out.hash
    process.stdout.write(`saved ${v}\n`)
  }
}
void loop()
