import {
  analyseLogo,
  inkColour,
  LOGO_FACTS_VERSION,
  makeMonoLogo,
  type LogoAnalysis,
  type LogoFacts
} from '@shared/logo'

export type LogoType = 'image/png' | 'image/svg+xml' | 'image/jpeg'

export interface PreparedLogo {
  bytes: Uint8Array<ArrayBuffer>
  type: LogoType
  mono: Uint8Array<ArrayBuffer>
  analysis: LogoAnalysis
  monoMethod: ReturnType<typeof makeMonoLogo>['method']
  /** What to remember about the logo (stored with it as setting `logo.facts`). */
  facts: LogoFacts
}

function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('That picture could not be read. Use a PNG, JPEG or SVG file.'))
    }
    img.src = url
  })
}

/** Reads a chosen logo, checks it for white-on-transparent, and makes a mono version. */
export async function prepareLogo(file: File): Promise<PreparedLogo> {
  const type = (['image/png', 'image/svg+xml', 'image/jpeg'] as const).find((t) => t === file.type)
  if (!type) throw new Error('The logo must be a PNG, JPEG or SVG picture.')
  if (file.size > 2 * 1024 * 1024) throw new Error('That picture is over 2 MB. Use a smaller one.')
  const bytes = new Uint8Array(await file.arrayBuffer())
  const img = await loadImage(new Blob([bytes], { type }))
  // Always work at 2048 pixels on the longest side, enlarging small pictures and
  // SVGs too: black and white is decided pixel by pixel, so a small canvas gives
  // stepped edges on the printed label.
  const longest = Math.max(img.naturalWidth || 512, img.naturalHeight || 512)
  const scale = 2048 / longest
  const w = Math.max(1, Math.round((img.naturalWidth || 512) * scale))
  const h = Math.max(1, Math.round((img.naturalHeight || 512) * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('This computer could not process the picture.')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, w, h)
  const data = ctx.getImageData(0, 0, w, h)
  const analysis = analyseLogo(data.data)
  const mono = makeMonoLogo(data.data, w, h)
  ctx.putImageData(new ImageData(mono.pixels, w, h), 0, 0)
  const monoBlob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Could not make the mono logo.'))),
      'image/png'
    )
  )
  return {
    bytes,
    type,
    mono: new Uint8Array(await monoBlob.arrayBuffer()),
    analysis,
    monoMethod: mono.method,
    facts: {
      version: LOGO_FACTS_VERSION,
      width: img.naturalWidth,
      height: img.naturalHeight,
      svg: type === 'image/svg+xml',
      lightOnWhite: mono.lightLettering,
      opaque: analysis.hasBackground,
      ink: inkColour(data.data),
      mono: 'auto',
      monoResult: mono.result
    }
  }
}
