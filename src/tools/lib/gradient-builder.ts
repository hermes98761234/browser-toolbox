// Gradient maths: sRGB ↔ linear ↔ OKLab ↔ OKLCH, multi-stop interpolation, CSS output and per-pixel geometry.

export type Space = 'srgb' | 'srgb-linear' | 'oklab' | 'oklch'
export type Kind = 'linear' | 'radial' | 'conic'
export interface Stop { id: string; color: string; pos: number; alpha: number } // pos 0–100
export type RGB = [number, number, number] // 0–1 sRGB

export function hexToRgb(hex: string): RGB {
  let h = hex.trim().replace(/^#/, '')
  if (h.length === 3) h = [...h].map((c) => c + c).join('')
  const n = parseInt(h.slice(0, 6), 16)
  if (!/^[0-9a-f]{6}/i.test(h) || Number.isNaN(n)) return [0, 0, 0]
  return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}
const c255 = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255)
export const rgbToHex = ([r, g, b]: RGB) => '#' + [r, g, b].map((v) => c255(v).toString(16).padStart(2, '0')).join('')

const toLin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const toGam = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.sign(c) * Math.abs(c) ** (1 / 2.4) - 0.055)

export function rgbToOklab([r, g, b]: RGB): RGB {
  const R = toLin(r), G = toLin(g), B = toLin(b)
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B)
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B)
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B)
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s]
}
export function oklabToRgb([L, a, b]: RGB): RGB {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [toGam(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s), toGam(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s), toGam(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)]
}
export function oklabToOklch([L, a, b]: RGB): RGB {
  const C = Math.hypot(a, b)
  return [L, C, C < 1e-4 ? NaN : ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360]
}
export function oklchToOklab([L, C, h]: RGB): RGB {
  const hr = ((Number.isNaN(h) ? 0 : h) * Math.PI) / 180
  return [L, C * Math.cos(hr), C * Math.sin(hr)]
}

/** Converts sRGB into the interpolation space's coordinates. */
function into(space: Space, c: RGB): RGB {
  if (space === 'srgb') return c
  if (space === 'srgb-linear') return c.map(toLin) as RGB
  const lab = rgbToOklab(c)
  return space === 'oklab' ? lab : oklabToOklch(lab)
}
function out(space: Space, c: RGB): RGB {
  if (space === 'srgb') return c
  if (space === 'srgb-linear') return c.map(toGam) as RGB
  return oklabToRgb(space === 'oklab' ? c : oklchToOklab(c))
}

/** Interpolates two colours (with alpha, premultiplied like CSS) at t ∈ [0,1]. */
export function mix(space: Space, a: RGB, aa: number, b: RGB, ba: number, t: number): [RGB, number] {
  const A = into(space, a), B = into(space, b)
  const alpha = aa + (ba - aa) * t
  const res: number[] = []
  for (let i = 0; i < 3; i++) {
    let x = A[i], y = B[i]
    const hue = space === 'oklch' && i === 2
    if (hue) {
      // missing hue (achromatic) takes the other colour's hue; shorter arc
      if (Number.isNaN(x)) x = y
      if (Number.isNaN(y)) y = x
      if (Number.isNaN(x)) { res.push(NaN); continue }
      let d = y - x
      if (d > 180) d -= 360
      if (d < -180) d += 360
      res.push((x + d * t + 360) % 360)
    } else {
      const px = x * aa, py = y * ba
      const v = px + (py - px) * t
      res.push(alpha > 0 ? v / alpha : x + (y - x) * t)
    }
  }
  return [out(space, res as RGB), alpha]
}

/** Colour of a multi-stop gradient at position p (0–100). */
export function sample(stops: Stop[], space: Space, p: number): [RGB, number] {
  const s = [...stops].sort((x, y) => x.pos - y.pos)
  if (!s.length) return [[0, 0, 0], 0]
  if (p <= s[0].pos) return [hexToRgb(s[0].color), s[0].alpha]
  const last = s[s.length - 1]
  if (p >= last.pos) return [hexToRgb(last.color), last.alpha]
  let i = 0
  while (i < s.length - 2 && p > s[i + 1].pos) i++
  const a = s[i], b = s[i + 1]
  const t = b.pos === a.pos ? 1 : (p - a.pos) / (b.pos - a.pos)
  return mix(space, hexToRgb(a.color), a.alpha, hexToRgb(b.color), b.alpha, t)
}

export const cssColor = (hex: string, alpha: number) => (alpha >= 1 ? hex : `${hex}${c255(alpha).toString(16).padStart(2, '0')}`)

export interface Geometry { kind: Kind; angle: number; cx: number; cy: number }

/** Gradient position (0–100) for pixel (x, y) in a w×h box, matching CSS geometry. */
export function positionAt(g: Geometry, x: number, y: number, w: number, h: number): number {
  if (g.kind === 'linear') {
    const th = (g.angle * Math.PI) / 180
    const len = Math.abs(w * Math.sin(th)) + Math.abs(h * Math.cos(th))
    return (((x - w / 2) * Math.sin(th) - (y - h / 2) * Math.cos(th)) / len + 0.5) * 100
  }
  const cx = (g.cx / 100) * w, cy = (g.cy / 100) * h
  if (g.kind === 'radial') {
    const far = Math.max(Math.hypot(cx, cy), Math.hypot(w - cx, cy), Math.hypot(cx, h - cy), Math.hypot(w - cx, h - cy))
    return (Math.hypot(x - cx, y - cy) / (far || 1)) * 100
  }
  const a = Math.atan2(x - cx, -(y - cy)) - (g.angle * Math.PI) / 180
  return ((((a / (2 * Math.PI)) % 1) + 1) % 1) * 100
}

/** CSS gradient string; `in <space>` for modern browsers. */
export function css(stops: Stop[], space: Space, g: Geometry): string {
  const list = [...stops].sort((a, b) => a.pos - b.pos).map((s) => `${cssColor(s.color, s.alpha)} ${+s.pos.toFixed(1)}%`).join(', ')
  const sp = space === 'srgb' ? '' : `in ${space}`
  if (g.kind === 'linear') return `linear-gradient(${[sp, `${g.angle}deg`].filter(Boolean).join(' ')}, ${list})`
  if (g.kind === 'radial') return `radial-gradient(circle farthest-corner at ${g.cx}% ${g.cy}%${sp ? ` ${sp}` : ''}, ${list})`
  return `conic-gradient(from ${g.angle}deg at ${g.cx}% ${g.cy}%${sp ? ` ${sp}` : ''}, ${list})`
}

/** sRGB-only fallback: bakes the chosen interpolation into `n` evenly spaced stops. */
export function fallbackCss(stops: Stop[], space: Space, g: Geometry, n = 12): string {
  const s = [...stops].sort((a, b) => a.pos - b.pos)
  const lo = s[0]?.pos ?? 0, hi = s[s.length - 1]?.pos ?? 100
  const baked: Stop[] = Array.from({ length: n + 1 }, (_, i) => {
    const p = lo + ((hi - lo) * i) / n
    const [c, a] = sample(stops, space, p)
    return { id: String(i), color: rgbToHex(c), pos: p, alpha: +a.toFixed(3) }
  })
  return css(baked, 'srgb', g)
}
