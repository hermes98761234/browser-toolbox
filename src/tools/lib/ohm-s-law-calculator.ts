// Ohm's law / power solver with SI-prefix parsing ("4k7", "220 mA", "1.5MΩ").

export type Q = 'V' | 'I' | 'R' | 'P'
export const UNITS: Record<Q, string> = { V: 'V', I: 'A', R: 'Ω', P: 'W' }

const PREFIX: Record<string, number> = { p: 1e-12, n: 1e-9, u: 1e-6, µ: 1e-6, μ: 1e-6, m: 1e-3, '': 1, k: 1e3, K: 1e3, M: 1e6, G: 1e9 }

/** Parses a number with optional SI prefix and unit; supports RKM code like 4k7 or 2R2. */
export function parseSI(input: string): number | null {
  let s = input.trim().replace(/\s+/g, '').replace(/,/g, '.')
  if (!s) return null
  s = s.replace(/(ohms?|Ω|Ω|V|volts?|A|amps?|W|watts?)$/i, '')
  const rkm = /^(\d+)([pnuµμmkKMGR])(\d+)$/.exec(s)
  if (rkm) {
    const mul = rkm[2] === 'R' ? 1 : PREFIX[rkm[2]]
    return Number(`${rkm[1]}.${rkm[3]}`) * mul
  }
  const m = /^([-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)([pnuµμmkKMG]?)$/i.exec(s)
  if (!m) return null
  const p = m[2] === 'K' ? 'k' : m[2]
  if (!(p in PREFIX)) return null
  const v = Number(m[1]) * PREFIX[p]
  return Number.isFinite(v) ? v : null
}

const SI: [number, string][] = [[1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p']]

export function formatSI(x: number, unit = '', digits = 4): string {
  if (!Number.isFinite(x)) return '—'
  if (x === 0) return `0 ${unit}`
  const a = Math.abs(x)
  const [mul, p] = SI.find(([m]) => a >= m * 0.9995) ?? SI[SI.length - 1]
  return `${Number((x / mul).toPrecision(digits))} ${p}${unit}`
}

export type Vals = Record<Q, number>

/** Given exactly two known quantities, returns all four plus the formulas used for the unknowns. */
export function solve(known: Partial<Vals>): { vals: Vals; used: string[] } | string {
  const k = (Object.keys(known) as Q[]).filter((q) => Number.isFinite(known[q]))
  if (k.length !== 2) return 'Enter exactly two values'
  for (const q of k) if (q !== 'V' && q !== 'I' && known[q]! <= 0) return `${q} must be greater than zero`
  const { V, I, R, P } = known as Vals
  const has = (a: Q, b: Q) => k.includes(a) && k.includes(b)
  if (has('V', 'I')) return { vals: { V, I, R: V / I, P: V * I }, used: ['R = V / I', 'P = V × I'] }
  if (has('V', 'R')) return { vals: { V, R, I: V / R, P: (V * V) / R }, used: ['I = V / R', 'P = V² / R'] }
  if (has('V', 'P')) return { vals: { V, P, I: P / V, R: (V * V) / P }, used: ['I = P / V', 'R = V² / P'] }
  if (has('I', 'R')) return { vals: { I, R, V: I * R, P: I * I * R }, used: ['V = I × R', 'P = I² × R'] }
  if (has('I', 'P')) return { vals: { I, P, V: P / I, R: P / (I * I) }, used: ['V = P / I', 'R = P / I²'] }
  return { vals: { R, P, V: Math.sqrt(P * R), I: Math.sqrt(P / R) }, used: ['V = √(P × R)', 'I = √(P / R)'] }
}

/** The 12 formulas of the power wheel, grouped by the quantity they produce. */
export const WHEEL: [Q, string, [Q, Q]][] = [
  ['V', 'I × R', ['I', 'R']], ['V', 'P / I', ['P', 'I']], ['V', '√(P × R)', ['P', 'R']],
  ['I', 'V / R', ['V', 'R']], ['I', 'P / V', ['P', 'V']], ['I', '√(P / R)', ['P', 'R']],
  ['R', 'V / I', ['V', 'I']], ['R', 'V² / P', ['V', 'P']], ['R', 'P / I²', ['P', 'I']],
  ['P', 'V × I', ['V', 'I']], ['P', 'V² / R', ['V', 'R']], ['P', 'I² × R', ['I', 'R']],
]

const E24 = [1.0, 1.1, 1.2, 1.3, 1.5, 1.6, 1.8, 2.0, 2.2, 2.4, 2.7, 3.0, 3.3, 3.6, 3.9, 4.3, 4.7, 5.1, 5.6, 6.2, 6.8, 7.5, 8.2, 9.1]
const E12 = [1.0, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2]

/** Nearest standard resistor value in a series (E12 or E24). */
export function nearestE(r: number, series: 12 | 24 = 24): number {
  if (!(r > 0)) return NaN
  const list = series === 12 ? E12 : E24
  const dec = Math.floor(Math.log10(r))
  let best = NaN
  for (const d of [dec - 1, dec, dec + 1])
    for (const m of list) {
      const v = Number((m * 10 ** d).toPrecision(3))
      if (!Number.isFinite(best) || Math.abs(Math.log(v / r)) < Math.abs(Math.log(best / r))) best = v
    }
  return best
}

export const RATINGS = [0.125, 0.25, 0.5, 1, 2, 3, 5, 10, 25, 50, 100]

/** Smallest standard resistor power rating with the given safety factor (default 2×). */
export function powerRating(p: number, factor = 2): number | null {
  return RATINGS.find((r) => r >= p * factor) ?? null
}
