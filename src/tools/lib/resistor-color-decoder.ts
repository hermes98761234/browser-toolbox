// Resistor colour code (IEC 60062): decode/encode 3–6 band resistors and snap to E-series values.

export type ColorName = 'black' | 'brown' | 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'violet' | 'grey' | 'white' | 'gold' | 'silver' | 'pink' | 'none'

export interface BandColor {
  name: ColorName
  hex: string
  digit?: number
  mult?: number
  tol?: number
  tempco?: number
}

export const COLORS: BandColor[] = [
  { name: 'black', hex: '#1c1c1c', digit: 0, mult: 1, tempco: 250 },
  { name: 'brown', hex: '#7b4a26', digit: 1, mult: 10, tol: 1, tempco: 100 },
  { name: 'red', hex: '#d32f2f', digit: 2, mult: 100, tol: 2, tempco: 50 },
  { name: 'orange', hex: '#f57c00', digit: 3, mult: 1e3, tol: 0.05, tempco: 15 },
  { name: 'yellow', hex: '#fbc02d', digit: 4, mult: 1e4, tol: 0.02, tempco: 25 },
  { name: 'green', hex: '#388e3c', digit: 5, mult: 1e5, tol: 0.5, tempco: 20 },
  { name: 'blue', hex: '#1976d2', digit: 6, mult: 1e6, tol: 0.25, tempco: 10 },
  { name: 'violet', hex: '#7b1fa2', digit: 7, mult: 1e7, tol: 0.1, tempco: 5 },
  { name: 'grey', hex: '#8a8a8a', digit: 8, mult: 1e8, tol: 0.01, tempco: 1 },
  { name: 'white', hex: '#f5f5f5', digit: 9, mult: 1e9 },
  { name: 'gold', hex: '#c9a227', mult: 0.1, tol: 5 },
  { name: 'silver', hex: '#b8bcc2', mult: 0.01, tol: 10 },
  { name: 'pink', hex: '#f48fb1', mult: 0.001 },
  { name: 'none', hex: 'transparent', tol: 20 },
]

export const C = Object.fromEntries(COLORS.map((c) => [c.name, c])) as Record<ColorName, BandColor>

export type BandRole = 'digit' | 'mult' | 'tol' | 'tempco'

/** Role of each band for a resistor with `n` bands (3 = no tolerance band → ±20 %). */
export function roles(n: number): BandRole[] {
  if (n === 3) return ['digit', 'digit', 'mult']
  if (n === 4) return ['digit', 'digit', 'mult', 'tol']
  if (n === 5) return ['digit', 'digit', 'digit', 'mult', 'tol']
  return ['digit', 'digit', 'digit', 'mult', 'tol', 'tempco']
}

export const optionsFor = (role: BandRole) => COLORS.filter((c) => (role === 'digit' ? c.digit !== undefined : role === 'mult' ? c.mult !== undefined : role === 'tol' ? c.tol !== undefined && c.name !== 'none' : c.tempco !== undefined))

export interface Decoded {
  ohms: number
  tol: number
  tempco?: number
  min: number
  max: number
  error?: string
}

/** Rounds away floating-point noise (e.g. 47 × 0.1). */
const clean = (x: number) => Number(x.toPrecision(12))

export function decode(bands: ColorName[]): Decoded {
  const r = roles(bands.length)
  let digits = 0
  let mult = 1
  let tol = 20
  let tempco: number | undefined
  for (let i = 0; i < r.length; i++) {
    const c = C[bands[i]]
    if (r[i] === 'digit') {
      if (c.digit === undefined) return { ohms: NaN, tol, min: NaN, max: NaN, error: `Band ${i + 1} must be a digit colour` }
      digits = digits * 10 + c.digit
    } else if (r[i] === 'mult') {
      if (c.mult === undefined) return { ohms: NaN, tol, min: NaN, max: NaN, error: `Band ${i + 1} must be a multiplier colour` }
      mult = c.mult
    } else if (r[i] === 'tol') tol = c.tol ?? 20
    else tempco = c.tempco
  }
  const ohms = clean(digits * mult)
  return { ohms, tol, tempco, min: clean(ohms * (1 - tol / 100)), max: clean(ohms * (1 + tol / 100)) }
}

export interface Encoded {
  bands: ColorName[]
  ohms: number
  exact: boolean
  error?: string
}

