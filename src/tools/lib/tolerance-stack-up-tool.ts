// 1-D tolerance stack-up: worst case, RSS, modified RSS and Monte Carlo.

export type Dist = 'normal' | 'uniform' | 'triangular'

export interface Dim {
  id: string
  name: string
  dir: 1 | -1
  nom: number
  plus: number
  minus: number
  dist: Dist
  /** For normal: how many sigmas the tolerance band spans on each side (3 = Cp 1.0, 4 = Cp 1.33). */
  sigmas: number
}

/** Midpoint of the tolerance band and its half-width. */
export function band(d: Dim) {
  const hi = d.nom + d.plus
  const lo = d.nom - d.minus
  return { mid: (hi + lo) / 2, half: (hi - lo) / 2 }
}

/** Standard deviation of a dimension given its distribution. */
export function sigmaOf(d: Dim): number {
  const { half } = band(d)
  if (d.dist === 'uniform') return half / Math.sqrt(3)
  if (d.dist === 'triangular') return half / Math.sqrt(6)
  return half / (d.sigmas > 0 ? d.sigmas : 3)
}

export interface Analysis {
  nominal: number
  mean: number
  wcMin: number
  wcMax: number
  wcTol: number
  rssTol: number
  mrssTol: number
  sigma: number
  contrib: { id: string; wc: number; rss: number }[]
}

/** Bender's modified RSS factor. */
export const BENDER = 1.5

export function analyze(dims: Dim[]): Analysis {
  let nominal = 0, mean = 0, wc = 0, rss2 = 0, var2 = 0
  for (const d of dims) {
    const { mid, half } = band(d)
    nominal += d.dir * d.nom
    mean += d.dir * mid
    wc += half
    rss2 += half * half
    var2 += sigmaOf(d) ** 2
  }
  const rssTol = Math.sqrt(rss2)
  return {
    nominal,
    mean,
    wcMin: mean - wc,
    wcMax: mean + wc,
    wcTol: wc,
    rssTol,
    mrssTol: Math.min(wc, BENDER * rssTol),
    sigma: Math.sqrt(var2),
    contrib: dims.map((d) => {
      const { half } = band(d)
      return { id: d.id, wc: wc ? half / wc : 0, rss: var2 ? sigmaOf(d) ** 2 / var2 : 0 }
    }),
  }
}

/** Deterministic PRNG (mulberry32). */
export function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function monteCarlo(dims: Dim[], n: number, seed = 1): Float64Array {
  const r = rng(seed)
  const out = new Float64Array(n)
  const pre = dims.map((d) => ({ ...band(d), d, s: sigmaOf(d) }))
  for (let i = 0; i < n; i++) {
    let g = 0
    for (const { mid, half, d, s } of pre) {
      let x: number
      if (d.dist === 'uniform') x = mid + (r() * 2 - 1) * half
      else if (d.dist === 'triangular') x = mid + (r() + r() - 1) * half
      else {
        // Box–Muller
        const u = Math.max(1e-12, r())
        x = mid + s * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r())
      }
      g += d.dir * x
    }
    out[i] = g
  }
  return out
}

export function summarize(xs: Float64Array, lsl?: number, usl?: number) {
  const n = xs.length
  let s = 0, min = Infinity, max = -Infinity, out = 0
  for (const x of xs) {
    s += x
    if (x < min) min = x
    if (x > max) max = x
    if ((lsl !== undefined && x < lsl) || (usl !== undefined && x > usl)) out++
  }
  const mean = s / n
  let v = 0
  for (const x of xs) v += (x - mean) ** 2
  const sd = Math.sqrt(v / Math.max(1, n - 1))
  return { mean, sd, min, max, outFrac: out / n }
}

export function histogram(xs: Float64Array, lo: number, hi: number, bins: number): number[] {
  const h = new Array<number>(bins).fill(0)
  const w = (hi - lo) / bins
  for (const x of xs) {
    const k = Math.floor((x - lo) / w)
    if (k >= 0 && k < bins) h[k]++
    else if (k === bins && x === hi) h[bins - 1]++
  }
  return h
}

/** Standard normal CDF (Abramowitz–Stegun 7.1.26 erf, |error| < 1.5e-7). */
export function phi(z: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2)
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t) * Math.exp(-(z * z) / 2)
  return z >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y)
}

/** Predicted fraction outside [lsl, usl] assuming a normal result. */
export function predictedOut(mean: number, sd: number, lsl: number, usl: number): number {
  if (!(sd > 0)) return mean < lsl || mean > usl ? 1 : 0
  return phi((lsl - mean) / sd) + 1 - phi((usl - mean) / sd)
}

export function capability(mean: number, sd: number, lsl: number, usl: number) {
  return { cp: (usl - lsl) / (6 * sd), cpk: Math.min(usl - mean, mean - lsl) / (3 * sd) }
}
