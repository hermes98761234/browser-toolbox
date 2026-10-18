// Hypothesis tests and probability distributions, written from the textbook definitions
// (Lanczos log-gamma, continued fractions for the incomplete beta/gamma functions,
// rank-based nonparametric tests). No external libraries.

// ---------- special functions ----------
const LANCZOS = [
  676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
  12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
]

export function lnGamma(x: number): number {
  if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lnGamma(1 - x)
  const z = x - 1
  let a = 0.99999999999980993
  const t = z + 7.5
  for (let i = 0; i < LANCZOS.length; i++) a += LANCZOS[i] / (z + i + 1)
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a)
}

/** Regularized lower incomplete gamma P(s, x). */
export function gammaP(s: number, x: number): number {
  if (x <= 0) return 0
  if (!Number.isFinite(x)) return 1
  const lnPre = s * Math.log(x) - x - lnGamma(s)
  if (x < s + 1) {
    // power series
    let term = 1 / s
    let sum = term
    for (let k = 1; k < 1000; k++) {
      term *= x / (s + k)
      sum += term
      if (Math.abs(term) < Math.abs(sum) * 1e-16) break
    }
    return Math.min(1, sum * Math.exp(lnPre))
  }
  // continued fraction for Q, evaluated with the modified Lentz method
  const tiny = 1e-300
  let b = x + 1 - s
  let c = 1 / tiny
  let d = 1 / b
  let f = d
  for (let i = 1; i < 1000; i++) {
    const an = -i * (i - s)
    b += 2
    d = an * d + b
    if (Math.abs(d) < tiny) d = tiny
    c = b + an / c
    if (Math.abs(c) < tiny) c = tiny
    d = 1 / d
    const delta = d * c
    f *= delta
    if (Math.abs(delta - 1) < 1e-16) break
  }
  return Math.max(0, 1 - Math.exp(lnPre) * f)
}

function betaCF(a: number, b: number, x: number): number {
  const tiny = 1e-300
  let c = 1
  let d = 1 - ((a + b) * x) / (a + 1)
  if (Math.abs(d) < tiny) d = tiny
  d = 1 / d
  let h = d
  for (let m = 1; m <= 1000; m++) {
    const m2 = 2 * m
    // even step
    let num = (m * (b - m) * x) / ((a + m2 - 1) * (a + m2))
    d = 1 + num * d
    if (Math.abs(d) < tiny) d = tiny
    c = 1 + num / c
    if (Math.abs(c) < tiny) c = tiny
    d = 1 / d
    h *= d * c
    // odd step
    num = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1))
    d = 1 + num * d
    if (Math.abs(d) < tiny) d = tiny
    c = 1 + num / c
    if (Math.abs(c) < tiny) c = tiny
    d = 1 / d
    const delta = d * c
    h *= delta
    if (Math.abs(delta - 1) < 1e-15) break
  }
  return h
}

/** Regularized incomplete beta I_x(a, b). */
export function betaI(x: number, a: number, b: number): number {
  if (x <= 0) return 0
  if (x >= 1) return 1
  const lnFront = lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x)
  if (x < (a + 1) / (a + b + 2)) return (Math.exp(lnFront) * betaCF(a, b, x)) / a
  return 1 - (Math.exp(lnFront) * betaCF(b, a, 1 - x)) / b
}

// ---------- distributions ----------
export function normCdf(z: number): number {
  if (!Number.isFinite(z)) return z > 0 ? 1 : 0
  const p = gammaP(0.5, (z * z) / 2) / 2
  return z >= 0 ? 0.5 + p : 0.5 - p
}

/** Inverse standard normal CDF: rational starting guess (Acklam-style coefficients) + Newton polish. */
export function normInv(p: number): number {
  if (p <= 0) return -Infinity
  if (p >= 1) return Infinity
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239]
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572]
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783]
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416]
  const pl = 0.02425
  let x: number
  if (p < pl) {
    const q = Math.sqrt(-2 * Math.log(p))
    x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  } else if (p <= 1 - pl) {
    const q = p - 0.5
    const r = q * q
    x = ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - p))
    x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  }
  for (let i = 0; i < 2; i++) {
    const e = normCdf(x) - p
    const u = e * Math.sqrt(2 * Math.PI) * Math.exp((x * x) / 2)
    x = x - u / (1 + (x * u) / 2)
  }
  return x
}

