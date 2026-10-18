// Room palette: decorating roles (wall/trim/floor/furnishing/accent) for colours clustered from a room photo,
// LRV, warm/cool undertone, 60-30-10 balance and harmonious alternatives in CIE LCh.
import { hex, luminance, rgbToLab, type RGB } from './image-palette-extractor'

export { hex, rgbToLab, type RGB }

export type Role = 'wall' | 'trim' | 'floor' | 'furnishing' | 'accent'
export const ROLES: { id: Role; name: string; hint: string }[] = [
  { id: 'wall', name: 'Walls', hint: 'Dominant colour (≈60%)' },
  { id: 'furnishing', name: 'Furnishings', hint: 'Sofa, curtains, large pieces (≈30%)' },
  { id: 'accent', name: 'Accent', hint: 'Cushions, art, a feature item (≈10%)' },
  { id: 'trim', name: 'Trim', hint: 'Skirting, door and window frames, ceiling' },
  { id: 'floor', name: 'Floor', hint: 'Boards, tiles or rug base' },
]

/** Light reflectance value 0–100 (CIE Y of the sRGB colour). */
export const lrv = (c: RGB) => luminance(c) * 100

export function lrvWord(v: number): string {
  if (v >= 80) return 'Very light'
  if (v >= 60) return 'Light'
  if (v >= 40) return 'Mid'
  if (v >= 20) return 'Mid-dark'
  return 'Dark'
}

const fInv = (t: number) => (t ** 3 > 216 / 24389 ? t ** 3 : (116 * t - 16) / (24389 / 27))
const gam = (v: number) => {
  const c = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055
  return Math.round(Math.min(1, Math.max(0, c)) * 255)
}

export function labToRgb([L, a, b]: RGB): RGB {
  const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200
  const x = fInv(fx) * 0.95047, y = fInv(fy), z = fInv(fz) * 1.08883
  return [gam(3.2404542 * x - 1.5371385 * y - 0.4985314 * z), gam(-0.969266 * x + 1.8760108 * y + 0.041556 * z), gam(0.0556434 * x - 0.2040259 * y + 1.0572252 * z)]
}

export function lch(c: RGB): RGB {
  const [L, a, b] = rgbToLab(c)
  const h = (Math.atan2(b, a) * 180) / Math.PI
  return [L, Math.hypot(a, b), (h + 360) % 360]
}

export function fromLch(L: number, C: number, h: number): RGB {
  const r = (h * Math.PI) / 180
  return labToRgb([Math.min(100, Math.max(0, L)), C * Math.cos(r), C * Math.sin(r)])
}

export interface Undertone { kind: 'warm' | 'cool' | 'neutral'; label: string }

/** Warm/cool reading from the Lab hue angle; near-greys report the faint cast. */
export function undertone(c: RGB): Undertone {
  const [, C, h] = lch(c)
  if (C < 2.5) return { kind: 'neutral', label: 'True neutral' }
  const cast = h < 20 || h >= 345 ? 'pink' : h < 50 ? 'red' : h < 75 ? 'orange' : h < 105 ? 'yellow' : h < 160 ? 'green' : h < 230 ? 'blue-green' : h < 315 ? 'blue' : 'violet'
  const kind = h >= 345 || h < 105 ? 'warm' : 'cool'
  if (C < 10) return { kind, label: `${kind === 'warm' ? 'Warm' : 'Cool'} neutral (${cast} undertone)` }
  return { kind, label: `${kind === 'warm' ? 'Warm' : 'Cool'} ${cast}` }
}

export interface Region { rgb: RGB; share: number; /** mean vertical position 0 (top) … 1 (bottom) */ y: number }

