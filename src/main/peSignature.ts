// Pure check for an Authenticode signature in a Windows program (.exe). No
// Electron imports, so Vitest covers it.

/** How many bytes from the start of the .exe are enough for `hasAuthenticodeSignature`. */
export const PE_HEADER_BYTES = 4096

/**
 * True when the start of a Windows .exe says the file carries an embedded
 * Authenticode signature: its certificate table (data directory 4 of the PE
 * optional header) is not empty. It does not check that the signature is valid;
 * Windows does that when the program starts. False for anything that is not a
 * PE file or is cut short.
 */
export function hasAuthenticodeSignature(head: Uint8Array): boolean {
  const view = new DataView(head.buffer, head.byteOffset, head.byteLength)
  if (head.byteLength < 0x40 || view.getUint16(0, true) !== 0x5a4d) return false // "MZ"
  const pe = view.getUint32(0x3c, true)
  if (pe + 24 > head.byteLength || view.getUint32(pe, true) !== 0x00004550) return false // "PE\0\0"
  const optional = pe + 24
  const magic = view.getUint16(optional, true)
  const directories = magic === 0x20b ? optional + 112 : magic === 0x10b ? optional + 96 : -1
  if (directories < 0) return false
  const security = directories + 4 * 8
  if (security + 8 > head.byteLength) return false
  const offset = view.getUint32(security, true)
  const size = view.getUint32(security + 4, true)
  return offset > 0 && size > 0
}