export function tCdf(t: number, df: number): number {
  if (!Number.isFinite(t)) return t > 0 ? 1 : 0
  const x = df / (df + t * t)
  const tail = 0.5 * betaI(x, df / 2, 0.5)
  return t >= 0 ? 1 - tail : tail
}
export const chi2Cdf = (x: number, df: number) => (x <= 0 ? 0 : gammaP(df / 2, x / 2))
export const fCdf = (f: number, d1: number, d2: number) => (f <= 0 ? 0 : betaI((d1 * f) / (d1 * f + d2), d1 / 2, d2 / 2))

/** Generic monotone inverse by bracketing + bisection (robust for all our CDFs). */
function invert(cdf: (x: number) => number, p: number, lo: number, hi: number): number {
  while (cdf(hi) < p) hi *= 2
  while (cdf(lo) > p) lo = lo < 0 ? lo * 2 : lo - 1
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2
    if (cdf(mid) < p) lo = mid
    else hi = mid
    if (hi - lo < 1e-12 * Math.max(1, Math.abs(mid))) break
  }
  return (lo + hi) / 2
}
export const tInv = (p: number, df: number) => invert((x) => tCdf(x, df), p, -10, 10)
export const chi2Inv = (p: number, df: number) => invert((x) => chi2Cdf(x, df), p, 0, Math.max(10, df * 3))
export const fInv = (p: number, d1: number, d2: number) => invert((x) => fCdf(x, d1, d2), p, 0, 10)

// ---------- helpers ----------
export type Tail = 'two' | 'less' | 'greater'
export const sum = (a: number[]) => a.reduce((s, v) => s + v, 0)
export const mean = (a: number[]) => sum(a) / a.length
export function variance(a: number[]): number {
  const m = mean(a)
  return sum(a.map((v) => (v - m) ** 2)) / (a.length - 1)
}
export const sd = (a: number[]) => Math.sqrt(variance(a))

/** p-value for a statistic whose null CDF is `cdf`, symmetric about 0 for two-tailed use. */
function pFromSym(stat: number, cdf: (x: number) => number, tail: Tail): number {
  if (tail === 'less') return cdf(stat)
  if (tail === 'greater') return 1 - cdf(stat)
  return Math.min(1, 2 * Math.min(cdf(stat), 1 - cdf(stat)))
}

/** Average ranks (1-based), ties share the mean rank. Returns ranks and tie-group sizes. */
export function rank(values: number[]): { ranks: number[]; ties: number[] } {
  const idx = values.map((v, i) => [v, i] as const).sort((x, y) => x[0] - y[0])
  const ranks = new Array<number>(values.length)
  const ties: number[] = []
  for (let i = 0; i < idx.length; ) {
    let j = i
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++
    const r = (i + j + 2) / 2
    for (let k = i; k <= j; k++) ranks[idx[k][1]] = r
    if (j > i) ties.push(j - i + 1)
    i = j + 1
  }
  return { ranks, ties }
}

export interface TestResult {
  name: string
  statLabel: string
  stat: number
  df?: number | [number, number]
  p: number
  ci?: [number, number]
  ciLabel?: string
  effect?: { label: string; value: number; size: string }
  extra?: [string, string][]
  notes?: string[]
}

export function cohenLabel(d: number): string {
  const a = Math.abs(d)
  return a < 0.2 ? 'negligible' : a < 0.5 ? 'small' : a < 0.8 ? 'medium' : 'large'
}
export function rLabel(r: number): string {
  const a = Math.abs(r)
  return a < 0.1 ? 'negligible' : a < 0.3 ? 'small' : a < 0.5 ? 'medium' : 'large'
}
const fmt = (v: number, d = 3) => (Number.isFinite(v) ? v.toFixed(d) : '—')

function ciT(m: number, se: number, df: number, conf: number, tail: Tail): [number, number] {
  const a = 1 - conf
  if (tail === 'two') {
    const q = tInv(1 - a / 2, df)
    return [m - q * se, m + q * se]
  }
  const q = tInv(1 - a, df)
  return tail === 'less' ? [-Infinity, m + q * se] : [m - q * se, Infinity]
}

