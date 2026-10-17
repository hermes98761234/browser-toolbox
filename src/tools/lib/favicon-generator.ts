// Favicon set helpers: ICO container (PNG-compressed entries), web manifest and HTML snippet.

export interface IcoEntry { size: number; png: Uint8Array }

/**
 * Builds a .ico file holding PNG-encoded images (supported by every browser since IE Vista).
 * Layout: ICONDIR (6 bytes) + ICONDIRENTRY (16 bytes each) + image data.
 */
export function buildIco(entries: IcoEntry[]): Uint8Array {
  const sorted = [...entries].sort((a, b) => a.size - b.size)
  const head = 6 + 16 * sorted.length
  const total = head + sorted.reduce((a, e) => a + e.png.length, 0)
  const out = new Uint8Array(total)
  const v = new DataView(out.buffer)
  v.setUint16(0, 0, true) // reserved
  v.setUint16(2, 1, true) // type 1 = icon
  v.setUint16(4, sorted.length, true)
  let off = head
  sorted.forEach((e, i) => {
    const p = 6 + 16 * i
    out[p] = e.size >= 256 ? 0 : e.size // 0 means 256
    out[p + 1] = e.size >= 256 ? 0 : e.size
    out[p + 2] = 0 // palette colours
    out[p + 3] = 0 // reserved
    v.setUint16(p + 4, 1, true) // colour planes
    v.setUint16(p + 6, 32, true) // bits per pixel
    v.setUint32(p + 8, e.png.length, true)
    v.setUint32(p + 12, off, true)
    out.set(e.png, off)
    off += e.png.length
  })
  return out
}

/** Reads back the directory of an ICO file (used by tests and the preview). */
export function readIco(b: Uint8Array): { size: number; bytes: number; offset: number }[] {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength)
  if (v.getUint16(0, true) !== 0 || v.getUint16(2, true) !== 1) throw new Error('Not an ICO file')
  const n = v.getUint16(4, true)
  return Array.from({ length: n }, (_, i) => {
    const p = 6 + 16 * i
    return { size: b[p] || 256, bytes: v.getUint32(p + 8, true), offset: v.getUint32(p + 12, true) }
  })
}

export interface PngTarget { file: string; size: number; purpose: string }

export const PNG_TARGETS: PngTarget[] = [
  { file: 'favicon-16x16.png', size: 16, purpose: 'Browser tab (standard)' },
  { file: 'favicon-32x32.png', size: 32, purpose: 'Browser tab (retina), taskbar' },
  { file: 'favicon-48x48.png', size: 48, purpose: 'Windows site icon, Google search' },
  { file: 'apple-touch-icon.png', size: 180, purpose: 'iOS home screen' },
  { file: 'android-chrome-192x192.png', size: 192, purpose: 'Android home screen (manifest)' },
  { file: 'android-chrome-512x512.png', size: 512, purpose: 'PWA splash screen (manifest)' },
  { file: 'mstile-150x150.png', size: 150, purpose: 'Windows Start tile' },
]

export const ICO_SIZES = [16, 32, 48]

export function manifest(o: { name: string; short: string; theme: string; bg: string; path: string }): string {
  const p = o.path.replace(/\/?$/, '/')
  return JSON.stringify(
    {
      name: o.name,
      short_name: o.short || o.name.slice(0, 12),
      icons: [
        { src: `${p}android-chrome-192x192.png`, sizes: '192x192', type: 'image/png' },
        { src: `${p}android-chrome-512x512.png`, sizes: '512x512', type: 'image/png' },
        { src: `${p}android-chrome-512x512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
      theme_color: o.theme,
      background_color: o.bg,
      display: 'standalone',
    },
    null,
    2,
  )
}

export function htmlSnippet(o: { path: string; theme: string }): string {
  const p = o.path.replace(/\/?$/, '/')
  return [
    `<link rel="icon" href="${p}favicon.ico" sizes="48x48">`,
    `<link rel="icon" type="image/png" sizes="32x32" href="${p}favicon-32x32.png">`,
    `<link rel="icon" type="image/png" sizes="16x16" href="${p}favicon-16x16.png">`,
    `<link rel="apple-touch-icon" sizes="180x180" href="${p}apple-touch-icon.png">`,
    `<link rel="manifest" href="${p}site.webmanifest">`,
    `<meta name="theme-color" content="${o.theme}">`,
    `<meta name="msapplication-TileImage" content="${p}mstile-150x150.png">`,
  ].join('\n')
}
