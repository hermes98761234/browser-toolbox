// Print Preflight Checker logic: effective PPI at a print size, file metadata (JFIF/PNG pHYs density,
// embedded ICC profile header and description, Adobe/CMYK JPEG markers), an APPROXIMATE coated-offset
// CMYK gamut test in CIELAB and an ink coverage (TAC) estimate from a simple GCR separation.
import { linearToXyz, srgbToLinear, xyzToLab, type V3 } from './color-space-explorer'

// ---------- print size ----------

export const MM_PER_IN = 25.4

/** Effective PPI when the image covers (crops to) or fits inside the target area (inches). */
export function effectivePpi(pxW: number, pxH: number, inW: number, inH: number, mode: 'cover' | 'fit'): { ppi: number; ppiX: number; ppiY: number } {
  const ppiX = pxW / inW, ppiY = pxH / inH
  return { ppi: mode === 'cover' ? Math.min(ppiX, ppiY) : Math.max(ppiX, ppiY), ppiX, ppiY }
}

/** PPI the eye can resolve at a viewing distance (1 arc-minute acuity ≈ 3438 / distance in inches). */
export const ppiForDistance = (inches: number) => 3438 / inches

export function ppiRating(ppi: number): { label: string; tone: 'ok' | 'warn' | 'err' } {
  if (ppi >= 300) return { label: 'Excellent (≥ 300 ppi)', tone: 'ok' }
  if (ppi >= 240) return { label: 'Good (240–300 ppi)', tone: 'ok' }
  if (ppi >= 150) return { label: 'Acceptable for posters / viewing from afar', tone: 'warn' }
  return { label: 'Too low: visibly soft or pixelated', tone: 'err' }
}

// ---------- approximate CMYK gamut ----------

/**
 * Typical Lab values of a coated offset process (inks on coated paper, roughly FOGRA39-like). These are
 * approximations used to build a hue-wise "cusp" gamut model, not a real ICC transform.
 */
export const CUSPS: { name: string; lab: V3 }[] = [
  { name: 'Cyan', lab: [55, -37, -50] },
  { name: 'Blue (C+M)', lab: [24, 22, -46] },
  { name: 'Magenta', lab: [48, 74, -3] },
  { name: 'Red (M+Y)', lab: [47, 68, 48] },
  { name: 'Yellow', lab: [89, -5, 93] },
  { name: 'Green (C+Y)', lab: [50, -65, 27] },
]
export const PAPER_L = 95, BLACK_L = 16

const hueOf = (a: number, b: number) => ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360
const CUSP_HC = CUSPS.map((c) => ({ h: hueOf(c.lab[1], c.lab[2]), C: Math.hypot(c.lab[1], c.lab[2]), L: c.lab[0] })).sort((x, y) => x.h - y.h)

/** Maximum chroma of the model gamut at lightness L and hue h (degrees). */
export function maxChroma(L: number, h: number): number {
  if (L <= BLACK_L || L >= PAPER_L) return 0
  const n = CUSP_HC.length
  let i = CUSP_HC.findIndex((c) => c.h > h) - 1
  if (i < 0) i = n - 1
  const a = CUSP_HC[i], b = CUSP_HC[(i + 1) % n]
  const span = (b.h - a.h + 360) % 360 || 360
  const t = ((h - a.h + 360) % 360) / span
  const cL = a.L + (b.L - a.L) * t, cC = a.C + (b.C - a.C) * t
  return L <= cL ? (cC * (L - BLACK_L)) / (cL - BLACK_L) : (cC * (PAPER_L - L)) / (PAPER_L - cL)
}

export const rgbToLab = (r: number, g: number, b: number): V3 => xyzToLab(linearToXyz(srgbToLinear([r / 255, g / 255, b / 255])))

/** How far outside the approximate gamut a colour is, in ΔE-like chroma units (0 = inside). */
export function gamutExcess(r: number, g: number, b: number): number {
  const [L, a, bb] = rgbToLab(r, g, b)
  const C = Math.hypot(a, bb)
  if (C < 2) return 0
  return Math.max(0, C - maxChroma(Math.min(PAPER_L - 0.5, Math.max(BLACK_L + 0.5, L)), hueOf(a, bb)))
}

/** Naive separation with grey-component replacement `gcr` (0–1). Returns total ink coverage in %. */
export function tac(r: number, g: number, b: number, gcr = 0.5): number {
  const R = r / 255, G = g / 255, B = b / 255
  const kFull = 1 - Math.max(R, G, B)
  const k = kFull * gcr
  if (k >= 1) return 100
  const c = (1 - R - k) / (1 - k), m = (1 - G - k) / (1 - k), y = (1 - B - k) / (1 - k)
  return 100 * (Math.max(0, c) + Math.max(0, m) + Math.max(0, y) + k)
}

// ---------- metadata ----------

export interface Meta {
  format: string
  width?: number
  height?: number
  components?: number
  bitDepth?: number
  dpi?: [number, number]
  dpiSource?: string
  icc?: { space: string; cls: string; version: string; desc: string; size: number }
  iccName?: string
  srgbChunk?: boolean
  adobe?: boolean
  progressive?: boolean
}

const str4 = (b: Uint8Array, o: number) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3])
const be16 = (b: Uint8Array, o: number) => (b[o] << 8) | b[o + 1]
const be32 = (b: Uint8Array, o: number) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0