// ---------- tests ----------
export function oneSampleT(x: number[], mu0: number, tail: Tail = 'two', conf = 0.95): TestResult {
  const n = x.length
  const m = mean(x)
  const s = sd(x)
  const se = s / Math.sqrt(n)
  const t = (m - mu0) / se
  const df = n - 1
  const d = (m - mu0) / s
  return {
    name: 'One-sample t-test', statLabel: 't', stat: t, df, p: pFromSym(t, (v) => tCdf(v, df), tail),
    ci: ciT(m, se, df, conf, tail), ciLabel: 'mean',
    effect: { label: "Cohen's d", value: d, size: cohenLabel(d) },
    extra: [['n', String(n)], ['mean', fmt(m, 4)], ['SD', fmt(s, 4)], ['SE', fmt(se, 4)]],
  }
}

export function pairedT(x: number[], y: number[], tail: Tail = 'two', conf = 0.95): TestResult {
  const diffs = x.map((v, i) => v - y[i])
  const r = oneSampleT(diffs, 0, tail, conf)
  return { ...r, name: 'Paired t-test', ciLabel: 'mean difference (A − B)', effect: r.effect && { ...r.effect, label: "Cohen's d_z" } }
}

export function twoSampleT(x: number[], y: number[], welch: boolean, tail: Tail = 'two', conf = 0.95): TestResult {
  const n1 = x.length, n2 = y.length
  const m1 = mean(x), m2 = mean(y)
  const v1 = variance(x), v2 = variance(y)
  let se: number, df: number
  const sp = Math.sqrt(((n1 - 1) * v1 + (n2 - 1) * v2) / (n1 + n2 - 2))
  if (welch) {
    se = Math.sqrt(v1 / n1 + v2 / n2)
    df = (v1 / n1 + v2 / n2) ** 2 / ((v1 / n1) ** 2 / (n1 - 1) + (v2 / n2) ** 2 / (n2 - 1))
  } else {
    se = sp * Math.sqrt(1 / n1 + 1 / n2)
    df = n1 + n2 - 2
  }
  const diff = m1 - m2
  const t = diff / se
  const d = diff / sp
  const g = d * (1 - 3 / (4 * (n1 + n2) - 9))
  return {
    name: welch ? "Welch's t-test (unequal variances)" : "Student's t-test (pooled variance)",
    statLabel: 't', stat: t, df, p: pFromSym(t, (v) => tCdf(v, df), tail),
    ci: ciT(diff, se, df, conf, tail), ciLabel: 'difference in means (A − B)',
    effect: { label: "Hedges' g", value: g, size: cohenLabel(g) },
    extra: [['mean A', fmt(m1, 4)], ['mean B', fmt(m2, 4)], ['SD A', fmt(Math.sqrt(v1), 4)], ['SD B', fmt(Math.sqrt(v2), 4)], ["Cohen's d", fmt(d)]],
  }
}

export function zTest(x: number[], mu0: number, sigma: number, tail: Tail = 'two', conf = 0.95): TestResult {
  const n = x.length
  const m = mean(x)
  const se = sigma / Math.sqrt(n)
  const z = (m - mu0) / se
  const a = 1 - conf
  const q = normInv(tail === 'two' ? 1 - a / 2 : 1 - a)
  const ci: [number, number] = tail === 'two' ? [m - q * se, m + q * se] : tail === 'less' ? [-Infinity, m + q * se] : [m - q * se, Infinity]
  const d = (m - mu0) / sigma
  return {
    name: 'One-sample z-test (known σ)', statLabel: 'z', stat: z, p: pFromSym(z, normCdf, tail), ci, ciLabel: 'mean',
    effect: { label: "Cohen's d", value: d, size: cohenLabel(d) },
    extra: [['n', String(n)], ['mean', fmt(m, 4)], ['σ (given)', String(sigma)], ['SE', fmt(se, 4)]],
  }
}

