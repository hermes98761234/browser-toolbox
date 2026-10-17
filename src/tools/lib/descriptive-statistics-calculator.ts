// Descriptive statistics: parsing pasted data (one series or CSV columns), moments, quantiles (several methods),
// robust measures, t-based confidence interval, Jarque–Bera normality test, histogram binning rules.

export interface Series { name: string; values: number[]; skipped: number }

const NUM = /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i

/** Parses pasted text: CSV/TSV with a header row → one series per numeric column; otherwise every number is one series. */
export function parseData(text: string): Series[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  if (!lines.length) return []
  const delim = ['\t', ';', ','].find((d) => lines.slice(0, 5).every((l) => l.includes(d)))
  if (delim && lines.length > 1) {
    const rows = lines.map((l) => l.split(delim).map((c) => c.trim().replace(/^"|"$/g, '')))
    const header = rows[0].some((c) => c && !NUM.test(c.replace(/,/g, '')))
    const body = header ? rows.slice(1) : rows
    const ncol = Math.max(...rows.map((r) => r.length))
    if (ncol > 1) {
      const out: Series[] = []
      for (let j = 0; j < ncol; j++) {
        const vals: number[] = []
        let skipped = 0
        for (const r of body) {
          const c = (r[j] ?? '').replace(/\s/g, '')
          if (c === '') continue
          if (NUM.test(c)) vals.push(Number(c))
          else skipped++
        }
        if (vals.length && vals.length >= skipped) out.push({ name: header ? rows[0][j] || `Column ${j + 1}` : `Column ${j + 1}`, values: vals, skipped })
      }
      if (out.length) return out
    }
  }
  const tokens = text.split(/[\s,;]+/).filter(Boolean)
  const values = tokens.filter((t) => NUM.test(t)).map(Number)
  return values.length ? [{ name: 'Data', values, skipped: tokens.length - values.length }] : []
}

export type QMethod = 'r7' | 'r6' | 'tukey' | 'nearest'
export const QMETHODS: [QMethod, string][] = [['r7', 'Linear (Excel QUARTILE.INC, R type 7)'], ['r6', 'Excel QUARTILE.EXC / Minitab (type 6)'], ['tukey', 'Tukey hinges'], ['nearest', 'Nearest rank']]

/** Quantile of sorted data. */
export function quantile(sorted: number[], p: number, m: QMethod = 'r7'): number {
  const n = sorted.length
  if (!n) return NaN
  if (m === 'nearest') return sorted[Math.min(n - 1, Math.max(0, Math.ceil(p * n) - 1))]
  if (m === 'tukey' && (p === 0.25 || p === 0.75)) {
    const half = Math.ceil(n / 2) // halves include the median when n is odd
    const part = p === 0.25 ? sorted.slice(0, half) : sorted.slice(n - half)
    return quantile(part, 0.5, 'r7')
  }
  const h = m === 'r6' ? (n + 1) * p - 1 : (n - 1) * p
  const lo = Math.floor(h)
  if (lo < 0) return sorted[0]
  if (lo >= n - 1) return sorted[n - 1]
  return sorted[lo] + (h - lo) * (sorted[lo + 1] - sorted[lo])
}

