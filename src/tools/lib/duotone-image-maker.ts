// Duotone / tritone gradient mapping.
export type RGB = [number, number, number]

export function hexToRgb(h: string): RGB {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(h.trim())
  if (!m) return [0, 0, 0]
  const s = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1]
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16)) as RGB
}
export const rgbToHex = (c: RGB) => '#' + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')

const toLin = (v: number) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
const fromLin = (v: number) => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055)

/** sRGB → CIE Lab (D65). */
export function rgbToLab([r, g, b]: RGB): RGB {
  const R = toLin(r), G = toLin(g), B = toLin(b)
  const X = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047
  const Y = 0.2126729 * R + 0.7151522 * G + 0.072175 * B
  const Z = (0.0193339 * R + 0.119192 * G + 0.9503041 * B) / 1.08883
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116)
  const fx = f(X), fy = f(Y), fz = f(Z)
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}
export function labToRgb([L, a, b]: RGB): RGB {
  const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200
  const inv = (t: number) => (t ** 3 > 216 / 24389 ? t ** 3 : (116 * t - 16) / (24389 / 27))
  const X = inv(fx) * 0.95047, Y = inv(fy), Z = inv(fz) * 1.08883
  const R = 3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z
  const G = -0.969266 * X + 1.8760108 * Y + 0.041556 * Z
  const B = 0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z
  return [fromLin(Math.max(0, R)), fromLin(Math.max(0, G)), fromLin(Math.max(0, B))].map((v) => Math.max(0, Math.min(255, v))) as RGB
}

export type Space = 'rgb' | 'linear' | 'lab'
export function mix(a: RGB, b: RGB, t: number, space: Space): RGB {
  if (space === 'lab') { const A = rgbToLab(a), B = rgbToLab(b); return labToRgb([0, 1, 2].map((i) => A[i] + (B[i] - A[i]) * t) as RGB) }
  if (space === 'linear') return [0, 1, 2].map((i) => fromLin(toLin(a[i]) + (toLin(b[i]) - toLin(a[i])) * t)) as RGB
  return [0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * t) as RGB
}

/** 256-entry lookup table from luminance to colour; optional midtone makes a tritone. */
export function buildLut(shadow: string, highlight: string, space: Space, midtone?: string, midPos = 0.5): Uint8ClampedArray {
  const a = hexToRgb(shadow), b = hexToRgb(highlight), m = midtone ? hexToRgb(midtone) : null
  const lut = new Uint8ClampedArray(256 * 3)
  for (let i = 0; i < 256; i++) {
    const t = i / 255
    const c = !m ? mix(a, b, t, space) : t < midPos ? mix(a, m, t / midPos, space) : mix(m, b, (t - midPos) / (1 - midPos), space)
    lut.set(c, i * 3)
  }
  return lut
}

export interface Adjust { contrast: number; brightness: number; gamma: number; invert: boolean; blend: number }

/** Rec. 709 luma → tone curve → LUT. blend mixes the duotone with the original (0 = full duotone). */
export function applyDuotone(src: Uint8ClampedArray, dst: Uint8ClampedArray, lut: Uint8ClampedArray, adj: Adjust) {
  const curve = new Uint8ClampedArray(256)
  const c = (adj.contrast / 100 + 1) ** 2
  for (let i = 0; i < 256; i++) {
    let v = i / 255
    v = (v - 0.5) * c + 0.5 + adj.brightness / 100
    v = Math.max(0, Math.min(1, v)) ** (1 / adj.gamma)
    if (adj.invert) v = 1 - v
    curve[i] = Math.round(v * 255)
  }
  const k = adj.blend
  for (let p = 0; p < src.length; p += 4) {
    const y = curve[Math.round(0.2126 * src[p] + 0.7152 * src[p + 1] + 0.0722 * src[p + 2])] * 3
    dst[p] = lut[y] + (src[p] - lut[y]) * k
    dst[p + 1] = lut[y + 1] + (src[p + 1] - lut[y + 1]) * k
    dst[p + 2] = lut[y + 2] + (src[p + 2] - lut[y + 2]) * k
    dst[p + 3] = src[p + 3]
  }
}

export const PRESETS: { name: string; s: string; h: string; m?: string }[] = [
  { name: 'Spotify', s: '#1e3264', h: '#f037a5' },
  { name: 'Sunset', s: '#2b1055', h: '#ff9a3c' },
  { name: 'Ocean', s: '#002b5b', h: '#58e0ff' },
  { name: 'Mint', s: '#0b3d2e', h: '#b8ffd5' },
  { name: 'Neon', s: '#240046', h: '#ff00aa' },
  { name: 'Sepia', s: '#2e1a0e', h: '#f5deb3' },
  { name: 'Cyber', s: '#0d0221', h: '#00ff9f' },
  { name: 'Fire', s: '#3a0000', h: '#ffd000', m: '#e63946' },
  { name: 'Bauhaus', s: '#1b1b6f', h: '#ffcc00' },
  { name: 'Retro', s: '#3d1f52', h: '#f9c74f', m: '#f3722c' },
  { name: 'Noir', s: '#000000', h: '#ffffff' },
  { name: 'Cyanotype', s: '#0a2a6b', h: '#e8f4ff' },
]
