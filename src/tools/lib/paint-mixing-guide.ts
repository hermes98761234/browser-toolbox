// Paint mixing with a home-grown two-constant Kubelka–Munk model.
//
// Each pigment is described by an approximate masstone reflectance curve R∞(λ) (13 samples from
// 400 to 700 nm, hand-tuned by us to give a plausible colour — NOT measured data) and a scattering
// strength S. From R∞ we get K/S = (1 − R)² / 2R, so K(λ) = S · K/S(λ). A mixture with
// concentrations cᵢ has K = Σ cᵢKᵢ and S = Σ cᵢSᵢ, and its opaque-layer reflectance is
//   R = 1 + K/S − √((K/S)² + 2·K/S).
// Spectra are turned into colour with the analytic CIE 1931 colour-matching-function fit of
// Wyman, Sloan & Shirley (JCGT 2013) under an equal-energy illuminant scaled to the D65 white.
// Everything here is an approximation for planning mixes, not a colorimetric prediction.

export interface Pigment { id: string; name: string; ci: string; S: number; r: number[] }

const R = (s: string) => s.split(' ').map(Number)
export const PIGMENTS: Pigment[] = [
  { id: 'white', name: 'Titanium white', ci: 'PW6', S: 1, r: R('.80 .88 .91 .92 .92 .92 .92 .92 .92 .92 .92 .92 .92') },
  { id: 'black', name: 'Ivory black', ci: 'PBk9', S: 0.6, r: R('.012 .012 .012 .012 .012 .012 .012 .012 .013 .013 .014 .015 .016') },
  { id: 'lemon', name: 'Hansa yellow light', ci: 'PY3', S: 0.8, r: R('.08 .08 .09 .14 .40 .72 .82 .85 .86 .86 .86 .86 .86') },
  { id: 'cadyellow', name: 'Cadmium yellow medium', ci: 'PY35', S: 0.8, r: R('.06 .06 .07 .09 .20 .55 .76 .82 .84 .85 .86 .86 .86') },
  { id: 'ochre', name: 'Yellow ochre', ci: 'PY43', S: 0.9, r: R('.07 .07 .08 .09 .12 .22 .38 .50 .55 .57 .58 .59 .60') },
  { id: 'cadorange', name: 'Cadmium orange', ci: 'PO20', S: 0.8, r: R('.05 .05 .05 .05 .06 .10 .28 .62 .78 .82 .83 .84 .84') },
  { id: 'cadred', name: 'Cadmium red medium', ci: 'PR108', S: 0.8, r: R('.05 .05 .05 .05 .05 .05 .06 .12 .45 .70 .76 .78 .78') },
  { id: 'pyrrole', name: 'Pyrrole red', ci: 'PR254', S: 0.55, r: R('.06 .05 .05 .05 .05 .05 .05 .09 .38 .66 .72 .74 .75') },
  { id: 'quinmag', name: 'Quinacridone magenta', ci: 'PR122', S: 0.25, r: R('.14 .16 .14 .08 .04 .03 .03 .04 .12 .35 .50 .56 .58') },
  { id: 'violet', name: 'Dioxazine violet', ci: 'PV23', S: 0.2, r: R('.10 .12 .10 .06 .03 .02 .02 .02 .03 .06 .12 .20 .28') },
  { id: 'ultramarine', name: 'Ultramarine blue', ci: 'PB29', S: 0.25, r: R('.16 .26 .30 .22 .10 .05 .03 .03 .03 .04 .06 .10 .16') },
  { id: 'cobalt', name: 'Cobalt blue', ci: 'PB28', S: 0.6, r: R('.25 .38 .45 .42 .28 .12 .06 .05 .05 .06 .09 .14 .20') },
  { id: 'phthaloblue', name: 'Phthalo blue (GS)', ci: 'PB15:3', S: 0.2, r: R('.10 .14 .18 .18 .14 .07 .03 .02 .02 .02 .02 .03 .04') },
  { id: 'cerulean', name: 'Cerulean blue', ci: 'PB35', S: 0.8, r: R('.18 .28 .36 .42 .40 .26 .12 .06 .05 .05 .05 .06 .07') },
  { id: 'phthalogreen', name: 'Phthalo green (BS)', ci: 'PG7', S: 0.2, r: R('.05 .06 .08 .12 .20 .18 .08 .04 .03 .03 .03 .03 .04') },
  { id: 'viridian', name: 'Viridian', ci: 'PG18', S: 0.3, r: R('.08 .10 .14 .22 .30 .26 .16 .09 .06 .05 .05 .05 .06') },
  { id: 'sienna', name: 'Burnt sienna', ci: 'PBr7', S: 0.5, r: R('.05 .05 .05 .05 .05 .06 .08 .13 .22 .30 .35 .38 .40') },
  { id: 'rawumber', name: 'Raw umber', ci: 'PBr7', S: 0.7, r: R('.04 .04 .04 .045 .05 .06 .07 .08 .09 .10 .11 .12 .13') },
  { id: 'burntumber', name: 'Burnt umber', ci: 'PBr7', S: 0.7, r: R('.04 .04 .04 .04 .045 .05 .06 .07 .09 .11 .13 .15 .16') },
]
export const pig = (id: string) => PIGMENTS.find((p) => p.id === id)

