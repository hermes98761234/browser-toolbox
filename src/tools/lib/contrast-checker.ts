// WCAG 2.x contrast ratio, APCA Lc (WCAG 3 draft), colour parsing and accessible colour suggestions (OKLCH).

export interface RGBA {
  r: number // 0..255
  g: number
  b: number
  a: number // 0..1
}

const NAMED: Record<string, string> = {
  black: '#000000', white: '#ffffff', red: '#ff0000', green: '#008000', blue: '#0000ff', yellow: '#ffff00', orange: '#ffa500',
  purple: '#800080', gray: '#808080', grey: '#808080', silver: '#c0c0c0', navy: '#000080', teal: '#008080', maroon: '#800000',
  olive: '#808000', lime: '#00ff00', aqua: '#00ffff', cyan: '#00ffff', fuchsia: '#ff00ff', magenta: '#ff00ff', pink: '#ffc0cb',
  brown: '#a52a2a', gold: '#ffd700', coral: '#ff7f50', salmon: '#fa8072', tomato: '#ff6347', crimson: '#dc143c', indigo: '#4b0082',
  violet: '#ee82ee', orchid: '#da70d6', khaki: '#f0e68c', beige: '#f5f5dc', ivory: '#fffff0', tan: '#d2b48c', chocolate: '#d2691e',
  darkgray: '#a9a9a9', lightgray: '#d3d3d3', dimgray: '#696969', slategray: '#708090', royalblue: '#4169e1', steelblue: '#4682b4',
  skyblue: '#87ceeb', seagreen: '#2e8b57', forestgreen: '#228b22', darkgreen: '#006400', darkblue: '#00008b', darkred: '#8b0000',
  rebeccapurple: '#663399', hotpink: '#ff69b4', turquoise: '#40e0d0', lavender: '#e6e6fa', mintcream: '#f5fffa', whitesmoke: '#f5f5f5',
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = ((h % 360) + 360) % 360
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255]
}

/** Parses #rgb, #rgba, #rrggbb, #rrggbbaa, rgb()/rgba(), hsl()/hsla() and common colour names. */
export function parseColor(input: string): RGBA | null {
  let s = input.trim().toLowerCase()
  if (NAMED[s]) s = NAMED[s]
  if (s === 'transparent') return { r: 0, g: 0, b: 0, a: 0 }
  let m = /^#?([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(s)
  if (m) {
    let h = m[1]
    if (h.length <= 4) h = [...h].map((c) => c + c).join('')
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1 }
  }
  const num = (v: string, max: number) => (v.endsWith('%') ? (parseFloat(v) / 100) * max : parseFloat(v))
  m = /^rgba?\(\s*([\d.]+%?)[\s,]+([\d.]+%?)[\s,]+([\d.]+%?)(?:[\s,/]+([\d.]+%?))?\s*\)$/.exec(s)
  if (m) {
    const [r, g, b] = [m[1], m[2], m[3]].map((v) => clamp(num(v, 255), 0, 255))
    const a = m[4] ? clamp(num(m[4], 1), 0, 1) : 1
    if ([r, g, b, a].some((v) => Number.isNaN(v))) return null
    return { r, g, b, a }
  }
  m = /^hsla?\(\s*([-\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%(?:[\s,/]+([\d.]+%?))?\s*\)$/.exec(s)
  if (m) {
    const [r, g, b] = hslToRgb(parseFloat(m[1]), clamp(parseFloat(m[2]) / 100, 0, 1), clamp(parseFloat(m[3]) / 100, 0, 1))
    return { r, g, b, a: m[4] ? clamp(num(m[4], 1), 0, 1) : 1 }
  }
  return null
}

export const toHex = (c: RGBA) => '#' + [c.r, c.g, c.b].map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('')

/** Composites a (possibly translucent) colour over an opaque background. */
export const over = (fg: RGBA, bg: RGBA): RGBA => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 })

const lin = (v: number) => {
  const c = v / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

/** WCAG 2.x relative luminance. */
export const luminance = (c: RGBA) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b)

export function contrast(fg: RGBA, bg: RGBA): number {
  const B = bg.a < 1 ? over(bg, { r: 255, g: 255, b: 255, a: 1 }) : bg
  const F = fg.a < 1 ? over(fg, B) : fg
  const l1 = luminance(F), l2 = luminance(B)
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
}

