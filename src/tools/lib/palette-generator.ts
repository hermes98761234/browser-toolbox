// Colour math: sRGB ↔ HSL ↔ OKLCH, harmony rules, tint/shade scales and WCAG contrast.

export type RGB = [number, number, number] // 0..255
export type HSL = [number, number, number] // h 0..360, s/l 0..100
export type LCH = [number, number, number] // L 0..1, C 0..~0.4, h 0..360

export function hexToRgb(hex: string): RGB | null {
  let h = hex.trim().replace(/^#/, '')
  if (/^[0-9a-f]{3}$/i.test(h)) h = [...h].map((c) => c + c).join('')
  if (!/^[0-9a-f]{6}$/i.test(h)) return null
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB
}
export const rgbToHex = (c: RGB) => '#' + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')

export function rgbToHsl([r, g, b]: RGB): HSL {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2
  if (max === min) return [0, 0, l * 100]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [h * 60, s * 100, l * 100]
}
export function hslToRgb([h, s, l]: HSL): RGB {
  h = ((h % 360) + 360) % 360; s /= 100; l /= 100
  const k = (n: number) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))
  return [f(0) * 255, f(8) * 255, f(4) * 255]
}

const toLin = (v: number) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
const fromLin = (v: number) => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055)

export function rgbToOklch(c: RGB): LCH {
  const [r, g, b] = c.map(toLin)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  return [L, Math.hypot(A, B), ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360]
}
function oklchToLinear([L, C, h]: LCH): [number, number, number] {
  const a = C * Math.cos((h * Math.PI) / 180), b = C * Math.sin((h * Math.PI) / 180)
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s]
}
const inGamut = (v: number[]) => v.every((x) => x >= -1e-4 && x <= 1 + 1e-4)
/** OKLCH → sRGB, reducing chroma until the colour fits the sRGB gamut. */
export function oklchToRgb(c: LCH): RGB {
  let lin = oklchToLinear(c)
  if (!inGamut(lin)) {
    let lo = 0, hi = c[1]
    for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; if (inGamut(oklchToLinear([c[0], mid, c[2]]))) lo = mid; else hi = mid }
    lin = oklchToLinear([c[0], lo, c[2]])
  }
  return lin.map((v) => fromLin(Math.max(0, Math.min(1, v)))) as RGB
}

export function luminance(c: RGB): number {
  const [r, g, b] = c.map(toLin)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
export function contrast(a: RGB, b: RGB): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

export type Rule = 'complementary' | 'split' | 'analogous' | 'triadic' | 'tetradic' | 'square' | 'monochromatic'
export const RULES: [Rule, string, number[]][] = [
  ['complementary', 'Complementary', [0, 180]],
  ['split', 'Split-complementary', [0, 150, 210]],
  ['analogous', 'Analogous', [-60, -30, 0, 30, 60]],
  ['triadic', 'Triadic', [0, 120, 240]],
  ['tetradic', 'Tetradic (rectangle)', [0, 60, 180, 240]],
  ['square', 'Square', [0, 90, 180, 270]],
  ['monochromatic', 'Monochromatic', [0, 0, 0, 0, 0]],
]

/** Harmony colours from a base, rotating hue in HSL or perceptual OKLCH space. */
export function harmony(base: RGB, rule: Rule, space: 'hsl' | 'oklch' = 'oklch', spread = 30): RGB[] {
  const offs = RULES.find((r) => r[0] === rule)![2].map((o) => (rule === 'analogous' ? (o / 30) * spread : o))
  if (rule === 'monochromatic') {
    const [L, C, h] = rgbToOklch(base)
    return [-0.3, -0.15, 0, 0.12, 0.24].map((d) => (d === 0 ? base : oklchToRgb([Math.max(0.12, Math.min(0.97, L + d)), C * (1 - Math.abs(d)), h])))
  }
  if (space === 'hsl') {
    const [h, s, l] = rgbToHsl(base)
    return offs.map((o) => (o === 0 ? base : hslToRgb([h + o, s, l])))
  }
  const [L, C, h] = rgbToOklch(base)
  return offs.map((o) => (o === 0 ? base : oklchToRgb([L, C, (h + o + 360) % 360])))
}

/** Tailwind-like 50…950 scale at fixed OKLCH lightness steps, keeping hue and easing chroma at the ends. */
export const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]
const LIGHT = [0.97, 0.935, 0.885, 0.81, 0.72, 0.63, 0.545, 0.47, 0.395, 0.33, 0.26]
export function scale(base: RGB): RGB[] {
  const [, C, h] = rgbToOklch(base)
  return LIGHT.map((L, i) => oklchToRgb([L, C * (i === 0 ? 0.25 : i === 1 ? 0.45 : i === 10 ? 0.7 : 1), h]))
}

export const fmtRgb = (c: RGB) => `rgb(${c.map((v) => Math.round(v)).join(', ')})`
export const fmtHsl = (c: RGB) => { const [h, s, l] = rgbToHsl(c); return `hsl(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%)` }
export const fmtOklch = (c: RGB) => { const [L, C, h] = rgbToOklch(c); return `oklch(${(L * 100).toFixed(1)}% ${C.toFixed(3)} ${h.toFixed(1)})` }