// ---- spectra ----
export const WL = Array.from({ length: 31 }, (_, i) => 400 + i * 10)
/** 13 samples at 25 nm → 31 samples at 10 nm (linear). */
export function resample(r: number[]): number[] {
  return WL.map((w) => {
    const x = (w - 400) / 25
    const i = Math.min(r.length - 2, Math.floor(x))
    const f = x - i
    return r[i] + (r[i + 1] - r[i]) * f
  })
}
const clampR = (v: number) => Math.min(0.999, Math.max(0.001, v))
export const ksOf = (r: number) => (1 - clampR(r)) ** 2 / (2 * clampR(r))
export const rOf = (ks: number) => 1 + ks - Math.sqrt(ks * ks + 2 * ks)

interface KS { K: number[]; S: number }
const cache = new Map<string, KS>()
function ks(p: Pigment): KS {
  let v = cache.get(p.id)
  if (!v) {
    v = { K: resample(p.r).map((r) => ksOf(r) * p.S), S: p.S }
    cache.set(p.id, v)
  }
  return v
}

/** Reflectance spectrum of a mixture; weights need not sum to 1. */
export function mixSpectrum(parts: { id: string; w: number }[]): number[] {
  const use = parts.filter((x) => x.w > 0 && pig(x.id))
  if (!use.length) return WL.map(() => 1)
  const tot = use.reduce((a, x) => a + x.w, 0)
  return WL.map((_, i) => {
    let K = 0, S = 0
    for (const x of use) {
      const k = ks(pig(x.id)!)
      K += (x.w / tot) * k.K[i]
      S += (x.w / tot) * k.S
    }
    return rOf(K / S)
  })
}

// ---- colour ----
const g = (x: number, mu: number, s1: number, s2: number) => Math.exp(-0.5 * ((x - mu) / (x < mu ? s1 : s2)) ** 2)
const CMF = WL.map((w) => [
  1.056 * g(w, 599.8, 37.9, 31.0) + 0.362 * g(w, 442.0, 16.0, 26.7) - 0.065 * g(w, 501.1, 20.4, 26.2),
  0.821 * g(w, 568.8, 46.9, 40.5) + 0.286 * g(w, 530.9, 16.3, 31.1),
  1.217 * g(w, 437.0, 11.8, 36.0) + 0.681 * g(w, 459.0, 26.0, 13.8),
])
const WHITE_E = CMF.reduce((a, c) => [a[0] + c[0], a[1] + c[1], a[2] + c[2]], [0, 0, 0])
const D65 = [0.95047, 1, 1.08883]

