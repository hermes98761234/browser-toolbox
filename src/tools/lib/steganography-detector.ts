// LSB steganalysis on RGBA pixel buffers: bit planes, the Westfeld–Pfitzmann chi-square attack and
// RS analysis (Fridrich, Goljan & Du 2001), implemented from the published descriptions.

export type Px = Uint8ClampedArray
export type Ch = 0 | 1 | 2

/** Grayscale RGBA image of one bit plane of one channel (or the OR of RGB when ch = 'all'). */
export function bitPlane(d: Px, ch: Ch | 'all', bit: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(d.length)
  for (let i = 0; i < d.length; i += 4) {
    const v = ch === 'all' ? (((d[i] >> bit) & 1) * 4 + ((d[i + 1] >> bit) & 1) * 2 + ((d[i + 2] >> bit) & 1)) : (d[i + ch] >> bit) & 1
    if (ch === 'all') {
      out[i] = (v & 4 ? 255 : 0)
      out[i + 1] = (v & 2 ? 255 : 0)
      out[i + 2] = (v & 1 ? 255 : 0)
    } else out[i] = out[i + 1] = out[i + 2] = v ? 255 : 0
    out[i + 3] = 255
  }
  return out
}

export function histogram(d: Px, ch: Ch, from = 0, to = d.length / 4): number[] {
  const h = new Array(256).fill(0)
  for (let p = from; p < to; p++) h[d[p * 4 + ch]]++
  return h
}

// ---------- chi-square distribution (regularised lower incomplete gamma)
function lnGamma(z: number): number {
  // Lanczos approximation (g = 7, n = 9)
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7]
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z)
  z -= 1
  let x = c[0]
  for (let i = 1; i < 9; i++) x += c[i] / (z + i)
  const t = z + 7.5
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x)
}

/** P(a, x): regularised lower incomplete gamma. Series for x < a + 1, continued fraction otherwise. */
export function gammaP(a: number, x: number): number {
  if (x <= 0) return 0
  const lg = lnGamma(a)
  if (x < a + 1) {
    let sum = 1 / a, term = sum
    for (let n = 1; n < 1000; n++) {
      term *= x / (a + n)
      sum += term
      if (Math.abs(term) < Math.abs(sum) * 1e-15) break
    }
    return sum * Math.exp(-x + a * Math.log(x) - lg)
  }
  // Lentz continued fraction for Q(a, x)
  let b = x + 1 - a, c = 1e300, d = 1 / b, h = d
  for (let i = 1; i < 1000; i++) {
    const an = -i * (i - a)
    b += 2
    d = an * d + b
    if (Math.abs(d) < 1e-300) d = 1e-300
    c = b + an / c
    if (Math.abs(c) < 1e-300) c = 1e-300
    d = 1 / d
    const del = d * c
    h *= del
    if (Math.abs(del - 1) < 1e-15) break
  }
  return 1 - Math.exp(-x + a * Math.log(x) - lg) * h
}

export const chi2Cdf = (x: number, df: number) => gammaP(df / 2, x / 2)

/**
 * Westfeld–Pfitzmann: LSB replacement equalises the counts of each pair of values (2k, 2k+1).
 * Returns χ², degrees of freedom and p = probability of embedding (1 − CDF).
 */
export function chiSquare(h: number[], minExpected = 5): { chi2: number; df: number; p: number } {
  let chi2 = 0, k = 0
  for (let i = 0; i < 128; i++) {
    const a = h[2 * i], b = h[2 * i + 1]
    const exp = (a + b) / 2
    if (exp < minExpected) continue
    chi2 += ((a - exp) ** 2) / exp
    k++
  }
  const df = Math.max(1, k - 1)
  return { chi2, df, p: k < 2 ? 0 : 1 - chi2Cdf(chi2, df) }
}

/** p-value of the chi-square attack over growing prefixes of the image (raster order). */
export function chiSeries(d: Px, ch: Ch, steps = 40): [number, number][] {
  const n = d.length / 4
  const out: [number, number][] = []
  const h = new Array(256).fill(0)
  let done = 0
  for (let s = 1; s <= steps; s++) {
    const to = Math.round((s / steps) * n)
    for (; done < to; done++) h[d[done * 4 + ch]]++
    out.push([(s / steps) * 100, chiSquare(h).p])
  }
  return out
}

// ---------- RS analysis
const flip1 = (x: number) => x ^ 1 // 2k ↔ 2k+1
const flipN = (x: number) => ((x + 1) ^ 1) - 1 // −1 ↔ 0, 1 ↔ 2, …

export interface RS { rm: number; sm: number; rmn: number; smn: number }

