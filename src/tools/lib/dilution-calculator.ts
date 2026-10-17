// Dilution maths: unit conversion, C1·V1 = C2·V2 and serial dilution plans.

export const CONC_UNITS = ['M', 'mM', 'µM', 'nM', 'pM', 'g/L', 'mg/mL', 'µg/mL', 'ng/mL', '% w/v', 'X'] as const
export type ConcUnit = (typeof CONC_UNITS)[number]
export const VOL_UNITS = ['L', 'mL', 'µL', 'nL'] as const
export type VolUnit = (typeof VOL_UNITS)[number]

const MOLAR: Partial<Record<ConcUnit, number>> = { M: 1, mM: 1e-3, µM: 1e-6, nM: 1e-9, pM: 1e-12 }
const MASS: Partial<Record<ConcUnit, number>> = { 'g/L': 1, 'mg/mL': 1, 'µg/mL': 1e-3, 'ng/mL': 1e-6, '% w/v': 10 }
const VOL: Record<VolUnit, number> = { L: 1, mL: 1e-3, µL: 1e-6, nL: 1e-9 }

export type Family = 'molar' | 'mass' | 'fold'
export const family = (u: ConcUnit): Family => (u in MOLAR ? 'molar' : u in MASS ? 'mass' : 'fold')

/** Converts a concentration; molar ↔ mass needs the molecular weight (g/mol). Returns NaN if impossible. */
export function convertConc(v: number, from: ConcUnit, to: ConcUnit, mw = 0): number {
  const ff = family(from), ft = family(to)
  if (ff === 'fold' || ft === 'fold') return ff === ft ? v : NaN
  let base = ff === 'molar' ? v * MOLAR[from]! : v * MASS[from]! // mol/L or g/L
  if (ff !== ft) {
    if (!(mw > 0)) return NaN
    base = ff === 'molar' ? base * mw : base / mw
  }
  return ft === 'molar' ? base / MOLAR[to]! : base / MASS[to]!
}

export const toL = (v: number, u: VolUnit) => v * VOL[u]
export const fromL = (v: number, u: VolUnit) => v / VOL[u]

/** Picks a readable volume unit. */
export function fmtVol(L: number): string {
  if (!Number.isFinite(L)) return '—'
  const a = Math.abs(L)
  const [u, f] = a >= 1 ? ['L', 1] : a >= 1e-3 ? ['mL', 1e3] : a >= 1e-6 || a === 0 ? ['µL', 1e6] : ['nL', 1e9]
  return `${Number((L * f).toPrecision(4))} ${u}`
}

export function fmtConc(v: number, u: ConcUnit): string {
  if (!Number.isFinite(v)) return '—'
  // move to a friendlier unit inside the same family
  const fam = family(u)
  if (fam === 'molar') {
    const M = v * MOLAR[u]!
    const order: ConcUnit[] = ['M', 'mM', 'µM', 'nM', 'pM']
    const best = order.find((x) => Math.abs(M) >= MOLAR[x]! * 0.9999) ?? 'pM'
    return `${Number((M / MOLAR[best]!).toPrecision(4))} ${best}`
  }
  if (fam === 'mass' && u !== '% w/v') {
    const g = v * MASS[u]!
    const order: ConcUnit[] = ['mg/mL', 'µg/mL', 'ng/mL']
    const best = order.find((x) => Math.abs(g) >= MASS[x]! * 0.9999) ?? 'ng/mL'
    return `${Number((g / MASS[best]!).toPrecision(4))} ${best}`
  }
  return `${Number(v.toPrecision(4))} ${u}`
}

export type Field = 'c1' | 'v1' | 'c2' | 'v2'

/** Solves C1·V1 = C2·V2 for `unknown` (concentrations in the same unit, volumes in litres). */
export function solve(unknown: Field, x: Record<Field, number>): number {
  const { c1, v1, c2, v2 } = x
  switch (unknown) {
    case 'c1': return (c2 * v2) / v1
    case 'v1': return (c2 * v2) / c1
    case 'c2': return (c1 * v1) / v2
    case 'v2': return (c1 * v1) / c2
  }
}

export interface Tube {
  n: number
  conc: number
  /** volume moved in from the previous tube (or stock) */
  transfer: number
  diluent: number
  /** volume left after passing `transfer` on (last tube: discard to match) */
  final: number
  discard: number
}

/**
 * Serial dilution with equal final volumes: each tube gets `final` diluent plus t = final / (DF − 1)
 * from the previous tube, passes t on, and the last tube discards t.
 */
export function serial(stock: number, df: number, steps: number, final: number): Tube[] {
  if (!(df > 1) || steps < 1 || !(final > 0)) return []
  const t = final / (df - 1)
  return Array.from({ length: Math.floor(steps) }, (_, i) => ({
    n: i + 1,
    conc: stock / df ** (i + 1),
    transfer: t,
    diluent: final,
    final,
    discard: i === steps - 1 ? t : 0,
  }))
}