export function anovaOneWay(groups: number[][]): TestResult {
  const all = groups.flat()
  const N = all.length, k = groups.length
  const gm = mean(all)
  const ssb = sum(groups.map((g) => g.length * (mean(g) - gm) ** 2))
  const ssw = sum(groups.map((g) => { const m = mean(g); return sum(g.map((v) => (v - m) ** 2)) }))
  const df1 = k - 1, df2 = N - k
  const F = ssb / df1 / (ssw / df2)
  const eta2 = ssb / (ssb + ssw)
  const omega2 = (ssb - df1 * (ssw / df2)) / (ssb + ssw + ssw / df2)
  return {
    name: 'One-way ANOVA', statLabel: 'F', stat: F, df: [df1, df2], p: 1 - fCdf(F, df1, df2),
    effect: { label: 'η²', value: eta2, size: eta2 < 0.01 ? 'negligible' : eta2 < 0.06 ? 'small' : eta2 < 0.14 ? 'medium' : 'large' },
    extra: [['SS between', fmt(ssb, 4)], ['SS within', fmt(ssw, 4)], ['MS between', fmt(ssb / df1, 4)], ['MS within', fmt(ssw / df2, 4)], ['ω²', fmt(omega2)]],
  }
}

export function chiSquareGOF(observed: number[], expectedProps?: number[]): TestResult {
  const n = sum(observed)
  const props = expectedProps && expectedProps.length === observed.length ? expectedProps : observed.map(() => 1)
  const ps = sum(props)
  const exp = props.map((p) => (n * p) / ps)
  const chi = sum(observed.map((o, i) => (o - exp[i]) ** 2 / exp[i]))
  const df = observed.length - 1
  const w = Math.sqrt(chi / n)
  const notes = exp.some((e) => e < 5) ? ['Some expected counts are below 5 — the χ² approximation may be unreliable.'] : []
  return {
    name: 'χ² goodness-of-fit', statLabel: 'χ²', stat: chi, df, p: 1 - chi2Cdf(chi, df),
    effect: { label: "Cohen's w", value: w, size: w < 0.1 ? 'negligible' : w < 0.3 ? 'small' : w < 0.5 ? 'medium' : 'large' },
    extra: [['N', String(n)], ['expected', exp.map((e) => e.toFixed(2)).join(', ')]], notes,
  }
}

export function chiSquareIndependence(table: number[][], yates = false): TestResult {
  const R = table.length, C = table[0].length
  const rows = table.map(sum)
  const cols = table[0].map((_, j) => sum(table.map((r) => r[j])))
  const n = sum(rows)
  let chi = 0
  let low = 0
  const useYates = yates && R === 2 && C === 2
  for (let i = 0; i < R; i++) for (let j = 0; j < C; j++) {
    const e = (rows[i] * cols[j]) / n
    if (e < 5) low++
    const dev = useYates ? Math.max(0, Math.abs(table[i][j] - e) - 0.5) : table[i][j] - e
    chi += (dev * dev) / e
  }
  const df = (R - 1) * (C - 1)
  const v = Math.sqrt(chi / (n * Math.min(R - 1, C - 1)))
  return {
    name: 'χ² test of independence' + (useYates ? ' (Yates continuity correction)' : ''), statLabel: 'χ²', stat: chi, df, p: 1 - chi2Cdf(chi, df),
    effect: { label: "Cramér's V", value: v, size: rLabel(v) },
    extra: [['N', String(n)], ['cells with E < 5', `${low} of ${R * C}`]],
    notes: low / (R * C) > 0.2 ? ['More than 20% of expected counts are below 5 — consider Fisher\'s exact test or merging categories.'] : [],
  }
}