export function spectrumToXyz(r: number[]): [number, number, number] {
  const s = [0, 0, 0]
  r.forEach((v, i) => {
    s[0] += v * CMF[i][0]
    s[1] += v * CMF[i][1]
    s[2] += v * CMF[i][2]
  })
  return [(s[0] / WHITE_E[0]) * D65[0], (s[1] / WHITE_E[1]) * D65[1], (s[2] / WHITE_E[2]) * D65[2]]
}

const gam = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)
const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
export function xyzToRgb([x, y, z]: number[]): [number, number, number] {
  const r = 3.2404542 * x - 1.5371385 * y - 0.4985314 * z
  const gg = -0.969266 * x + 1.8760108 * y + 0.041556 * z
  const b = 0.0556434 * x - 0.2040259 * y + 1.0572252 * z
  return [r, gg, b].map((c) => Math.round(Math.min(1, Math.max(0, gam(c))) * 255)) as [number, number, number]
}
export function rgbToXyz([r, g2, b]: number[]): [number, number, number] {
  const [R2, G, B] = [r, g2, b].map((c) => lin(c / 255))
  return [0.4124564 * R2 + 0.3575761 * G + 0.1804375 * B, 0.2126729 * R2 + 0.7151522 * G + 0.072175 * B, 0.0193339 * R2 + 0.119192 * G + 0.9503041 * B]
}
export function xyzToLab([x, y, z]: number[]): [number, number, number] {
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116)
  const fx = f(x / D65[0]), fy = f(y / D65[1]), fz = f(z / D65[2])
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}
export const hex = (rgb: number[]) => '#' + rgb.map((c) => c.toString(16).padStart(2, '0')).join('')
export const parseHex = (h: string): [number, number, number] | null => {
  const m = /^#?([0-9a-f]{6})$/i.exec(h.trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
export const mixRgb = (parts: { id: string; w: number }[]) => xyzToRgb(spectrumToXyz(mixSpectrum(parts)))
export const mixLab = (parts: { id: string; w: number }[]) => xyzToLab(spectrumToXyz(mixSpectrum(parts)))
export const hexLab = (h: string) => xyzToLab(rgbToXyz(parseHex(h) ?? [128, 128, 128]))

/** CIEDE2000 colour difference (Sharma, Wu & Dalal 2005 formulation). */
export function deltaE00(a: number[], b: number[]): number {
  const [L1, a1, b1] = a, [L2, a2, b2] = b
  const rad = Math.PI / 180
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), Cm = (C1 + C2) / 2
  const G = 0.5 * (1 - Math.sqrt(Cm ** 7 / (Cm ** 7 + 25 ** 7)))
  const a1p = (1 + G) * a1, a2p = (1 + G) * a2
  const C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2)
  const h = (bb: number, ap: number) => (bb === 0 && ap === 0 ? 0 : ((Math.atan2(bb, ap) / rad) + 360) % 360)
  const h1 = h(b1, a1p), h2 = h(b2, a2p)
  const dL = L2 - L1, dC = C2p - C1p
  let dh = 0
  if (C1p * C2p !== 0) dh = Math.abs(h2 - h1) <= 180 ? h2 - h1 : h2 - h1 > 180 ? h2 - h1 - 360 : h2 - h1 + 360
  const dH = 2 * Math.sqrt(C1p * C2p) * Math.sin((dh * rad) / 2)
  const Lm = (L1 + L2) / 2, Cmp = (C1p + C2p) / 2
  let hm = h1 + h2
  if (C1p * C2p !== 0) hm = Math.abs(h1 - h2) <= 180 ? (h1 + h2) / 2 : h1 + h2 < 360 ? (h1 + h2 + 360) / 2 : (h1 + h2 - 360) / 2
  const T = 1 - 0.17 * Math.cos((hm - 30) * rad) + 0.24 * Math.cos(2 * hm * rad) + 0.32 * Math.cos((3 * hm + 6) * rad) - 0.2 * Math.cos((4 * hm - 63) * rad)
  const dTheta = 30 * Math.exp(-(((hm - 275) / 25) ** 2))
  const Rc = 2 * Math.sqrt(Cmp ** 7 / (Cmp ** 7 + 25 ** 7))
  const Sl = 1 + (0.015 * (Lm - 50) ** 2) / Math.sqrt(20 + (Lm - 50) ** 2)
  const Sc = 1 + 0.045 * Cmp, Sh = 1 + 0.015 * Cmp * T
  const Rt = -Math.sin(2 * dTheta * rad) * Rc
  return Math.sqrt((dL / Sl) ** 2 + (dC / Sc) ** 2 + (dH / Sh) ** 2 + Rt * (dC / Sc) * (dH / Sh))
}

