// Turns file bytes into text: UTF-8 with or without a BOM, UTF-16, or Windows-1252
// (what Excel on Windows saves as "CSV"). SPEC.md 4.2.

export interface Decoded {
  text: string
  encoding: 'utf-8' | 'utf-16le' | 'utf-16be' | 'windows-1252'
}

// Windows-1252 differs from Latin-1 only in 0x80 to 0x9F, where it has curly quotes,
// dashes and the euro sign. Node's own decoder treats the label as Latin-1, which
// would turn Excel's O’Brien into "O\u0092Brien", so those 32 bytes are mapped here.
const CP1252_HIGH = [
  0x20ac, 0xfffd, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039,
  0x0152, 0xfffd, 0x017d, 0xfffd, 0xfffd, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014,
  0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0xfffd, 0x017e, 0x0178
]

export function decodeWindows1252(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 8192) {
    const chunk = bytes.subarray(i, i + 8192)
    out += String.fromCharCode(
      ...Array.from(chunk, (b) => (b >= 0x80 && b <= 0x9f ? CP1252_HIGH[b - 0x80]! : b))
    )
  }
  return out
}

export function decodeText(bytes: Uint8Array): Decoded {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { text: new TextDecoder('utf-8').decode(bytes.subarray(3)), encoding: 'utf-8' }
  }
  if (bytes[0] === 0xff && bytes[1] === 0xfe)
    return { text: new TextDecoder('utf-16le').decode(bytes.subarray(2)), encoding: 'utf-16le' }
  if (bytes[0] === 0xfe && bytes[1] === 0xff)
    return { text: new TextDecoder('utf-16be').decode(bytes.subarray(2)), encoding: 'utf-16be' }
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), encoding: 'utf-8' }
  } catch {
    return { text: decodeWindows1252(bytes), encoding: 'windows-1252' }
  }
}