export function oneProportionZ(x: number, n: number, p0: number, tail: Tail = 'two', conf = 0.95): TestResult {
  const ph = x / n
  const z = (ph - p0) / Math.sqrt((p0 * (1 - p0)) / n)
  // Wilson score interval
  const q = normInv(1 - (1 - conf) / 2)
  const den = 1 + (q * q) / n
  const centre = (ph + (q * q) / (2 * n)) / den
  const half = (q * Math.sqrt((ph * (1 - ph)) / n + (q * q) / (4 * n * n))) / den
  const h = 2 * Math.asin(Math.sqrt(ph)) - 2 * Math.asin(Math.sqrt(p0))
  return {
    name: 'One-proportion z-test', statLabel: 'z', stat: z, p: pFromSym(z, normCdf, tail),
    ci: [centre - half, centre + half], ciLabel: 'proportion (Wilson, two-sided)',
    effect: { label: "Cohen's h", value: h, size: cohenLabel(h) },
    extra: [['p̂', fmt(ph, 4)], ['p₀', String(p0)], ['n', String(n)]],
    notes: n * p0 < 10 || n * (1 - p0) < 10 ? ['n·p₀ or n·(1−p₀) is below 10 — the normal approximation is rough.'] : [],
  }
}

export function twoProportionZ(x1: number, n1: number, x2: number, n2: number, tail: Tail = 'two', conf = 0.95): TestResult {
  const p1 = x1 / n1, p2 = x2 / n2
  const pp = (x1 + x2) / (n1 + n2)
  const z = (p1 - p2) / Math.sqrt(pp * (1 - pp) * (1 / n1 + 1 / n2))
  const se = Math.sqrt((p1 * (1 - p1)) / n1 + (p2 * (1 - p2)) / n2)
  const q = normInv(1 - (1 - conf) / 2)
  const h = 2 * Math.asin(Math.sqrt(p1)) - 2 * Math.asin(Math.sqrt(p2))
  return {
    name: 'Two-proportion z-test', statLabel: 'z', stat: z, p: pFromSym(z, normCdf, tail),
    ci: [p1 - p2 - q * se, p1 - p2 + q * se], ciLabel: 'p₁ − p₂ (Wald, two-sided)',
    effect: { label: "Cohen's h", value: h, size: cohenLabel(h) },
    extra: [['p̂₁', fmt(p1, 4)], ['p̂₂', fmt(p2, 4)], ['pooled p̂', fmt(pp, 4)]],
  }
}

/** Mann–Whitney U (Wilcoxon rank-sum), normal approximation with tie and continuity correction. */
export function mannWhitney(x: number[], y: number[], tail: Tail = 'two'): TestResult {
  const n1 = x.length, n2 = y.length, N = n1 + n2
  const { ranks, ties } = rank([...x, ...y])
  const r1 = sum(ranks.slice(0, n1))
  const U = r1 - (n1 * (n1 + 1)) / 2
  const mu = (n1 * n2) / 2
  const tieTerm = sum(ties.map((t) => t ** 3 - t))
  const sigma = Math.sqrt(((n1 * n2) / 12) * (N + 1 - tieTerm / (N * (N - 1))))
  const cc = tail === 'two' ? Math.sign(U - mu) * 0.5 : tail === 'greater' ? 0.5 : -0.5
  const z = (U - mu - cc) / sigma
  const p = pFromSym(z, normCdf, tail)
  const r = (U - mu) / sigma / Math.sqrt(N)
  return {
    name: 'Mann–Whitney U test', statLabel: 'W (= U for A)', stat: U, p,
    effect: { label: 'r = Z/√N', value: r, size: rLabel(r) },
    extra: [['z', fmt(z)], ['rank sum A', fmt(r1, 1)], ['median A', fmt(median(x))], ['median B', fmt(median(y))], ['common-language effect', fmt(U / (n1 * n2))]],
    notes: ['p-value uses the normal approximation with tie and continuity corrections (as R does when ties are present).'],
  }
}