// ---- matching ----
export interface Fit { ids: string[]; w: number[]; dE: number }

/** Best weights (summing to 1) for the given pigments: coarse grid + pairwise transfer refinement. */
export function fitWeights(ids: string[], target: number[]): Fit {
  const n = ids.length
  const err = (w: number[]) => deltaE00(target, mixLab(ids.map((id, i) => ({ id, w: w[i] }))))
  let best = ids.map(() => 1 / n)
  let bestE = err(best)
  // coarse start: grid in steps of 1/8 (cheap for ≤ 4 pigments)
  const steps = n <= 2 ? 40 : n === 3 ? 12 : 8
  const rec = (i: number, left: number, cur: number[]) => {
    if (i === n - 1) {
      const w = [...cur, left]
      const e = err(w.map((x) => x / steps))
      if (e < bestE) {
        bestE = e
        best = w.map((x) => x / steps)
      }
      return
    }
    for (let k = 0; k <= left; k++) rec(i + 1, left - k, [...cur, k])
  }
  rec(0, steps, [])
  // refine: move mass between pairs with shrinking step
  for (let step = 0.05; step > 0.0005; step /= 2) {
    let improved = true
    while (improved) {
      improved = false
      for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++) {
          if (i === j || best[j] < step) continue
          const w = [...best]
          w[i] += step
          w[j] -= step
          const e = err(w)
          if (e < bestE - 1e-6) {
            best = w
            bestE = e
            improved = true
          }
        }
    }
  }
  return { ids, w: best, dE: bestE }
}

/** Searches pairs and triples of the palette for the closest match. */
export function bestRecipe(palette: string[], target: number[], maxN = 3): Fit[] {
  const out: Fit[] = []
  const P = palette
  for (let i = 0; i < P.length; i++)
    for (let j = i + 1; j < P.length; j++) {
      out.push(fitWeights([P[i], P[j]], target))
      if (maxN >= 3) for (let k = j + 1; k < P.length; k++) out.push(fitWeights([P[i], P[j], P[k]], target))
    }
  // drop components that ended up unused and dedupe
  const seen = new Set<string>()
  return out
    .map((f) => {
      const keep = f.w.map((w, i) => [w, i] as const).filter(([w]) => w > 0.004)
      return { ids: keep.map(([, i]) => f.ids[i]), w: keep.map(([w]) => w), dE: f.dE }
    })
    .sort((a, b) => a.dE - b.dE || a.ids.length - b.ids.length)
    .filter((f) => {
      const k = f.ids.join('+')
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
}

/** Weights → small whole-number parts (max `maxParts` total), e.g. [0.62, 0.38] → [5, 3]. */
export function toParts(w: number[], maxParts = 20): number[] {
  let best: number[] = w.map(() => 1), bestErr = Infinity
  for (let total = 2; total <= maxParts; total++) {
    const p = w.map((x) => Math.round(x * total))
    if (p.some((x, i) => x === 0 && w[i] > 0.02)) continue
    const s = p.reduce((a, b) => a + b, 0) || 1
    const e = Math.max(...w.map((x, i) => Math.abs(x - p[i] / s)))
    if (e < bestErr - 0.004) {
      best = p
      bestErr = e
    }
  }
  return best
}