/** Assigns every sampled pixel to its nearest centre (Lab) and measures share + mean height per centre. */
export function regions(data: Uint8ClampedArray, w: number, h: number, centres: RGB[], step = 2): Region[] {
  const labs = centres.map(rgbToLab)
  const n = centres.map(() => 0), ys = centres.map(() => 0)
  let tot = 0
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const i = (y * w + x) * 4
      if (data[i + 3] < 128) continue
      const L = rgbToLab([data[i], data[i + 1], data[i + 2]])
      let best = 0, bd = Infinity
      labs.forEach((c, k) => {
        const d = (c[0] - L[0]) ** 2 + (c[1] - L[1]) ** 2 + (c[2] - L[2]) ** 2
        if (d < bd) { bd = d; best = k }
      })
      n[best]++
      ys[best] += y / Math.max(1, h - 1)
      tot++
    }
  }
  return centres.map((rgb, k) => ({ rgb, share: tot ? n[k] / tot : 0, y: n[k] ? ys[k] / n[k] : 0.5 }))
}

/** Picks a colour index for each role (distinct where possible). */
export function assignRoles(rs: Region[]): Record<Role, number> {
  const info = rs.map((r, i) => { const [L, C] = lch(r.rgb); return { i, L, C, share: r.share, y: r.y } })
  const used = new Set<number>()
  const take = (score: (x: (typeof info)[number]) => number) => {
    const pool = info.filter((x) => !used.has(x.i))
    const src = pool.length ? pool : info
    const best = src.reduce((a, b) => (score(b) > score(a) ? b : a))
    used.add(best.i)
    return best.i
  }
  const accent = take((x) => x.C * Math.max(0.001, x.share) ** 0.2 * (x.share >= 0.005 ? 1 : 0.2))
  const floor = take((x) => x.y * 2 + x.share - (x.L > 80 ? 1 : 0))
  const wall = take((x) => x.share * (x.y < 0.6 ? 1.5 : 0.7) * (x.L > 35 ? 1 : 0.4) * (x.C < 35 ? 1 : 0.6))
  const trim = take((x) => x.L - x.C * 0.8)
  const furnishing = take((x) => x.share)
  return { wall, floor, accent, trim, furnishing }
}

export interface Balance { dominant: number; secondary: number; accent: number; score: number }

/** 60-30-10 check: dominant = walls + trim, secondary = furnishings + floor, accent = accent (shares renormalised). */
export function balance(share: Record<Role, number>): Balance {
  const d = share.wall + share.trim, s = share.furnishing + share.floor, a = share.accent
  const t = d + s + a || 1
  const r = { dominant: d / t, secondary: s / t, accent: a / t }
  const err = Math.abs(r.dominant - 0.6) + Math.abs(r.secondary - 0.3) + Math.abs(r.accent - 0.1)
  return { ...r, score: Math.max(0, 1 - err / 1.6) }
}

export interface Alt { name: string; colors: RGB[] }

/** Harmonious alternatives around a base colour (keeps its lightness/chroma, rotates hue in LCh). */
export function harmonies(base: RGB): Alt[] {
  const [L, C0, h] = lch(base)
  const C = Math.max(C0, 18)
  const rot = (d: number, l = L, c = C) => fromLch(l, c, (h + d + 360) % 360)
  return [
    { name: 'Analogous', colors: [rot(-30), base, rot(30)] },
    { name: 'Complementary', colors: [base, rot(180)] },
    { name: 'Split complementary', colors: [base, rot(150), rot(210)] },
    { name: 'Triadic', colors: [base, rot(120), rot(240)] },
    { name: 'Tonal (same hue)', colors: [rot(0, Math.min(95, L + 25), C0 * 0.6), base, rot(0, Math.max(15, L - 25), C0 * 1.1)] },
  ]
}

/** Lighter/darker versions of a colour at target LRVs (hue kept, chroma eased off for very light tones). */
export function lrvSteps(base: RGB, targets = [85, 70, 55, 40, 25]): RGB[] {
  const [, C, h] = lch(base)
  return targets.map((t) => {
    let lo = 0, hi = 100
    for (let k = 0; k < 30; k++) {
      const m = (lo + hi) / 2
      if (lrv(fromLch(m, C * (t > 70 ? 0.6 : 1), h)) < t) lo = m
      else hi = m
    }
    return fromLch((lo + hi) / 2, C * (t > 70 ? 0.6 : 1), h)
  })
}
