import QRCode from 'qrcode'

// QR codes for labels (SPEC.md 5.6): only ever the locker's random identifier,
// never a name or a code. Drawn as one SVG path so it prints crisply at any size.

/** The clear border a scanner needs round a QR code, in squares (print audit M10). */
export const QR_QUIET = 4
export function qrSvg(text: string): string {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' })
  const size = qr.modules.size
  const d: string[] = []
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++)
      if (qr.modules.get(x, y)) d.push(`M${x + QR_QUIET} ${y + QR_QUIET}h1v1h-1z`)
  }
  const all = size + 2 * QR_QUIET
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${all} ${all}" shape-rendering="crispEdges"><rect width="${all}" height="${all}" fill="#fff"/><path d="${d.join('')}" fill="#000"/></svg>`
}

export function lockerQrText(qrId: string): string {
  return `lockermanager://locker/${qrId}`
}