/** Colour bands for a value; rounds to the available significant digits. */
export function encode(ohms: number, n: number, tol: number, tempco = 50): Encoded {
  const sig = n <= 4 ? 2 : 3
  if (!(ohms > 0) || !Number.isFinite(ohms)) return { bands: [], ohms: NaN, exact: false, error: 'Enter a positive resistance' }
  let e = Math.floor(Math.log10(ohms)) - (sig - 1)
  let d = Math.round(ohms / 10 ** e)
  if (d >= 10 ** sig) {
    d = Math.round(d / 10)
    e++
  }
  const multColor = COLORS.find((c) => c.mult !== undefined && Math.abs(Math.log10(c.mult) - e) < 1e-9)
  if (!multColor) return { bands: [], ohms: NaN, exact: false, error: e < -3 ? 'Too small for a colour code' : 'Too large for a colour code' }
  const digs = String(d).padStart(sig, '0').split('').map((ch) => COLORS[Number(ch)].name)
  const bands: ColorName[] = [...digs, multColor.name]
  if (n >= 4) bands.push(COLORS.find((c) => c.tol === tol && c.name !== 'none')?.name ?? 'gold')
  if (n === 6) bands.push(COLORS.find((c) => c.tempco === tempco)?.name ?? 'red')
  const actual = clean(d * 10 ** e)
  return { bands, ohms: actual, exact: Math.abs(actual - ohms) / ohms < 1e-9 }
}

const E24 = [1.0, 1.1, 1.2, 1.3, 1.5, 1.6, 1.8, 2.0, 2.2, 2.4, 2.7, 3.0, 3.3, 3.6, 3.9, 4.3, 4.7, 5.1, 5.6, 6.2, 6.8, 7.5, 8.2, 9.1]

export const SERIES = ['E6', 'E12', 'E24', 'E48', 'E96', 'E192'] as const
export type Series = (typeof SERIES)[number]

/** Mantissas in [1, 10) of an E-series. */
export function eSeries(s: Series): number[] {
  if (s === 'E6') return E24.filter((_, i) => i % 4 === 0)
  if (s === 'E12') return E24.filter((_, i) => i % 2 === 0)
  if (s === 'E24') return E24
  const n = Number(s.slice(1))
  return [...Array(n).keys()].map((i) => {
    const v = Math.round(10 ** (i / n) * 100) / 100
    return n === 192 && v === 9.19 ? 9.2 : v
  })
}

export interface Nearest {
  value: number
  errPct: number
  below: number
  above: number
}

export function nearestE(ohms: number, s: Series): Nearest {
  const m = eSeries(s)
  const dec = Math.floor(Math.log10(ohms))
  const cands: number[] = []
  for (const k of [dec - 1, dec, dec + 1]) for (const v of m) cands.push(clean(v * 10 ** k))
  cands.sort((a, b) => a - b)
  let best = cands[0]
  for (const c of cands) if (Math.abs(Math.log(c / ohms)) < Math.abs(Math.log(best / ohms))) best = c
  const below = [...cands].reverse().find((c) => c <= ohms * (1 + 1e-12)) ?? cands[0]
  const above = cands.find((c) => c >= ohms * (1 - 1e-12)) ?? cands[cands.length - 1]
  return { value: best, errPct: ((best - ohms) / ohms) * 100, below, above }
}

/** "4.7k", "4k7", "220R", "0R1", "1.5 MΩ", "330" → ohms. */
export function parseOhms(text: string): number {
  const t = text.trim().replace(/\s|Ω|ohms?/gi, '')
  const mult: Record<string, number> = { R: 1, r: 1, '': 1, m: 1e-3, k: 1e3, K: 1e3, M: 1e6, G: 1e9, g: 1e9 }
  let m = /^(\d+)([RrkKMGgm])(\d+)$/.exec(t)
  if (m) return clean(Number(`${m[1]}.${m[3]}`) * mult[m[2]])
  m = /^(\d*\.?\d+(?:e[+-]?\d+)?)([RrkKMGgm]?)$/.exec(t)
  if (m) return clean(Number(m[1]) * mult[m[2]])
  return NaN
}

export function formatOhms(x: number): string {
  if (!Number.isFinite(x)) return '—'
  const [d, u] = x >= 1e9 ? [1e9, 'GΩ'] : x >= 1e6 ? [1e6, 'MΩ'] : x >= 1e3 ? [1e3, 'kΩ'] : x >= 1 || x === 0 ? [1, 'Ω'] : [1e-3, 'mΩ']
  return `${Number((x / d).toPrecision(4))} ${u}`
}