/** Counts regular / singular groups of 4 horizontal pixels for mask [0 1 1 0] and its negative. */
export function rsCounts(get: (i: number) => number, w: number, h: number, flipAll = false): RS {
  const M = [0, 1, 1, 0]
  let rm = 0, sm = 0, rmn = 0, smn = 0, groups = 0
  const g = [0, 0, 0, 0], a = [0, 0, 0, 0], b = [0, 0, 0, 0]
  const f = (v: number[]) => Math.abs(v[1] - v[0]) + Math.abs(v[2] - v[1]) + Math.abs(v[3] - v[2])
  for (let y = 0; y < h; y++) {
    for (let x = 0; x + 4 <= w; x += 4) {
      for (let k = 0; k < 4; k++) {
        const v = get(y * w + x + k)
        g[k] = flipAll ? flip1(v) : v
      }
      const f0 = f(g)
      for (let k = 0; k < 4; k++) {
        a[k] = M[k] ? flip1(g[k]) : g[k]
        b[k] = M[k] ? flipN(g[k]) : g[k]
      }
      const fa = f(a), fb = f(b)
      if (fa > f0) rm++
      else if (fa < f0) sm++
      if (fb > f0) rmn++
      else if (fb < f0) smn++
      groups++
    }
  }
  const n = groups || 1
  return { rm: rm / n, sm: sm / n, rmn: rmn / n, smn: smn / n }
}

/**
 * Estimated fraction p of pixels carrying message bits (0 = clean, 1 = full capacity), from the
 * RS counts of the image and of the image with all LSBs flipped.
 */
export function rsEstimate(a: RS, b: RS): number {
  const d0 = a.rm - a.sm, d1 = b.rm - b.sm, dn0 = a.rmn - a.smn, dn1 = b.rmn - b.smn
  const A = 2 * (d1 + d0), B = dn0 - dn1 - d1 - 3 * d0, C = d0 - dn0
  let x: number
  if (Math.abs(A) < 1e-12) x = Math.abs(B) < 1e-12 ? 0 : -C / B
  else {
    const disc = B * B - 4 * A * C
    if (disc < 0) return NaN
    const r1 = (-B + Math.sqrt(disc)) / (2 * A), r2 = (-B - Math.sqrt(disc)) / (2 * A)
    x = Math.abs(r1) < Math.abs(r2) ? r1 : r2
  }
  return x / (x - 0.5)
}

export function rsAnalysis(d: Px, w: number, h: number, ch: Ch): RS & { rate: number; flipped: RS } {
  const get = (i: number) => d[i * 4 + ch]
  const a = rsCounts(get, w, h)
  const b = rsCounts(get, w, h, true)
  return { ...a, flipped: b, rate: rsEstimate(a, b) }
}

// ---------- demo data
export function mulberry32(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Synthetic "photo": soft sky gradient, hills, sun and sensor noise, then a contrast stretch that
 * leaves the comb-shaped histogram typical of edited images.
 */
export function coverImage(w: number, h: number, seed = 5, noise = 2, stretch = 1.15): Uint8ClampedArray {
  const rnd = mulberry32(seed)
  const d = new Uint8ClampedArray(w * h * 4)
  const gauss = () => (rnd() + rnd() + rnd() - 1.5) * 2
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const u = x / w, v = y / h
    const hill = 0.62 + 0.08 * Math.sin(u * 7 + 1) + 0.05 * Math.sin(u * 17)
    const sun = Math.exp(-(((u - 0.72) ** 2 + (v - 0.25) ** 2) / 0.006))
    let r: number, g: number, b: number
    if (v < hill) { r = 90 + 60 * v + 120 * sun; g = 130 + 50 * v + 100 * sun; b = 190 + 30 * v + 40 * sun }
    else { const t = (v - hill) * 3; r = 60 + 30 * t + 10 * Math.sin(x * 0.3); g = 110 - 20 * t + 12 * Math.sin(y * 0.21 + x * 0.05); b = 50 + 10 * t }
    const i = (y * w + x) * 4
    const n = gauss() * noise
    // contrast stretch ×1.15 around 128 → some code values are skipped (comb histogram)
    const k = 128 * (1 - stretch)
    d[i] = Math.round(Math.round(r + n) * stretch + k)
    d[i + 1] = Math.round(Math.round(g + gauss() * noise) * stretch + k)
    d[i + 2] = Math.round(Math.round(b + gauss() * noise) * stretch + k)
    d[i + 3] = 255
  }
  return d
}

/** LSB replacement of pseudo-random message bits in the first `rate` fraction of pixels (RGB, raster order). */
export function embedLsb(src: Px, rate: number, seed = 99): Uint8ClampedArray {
  const d = new Uint8ClampedArray(src)
  const rnd = mulberry32(seed)
  const n = Math.floor((d.length / 4) * Math.max(0, Math.min(1, rate)))
  for (let p = 0; p < n; p++) for (let c = 0; c < 3; c++) {
    const i = p * 4 + c
    d[i] = (d[i] & 0xfe) | (rnd() < 0.5 ? 1 : 0)
  }
  return d
}

export function verdict(chiP: number, rsRate: number): { level: 'clean' | 'suspicious' | 'likely'; text: string } {
  if (chiP > 0.9 || rsRate > 0.25) return { level: 'likely', text: 'Strong statistical signs of LSB embedding' }
  if (chiP > 0.5 || rsRate > 0.08) return { level: 'suspicious', text: 'Some signs of LSB embedding — inconclusive' }
  return { level: 'clean', text: 'No sign of LSB replacement detected' }
}