// ---- special functions ----
export function lgamma(x: number): number {
  const c = [76.18009172947146, -86.50532032941678, 24.01409824083091, -1.231739572450155, 0.001208650973866179, -0.000005395239384953]
  let y = x
  const tmp = x + 5.5 - (x + 0.5) * Math.log(x + 5.5)
  let ser = 1.00000000019
  for (const v of c) ser += v / ++y
  return -tmp + Math.log((2.506628274631 * ser) / x)
}
function betacf(a: number, b: number, x: number): number {
  let c = 1, d = 1 - ((a + b) * x) / (a + 1)
  d = 1 / (Math.abs(d) < 1e-300 ? 1e-300 : d)
  let h = d
  for (let m = 1; m <= 300; m++) {
    const m2 = 2 * m
    let aa = (m * (b - m) * x) / ((a - 1 + m2) * (a + m2))
    d = 1 + aa * d; d = 1 / (Math.abs(d) < 1e-300 ? 1e-300 : d)
    c = 1 + aa / c; if (Math.abs(c) < 1e-300) c = 1e-300
    h *= d * c
    aa = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + 1 + m2))
    d = 1 + aa * d; d = 1 / (Math.abs(d) < 1e-300 ? 1e-300 : d)
    c = 1 + aa / c; if (Math.abs(c) < 1e-300) c = 1e-300
    const del = d * c
    h *= del
    if (Math.abs(del - 1) < 1e-12) break
  }
  return h
}
/** Regularised incomplete beta I_x(a, b). */
export function ibeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0
  if (x >= 1) return 1
  const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x))
  return x < (a + 1) / (a + b + 2) ? (bt * betacf(a, b, x)) / a : 1 - (bt * betacf(b, a, 1 - x)) / b
}
/** Student t CDF. */
export const tCdf = (t: number, df: number) => {
  const p = 0.5 * ibeta(df / (df + t * t), df / 2, 0.5)
  return t >= 0 ? 1 - p : p
}
/** Student t quantile by bisection. */
export function tInv(p: number, df: number): number {
  let lo = -1e3, hi = 1e3
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2
    if (tCdf(mid, df) < p) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

export interface Stats {
  n: number; sum: number; mean: number; median: number; modes: number[]; min: number; max: number; range: number
  varS: number; varP: number; sdS: number; sdP: number; se: number; cv: number
  q1: number; q3: number; iqr: number; mad: number; skew: number; kurt: number; gmean: number; hmean: number; trim10: number
  ci: [number, number]; jb: number; jbP: number; fences: [number, number]; outliers: number[]; sorted: number[]
}

export function describe(values: number[], qm: QMethod = 'r7', conf = 0.95): Stats {
  const v = values.filter(Number.isFinite)
  const n = v.length
  const s = [...v].sort((a, b) => a - b)
  const sum = v.reduce((a, b) => a + b, 0)
  const mean = sum / n
  let m2 = 0, m3 = 0, m4 = 0
  for (const x of v) { const d = x - mean; m2 += d * d; m3 += d ** 3; m4 += d ** 4 }
  const varP = m2 / n, varS = n > 1 ? m2 / (n - 1) : NaN
  const sdS = Math.sqrt(varS), sdP = Math.sqrt(varP)
  // adjusted Fisher–Pearson skewness G1 and excess kurtosis G2 (Excel SKEW / KURT)
  const g1 = (m3 / n) / varP ** 1.5, g2 = (m4 / n) / varP ** 2 - 3
  const skew = n > 2 ? (Math.sqrt(n * (n - 1)) / (n - 2)) * g1 : NaN
  const kurt = n > 3 ? ((n - 1) / ((n - 2) * (n - 3))) * ((n + 1) * g2 + 6) : NaN
  const counts = new Map<number, number>()
  for (const x of v) counts.set(x, (counts.get(x) ?? 0) + 1)
  const top = Math.max(...counts.values())
  const modes = top > 1 ? [...counts].filter(([, c]) => c === top).map(([x]) => x).sort((a, b) => a - b) : []
  const median = quantile(s, 0.5, 'r7')
  const q1 = quantile(s, 0.25, qm), q3 = quantile(s, 0.75, qm), iqr = q3 - q1
  const absDev = v.map((x) => Math.abs(x - median)).sort((a, b) => a - b)
  const k = Math.floor(n * 0.1)
  const trimmed = s.slice(k, n - k)
  const se = sdS / Math.sqrt(n)
  const t = n > 1 ? tInv(1 - (1 - conf) / 2, n - 1) : NaN
  const jb = (n / 6) * (g1 * g1 + (g2 * g2) / 4)
  const fences: [number, number] = [q1 - 1.5 * iqr, q3 + 1.5 * iqr]
  return {
    n, sum, mean, median, modes, min: s[0], max: s[n - 1], range: s[n - 1] - s[0], varS, varP, sdS, sdP, se, cv: sdS / mean,
    q1, q3, iqr, mad: quantile(absDev, 0.5), skew, kurt,
    gmean: s[0] > 0 ? Math.exp(v.reduce((a, x) => a + Math.log(x), 0) / n) : NaN,
    hmean: s[0] > 0 ? n / v.reduce((a, x) => a + 1 / x, 0) : NaN,
    trim10: trimmed.reduce((a, b) => a + b, 0) / trimmed.length,
    ci: [mean - t * se, mean + t * se], jb, jbP: Math.exp(-jb / 2), fences, outliers: s.filter((x) => x < fences[0] || x > fences[1]), sorted: s,
  }
}

export type BinRule = 'sturges' | 'fd' | 'scott' | 'sqrt'

export function binCount(st: Stats, rule: BinRule): number {
  const { n, iqr, sdS, range } = st
  if (n < 2 || range === 0) return 1
  const byWidth = (w: number) => (w > 0 ? Math.ceil(range / w) : Math.ceil(Math.log2(n) + 1))
  const k = rule === 'sturges' ? Math.ceil(Math.log2(n) + 1) : rule === 'sqrt' ? Math.ceil(Math.sqrt(n)) : rule === 'fd' ? byWidth((2 * iqr) / Math.cbrt(n)) : byWidth((3.49 * sdS) / Math.cbrt(n))
  return Math.max(1, Math.min(100, k))
}

export function histogram(sorted: number[], k: number): { x0: number; x1: number; n: number }[] {
  const lo = sorted[0], hi = sorted[sorted.length - 1]
  const w = (hi - lo) / k || 1
  const bins = Array.from({ length: k }, (_, i) => ({ x0: lo + i * w, x1: lo + (i + 1) * w, n: 0 }))
  for (const x of sorted) bins[Math.min(k - 1, Math.floor((x - lo) / w))].n++
  return bins
}

export const SAMPLE = `Group A,Group B,Group C
12.1,14.8,9.6
13.4,15.2,10.1
11.8,16.9,11.4
14.2,15.5,10.8
12.9,17.3,9.9
13.7,14.1,12.6
12.4,16.2,10.4
15.1,15.9,11.1
13.0,18.4,10.7
12.6,15.0,24.5
14.8,16.6,11.9
13.3,17.1,10.2
11.9,15.7,9.8
13.8,16.0,11.6
12.2,14.6,10.9`