const CLASSES: Record<string, string> = { mntr: 'Display', prtr: 'Output (printer)', scnr: 'Input (scanner/camera)', spac: 'Colour space', link: 'Device link', abst: 'Abstract', nmcl: 'Named colour' }

/** Parses an ICC profile header and its description tag ('desc' v2 or 'mluc' v4). */
export function parseIcc(p: Uint8Array): Meta['icc'] {
  if (p.length < 132) return undefined
  const space = str4(p, 16).trim(), cls = CLASSES[str4(p, 12)] ?? str4(p, 12)
  const version = `${p[8]}.${p[9] >> 4}`
  let desc = ''
  const n = be32(p, 128)
  for (let i = 0; i < n && 132 + 12 * i + 12 <= p.length; i++) {
    const o = 132 + 12 * i
    if (str4(p, o) !== 'desc') continue
    const off = be32(p, o + 4)
    const type = str4(p, off)
    if (type === 'desc') {
      const len = be32(p, off + 8)
      desc = String.fromCharCode(...p.subarray(off + 12, off + 12 + Math.max(0, len - 1)))
    } else if (type === 'mluc') {
      const recLen = be32(p, off + 20), recOff = be32(p, off + 24)
      const s = p.subarray(off + recOff, off + recOff + recLen)
      for (let k = 0; k + 1 < s.length; k += 2) desc += String.fromCharCode(be16(s, k))
    }
  }
  return { space, cls, version, desc: desc.replace(/\0+$/, ''), size: be32(p, 0) }
}

export function inspect(b: Uint8Array): Meta {
  if (b[0] === 0xff && b[1] === 0xd8) {
    const m: Meta = { format: 'JPEG' }
    const icc: Uint8Array[] = []
    let o = 2
    while (o + 4 <= b.length && b[o] === 0xff) {
      const mk = b[o + 1]
      if (mk === 0xd9 || mk === 0xda) break
      const len = be16(b, o + 2), d = o + 4
      if (mk === 0xe0 && str4(b, d) === 'JFIF' && b[d + 7]) {
        const unit = b[d + 7], x = be16(b, d + 8), y = be16(b, d + 10)
        m.dpi = unit === 1 ? [x, y] : [x * 2.54, y * 2.54]
        m.dpiSource = 'JFIF header'
      }
      if (mk === 0xe2 && String.fromCharCode(...b.subarray(d, d + 11)) === 'ICC_PROFILE') icc[b[d + 12] - 1] = b.subarray(d + 14, o + 2 + len)
      if (mk === 0xee && str4(b, d) === 'Adob') m.adobe = true
      if ((mk >= 0xc0 && mk <= 0xcf) && mk !== 0xc4 && mk !== 0xc8 && mk !== 0xcc) {
        m.bitDepth = b[d]
        m.height = be16(b, d + 1)
        m.width = be16(b, d + 3)
        m.components = b[d + 5]
        m.progressive = mk === 0xc2
      }
      o += 2 + len
    }
    if (icc.length && icc.every(Boolean)) {
      const all = new Uint8Array(icc.reduce((a, c) => a + c.length, 0))
      let k = 0
      for (const c of icc) { all.set(c, k); k += c.length }
      m.icc = parseIcc(all)
    }
    return m
  }
  if (b[0] === 0x89 && str4(b, 1).startsWith('PNG')) {
    const m: Meta = { format: 'PNG' }
    let o = 8
    while (o + 8 <= b.length) {
      const len = be32(b, o), type = str4(b, o + 4), d = o + 8
      if (type === 'IHDR') {
        m.width = be32(b, d)
        m.height = be32(b, d + 4)
        m.bitDepth = b[d + 8]
        m.components = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[b[d + 9]]
      }
      if (type === 'pHYs' && b[d + 8] === 1) {
        m.dpi = [be32(b, d) * 0.0254, be32(b, d + 4) * 0.0254]
        m.dpiSource = 'PNG pHYs'
      }
      if (type === 'iCCP') {
        let e = d
        while (b[e] && e < d + 80) e++
        m.iccName = String.fromCharCode(...b.subarray(d, e))
      }
      if (type === 'sRGB') m.srgbChunk = true
      if (type === 'IEND') break
      o += 12 + len
    }
    return m
  }
  if (str4(b, 0) === 'RIFF' && str4(b, 8) === 'WEBP') return { format: 'WebP' }
  if ((b[0] === 0x49 && b[1] === 0x49) || (b[0] === 0x4d && b[1] === 0x4d)) return { format: 'TIFF' }
  if (str4(b, 0) === 'GIF8') return { format: 'GIF' }
  return { format: 'Unknown' }
}

export const SIZES: [string, number, number][] = [
  ['A4 (210 × 297 mm)', 210, 297], ['A5 (148 × 210 mm)', 148, 210], ['A3 (297 × 420 mm)', 297, 420], ['US Letter (8.5 × 11 in)', 215.9, 279.4],
  ['Photo 4 × 6 in', 101.6, 152.4], ['Photo 5 × 7 in', 127, 177.8], ['Photo 8 × 10 in', 203.2, 254], ['Poster 18 × 24 in', 457.2, 609.6],
  ['Poster 24 × 36 in', 609.6, 914.4], ['Business card (85 × 55 mm)', 85, 55], ['US business card (3.5 × 2 in)', 88.9, 50.8], ['Postcard A6 (105 × 148 mm)', 105, 148],
]
