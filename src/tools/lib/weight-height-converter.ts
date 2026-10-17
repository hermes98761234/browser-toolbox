// Exact weight / height conversions (international avoirdupois pound and inch).

export const LB = 0.45359237 // kg, exact by definition
export const IN = 2.54 // cm, exact by definition

export type WUnit = 'kg' | 'g' | 'lb' | 'oz' | 'st'
export type HUnit = 'cm' | 'm' | 'mm' | 'in' | 'ft'

export const W_FACTOR: Record<WUnit, number> = { kg: 1, g: 0.001, lb: LB, oz: LB / 16, st: LB * 14 }
export const H_FACTOR: Record<HUnit, number> = { cm: 1, m: 100, mm: 0.1, in: IN, ft: IN * 12 }

export const toKg = (v: number, u: WUnit) => v * W_FACTOR[u]
export const fromKg = (kg: number, u: WUnit) => kg / W_FACTOR[u]
export const toCm = (v: number, u: HUnit) => v * H_FACTOR[u]
export const fromCm = (cm: number, u: HUnit) => cm / H_FACTOR[u]

/** Rounds to `d` decimals and trims trailing zeros. */
export function round(x: number, d: number): string {
  if (!Number.isFinite(x)) return '—'
  const s = x.toFixed(d)
  return d > 0 ? s.replace(/\.?0+$/, '') : s
}

/** Splits a big unit into whole + remainder small units with rounding carry (e.g. 5 ft 11.99 in → 6 ft 0 in). */
function compound(total: number, per: number, d: number): [number, number] {
  const sign = total < 0 ? -1 : 1
  const t = Math.abs(total)
  let whole = Math.floor(t / per)
  let rest = Number((t - whole * per).toFixed(d))
  if (rest >= per) {
    whole += 1
    rest = Number((rest - per).toFixed(d))
  }
  return [sign * whole, rest]
}

export function ftIn(cm: number, d = 1): string {
  const [ft, inch] = compound(cm / IN, 12, d)
  return `${ft}′ ${round(inch, d)}″`
}
export function stLb(kg: number, d = 1): string {
  const [st, lb] = compound(kg / LB, 14, d)
  return `${st} st ${round(lb, d)} lb`
}
export function lbOz(kg: number, d = 1): string {
  const [lb, oz] = compound((kg / LB) * 16, 16, d)
  return `${lb} lb ${round(oz, d)} oz`
}

export function bmi(kg: number, cm: number) {
  const v = kg / (cm / 100) ** 2
  const cat = v < 18.5 ? 'Underweight' : v < 25 ? 'Healthy weight' : v < 30 ? 'Overweight' : 'Obesity'
  return { v, cat }
}
