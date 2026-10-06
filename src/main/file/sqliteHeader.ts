// Checks the first 100 bytes of a SQLite file without opening it, so a file that
// OneDrive has not finished downloading is caught before anything trusts it.
// Format reference: https://www.sqlite.org/fileformat.html section 1.3.

const MAGIC = 'SQLite format 3\u0000'

export type HeaderVerdict = 'ok' | 'empty' | 'not_sqlite' | 'incomplete'

export function checkSqliteBytes(bytes: Uint8Array): HeaderVerdict {
  if (bytes.byteLength === 0) return 'empty'
  if (bytes.every((b) => b === 0)) return 'empty'
  if (bytes.byteLength < 100) return 'not_sqlite'
  for (let i = 0; i < MAGIC.length; i++) {
    if (bytes[i] !== MAGIC.charCodeAt(i)) return 'not_sqlite'
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const rawPageSize = view.getUint16(16)
  const pageSize = rawPageSize === 1 ? 65536 : rawPageSize
  if (pageSize < 512 || (pageSize & (pageSize - 1)) !== 0) return 'not_sqlite'
  if (bytes.byteLength % pageSize !== 0) return 'incomplete'
  // The in-header page count is trustworthy only when "version-valid-for" matches
  // the change counter; then the file must be at least that long.
  const changeCounter = view.getUint32(24)
  const pageCount = view.getUint32(28)
  const validFor = view.getUint32(92)
  if (pageCount > 0 && validFor === changeCounter && bytes.byteLength < pageCount * pageSize)
    return 'incomplete'
  return 'ok'
}