export interface Verdict {
  normalAA: boolean
  normalAAA: boolean
  largeAA: boolean
  largeAAA: boolean
  ui: boolean
}

export const verdict = (r: number): Verdict => ({ normalAA: r >= 4.5, normalAAA: r >= 7, largeAA: r >= 3, largeAAA: r >= 4.5, ui: r >= 3 })

/** APCA-W3 0.0.98G lightness contrast (Lc). Positive: dark text on light; negative: light text on dark. */
export function apca(text: RGBA, bg: RGBA): number {
  const y = (c: RGBA) => {
    const f = (v: number) => (v / 255) ** 2.4
    let Y = 0.2126729 * f(c.r) + 0.7151522 * f(c.g) + 0.072175 * f(c.b)
    if (Y < 0.022) Y += (0.022 - Y) ** 1.414
    return Y
  }
  const B = bg.a < 1 ? over(bg, { r: 255, g: 255, b: 255, a: 1 }) : bg
  const T = text.a < 1 ? over(text, B) : text
  const yt = y(T), yb = y(B)
  if (Math.abs(yb - yt) < 0.0005) return 0
  if (yb > yt) {
    const s = (yb ** 0.56 - yt ** 0.57) * 1.14
    return s < 0.1 ? 0 : (s - 0.027) * 100
  }
  const s = (yb ** 0.65 - yt ** 0.62) * 1.14
  return s > -0.1 ? 0 : (s + 0.027) * 100
}

// ---------- OKLCH ----------

function toOklab(c: RGBA): [number, number, number] {
  const r = lin(c.r), g = lin(c.g), b = lin(c.b)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s]
}

function fromOklab(L: number, A: number, B: number): { rgb: [number, number, number]; inGamut: boolean } {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3
  const lr = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
  const lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
  const lb = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
  const g = (x: number) => (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055)
  const out = [lr, lg, lb].map(g)
  return { rgb: out.map((v) => clamp(v, 0, 1) * 255) as [number, number, number], inGamut: out.every((v) => v >= -1e-4 && v <= 1 + 1e-4) }
}

export function toOklch(c: RGBA): [number, number, number] {
  const [L, a, b] = toOklab(c)
  return [L, Math.hypot(a, b), ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360]
}

export function fromOklch(L: number, C: number, H: number): RGBA {
  const h = (H * Math.PI) / 180
  // reduce chroma until the colour fits in sRGB
  let c = C
  for (let i = 0; i < 40; i++) {
    const r = fromOklab(L, c * Math.cos(h), c * Math.sin(h))
    if (r.inGamut || c < 1e-4) return { r: r.rgb[0], g: r.rgb[1], b: r.rgb[2], a: 1 }
    c *= 0.9
  }
  const r = fromOklab(L, 0, 0)
  return { r: r.rgb[0], g: r.rgb[1], b: r.rgb[2], a: 1 }
}

/**
 * Closest colour (same hue and chroma, changed OKLCH lightness) that reaches `target` contrast against `other`.
 * Tries darker and lighter directions and returns the one with the smallest lightness change.
 */
export function suggest(color: RGBA, other: RGBA, target: number, asBackground = false): { color: RGBA; ratio: number; deltaL: number } | null {
  const [L, C, H] = toOklch(color)
  const ratio = (c: RGBA) => (asBackground ? contrast(other, c) : contrast(c, other))
  const options: { color: RGBA; ratio: number; deltaL: number }[] = []
  for (const end of [0, 1]) {
    const endColor = fromOklch(end, C, H)
    if (ratio(endColor) < target) continue
    let lo = L, hi = end // lo fails, hi passes
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2
      if (ratio(fromOklch(mid, C, H)) >= target) hi = mid
      else lo = mid
    }
    const c = fromOklch(hi, C, H)
    // rounding to 8-bit can drop just below the target: nudge further
    let hex = parseColor(toHex(c))!
    let step = hi
    for (let k = 0; k < 50 && ratio(hex) < target; k++) {
      step += (end - L) * 0.005
      hex = parseColor(toHex(fromOklch(clamp(step, 0, 1), C, H)))!
    }
    options.push({ color: hex, ratio: ratio(hex), deltaL: Math.abs(step - L) })
  }
  if (ratio(color) >= target) return { color: { ...color, a: 1 }, ratio: ratio(color), deltaL: 0 }
  options.sort((a, b) => a.deltaL - b.deltaL)
  return options[0] ?? null
}
