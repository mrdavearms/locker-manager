import QRCode from 'qrcode'

// QR codes for labels (SPEC.md 5.6): only ever the locker's random identifier,
// never a name or a code. Drawn as one SVG path so it prints crisply at any size.

export function qrSvg(text: string): string {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' })
  const size = qr.modules.size
  const d: string[] = []
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) if (qr.modules.get(x, y)) d.push(`M${x} ${y}h1v1h-1z`)
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><path d="${d.join('')}" fill="#000"/></svg>`
}

export function lockerQrText(qrId: string): string {
  return `lockermanager://locker/${qrId}`
}
