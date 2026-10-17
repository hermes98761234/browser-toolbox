// Pure helpers for the image format converter.

export type Fmt = 'png' | 'jpeg' | 'webp' | 'avif'
export type Resize = 'orig' | 'pct' | 'maxw' | 'box'

export const MIME: Record<Fmt, string> = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp', avif: 'image/avif' }
export const EXT: Record<Fmt, string> = { png: 'png', jpeg: 'jpg', webp: 'webp', avif: 'avif' }

/** Target pixel size. Never upscales for max-width / bounding-box modes. */
export function targetSize(w: number, h: number, mode: Resize, pct: number, maxW: number, boxW: number, boxH: number): [number, number] {
  let k = 1
  if (mode === 'pct') k = Math.max(0.01, pct / 100)
  else if (mode === 'maxw') k = Math.min(1, maxW / w)
  else if (mode === 'box') k = Math.min(1, boxW / w, boxH / h)
  if (!Number.isFinite(k) || k <= 0) k = 1
  return [Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k))]
}

/** "photo.final.PNG" → "photo.final.webp" */
export function outName(name: string, fmt: Fmt, suffix = ''): string {
  const stem = name.replace(/\.[a-z0-9]{2,5}$/i, '') || 'image'
  return `${stem}${suffix}.${EXT[fmt]}`
}

/** Fractional size change: negative = smaller. */
export const sizeChange = (before: number, after: number) => (before > 0 ? after / before - 1 : 0)

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1048576).toFixed(2)} MB`
}

/** Detects the format of an image from its magic bytes. */
export function sniff(b: Uint8Array): string {
  const s = (i: number, n: number) => String.fromCharCode(...b.slice(i, i + n))
  if (b[0] === 0x89 && s(1, 3) === 'PNG') return 'PNG'
  if (b[0] === 0xff && b[1] === 0xd8) return 'JPEG'
  if (s(0, 4) === 'RIFF' && s(8, 4) === 'WEBP') return 'WebP'
  if (s(4, 4) === 'ftyp' && /avi[fs]/.test(s(8, 4))) return 'AVIF'
  if (s(4, 4) === 'ftyp' && /hei[cx]|mif1/.test(s(8, 4))) return 'HEIC'
  if (s(0, 3) === 'GIF') return 'GIF'
  if (s(0, 2) === 'BM') return 'BMP'
  if (/^\s*<(\?xml|svg)/.test(s(0, 64))) return 'SVG'
  if (b[0] === 0 && b[1] === 0 && b[2] === 1 && b[3] === 0) return 'ICO'
  return 'unknown'
}
