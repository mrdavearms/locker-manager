import { brand } from './brand'

// Label QR codes (SPEC.md 5.6) carry lockermanager://locker/<short id>, never a
// name or code. Shared so the link handler and quick find read it the same way.

export function lockerIdFromLink(text: string): string | null {
  const m = new RegExp(`^${brand.protocol}://locker/([A-Za-z0-9_-]{4,64})/?$`, 'i').exec(
    text.trim()
  )
  return m ? m[1]! : null
}