/** Wilcoxon signed-rank test on paired differences (zeros dropped), normal approximation. */
export function wilcoxonSignedRank(x: number[], y: number[] | null, mu0 = 0, tail: Tail = 'two'): TestResult {
  const d = (y ? x.map((v, i) => v - y[i]) : x.map((v) => v - mu0)).filter((v) => v !== 0)
  const n = d.length
  const { ranks, ties } = rank(d.map(Math.abs))
  const V = sum(ranks.filter((_, i) => d[i] > 0))
  const mu = (n * (n + 1)) / 4
  const sigma = Math.sqrt((n * (n + 1) * (2 * n + 1)) / 24 - sum(ties.map((t) => t ** 3 - t)) / 48)
  let p: number
  let method: string
  if (n <= 30 && ties.length === 0) {
    // exact null distribution of V by dynamic programming over ranks 1..n
    const max = (n * (n + 1)) / 2
    let dist = new Array<number>(max + 1).fill(0)
    dist[0] = 1
    for (let k = 1; k <= n; k++) {
      const next = dist.slice()
      for (let s = k; s <= max; s++) next[s] += dist[s - k]
      dist = next
    }
    const total = 2 ** n
    const cdf = (v: number) => sum(dist.slice(0, Math.floor(v) + 1)) / total
    const sf = (v: number) => sum(dist.slice(Math.ceil(v))) / total
    p = tail === 'less' ? cdf(V) : tail === 'greater' ? sf(V) : Math.min(1, 2 * Math.min(cdf(V), sf(V)))
    method = 'exact'
  } else {
    const cc = tail === 'two' ? Math.sign(V - mu) * 0.5 : tail === 'greater' ? 0.5 : -0.5
    const z = (V - mu - cc) / sigma
    p = pFromSym(z, normCdf, tail)
    method = 'normal approximation with continuity correction'
  }
  const r = (V - mu) / sigma / Math.sqrt(n)
  return {
    name: 'Wilcoxon signed-rank test', statLabel: 'V', stat: V, p,
    effect: { label: 'r = Z/√n', value: r, size: rLabel(r) },
    extra: [['non-zero differences', String(n)], ['median difference', fmt(median(d))], ['method', method]],
  }
}

export function median(a: number[]): number {
  if (!a.length) return NaN
  const s = [...a].sort((p, q) => p - q)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

function pearsonR(x: number[], y: number[]): number {
  const mx = mean(x), my = mean(y)
  let sxy = 0, sxx = 0, syy = 0
  for (let i = 0; i < x.length; i++) {
    sxy += (x[i] - mx) * (y[i] - my)
    sxx += (x[i] - mx) ** 2
    syy += (y[i] - my) ** 2
  }
  return sxy / Math.sqrt(sxx * syy)
}

export function correlation(x: number[], y: number[], method: 'pearson' | 'spearman', tail: Tail = 'two', conf = 0.95): TestResult {
  const n = x.length
  const r = method === 'pearson' ? pearsonR(x, y) : pearsonR(rank(x).ranks, rank(y).ranks)
  const df = n - 2
  const t = (r * Math.sqrt(df)) / Math.sqrt(Math.max(1e-300, 1 - r * r))
  const res: TestResult = {
    name: method === 'pearson' ? 'Pearson correlation' : 'Spearman rank correlation',
    statLabel: 't', stat: t, df, p: pFromSym(t, (v) => tCdf(v, df), tail),
    effect: { label: method === 'pearson' ? 'r' : 'ρ', value: r, size: rLabel(r) },
    extra: [[method === 'pearson' ? 'r' : 'ρ', fmt(r, 4)], ['r²', fmt(r * r, 4)], ['n', String(n)]],
  }
  if (method === 'pearson' && n > 3) {
    const zr = Math.atanh(r)
    const q = normInv(1 - (1 - conf) / 2) / Math.sqrt(n - 3)
    res.ci = [Math.tanh(zr - q), Math.tanh(zr + q)]
    res.ciLabel = 'r (Fisher z, two-sided)'
  }
  if (method === 'spearman') res.notes = ['p-value uses the t approximation to ρ (accurate for n ≥ 10).']
  return res
}

/** Parse numbers from free text: commas, spaces, tabs, newlines, semicolons. */
export function parseNumbers(s: string): number[] {
  return s.split(/[\s,;]+/).filter(Boolean).map(Number).filter((v) => Number.isFinite(v))
}

/** Plain-language interpretation of a p-value against alpha. */
export function interpret(p: number, alpha: number): string {
  if (p < alpha) return `p = ${formatP(p)} < α = ${alpha}: the data provide evidence against the null hypothesis (statistically significant).`
  return `p = ${formatP(p)} ≥ α = ${alpha}: not enough evidence to reject the null hypothesis. This does not prove the null is true.`
}
export function formatP(p: number): string {
  if (!Number.isFinite(p)) return '—'
  return p < 0.0001 ? p.toExponential(2) : p.toFixed(4)
}
