// Fertilizer label (N-P2O5-K2O guaranteed analysis) math: product needed for a nutrient target,
// nutrients delivered, cost per unit nutrient and soluble mixing rates (ppm).

export type Nut = 'n' | 'p' | 'k'
export interface Product { id: string; name: string; n: number; p: number; k: number; bag: number; price: number }

/** Grams per square metre in one unit of each rate unit. */
export const RATE_UNITS = {
  'lb/1000ft2': 453.59237 / 92.90304, // 4.8824 g/m²
  'kg/ha': 0.1,
  'g/m2': 1,
  'lb/acre': 453.59237 / 4046.8564224, // 0.1121 g/m²
} as const
export type RateUnit = keyof typeof RATE_UNITS

export const AREA_UNITS = { ft2: 0.09290304, m2: 1, acre: 4046.8564224, ha: 10000 } as const
export type AreaUnit = keyof typeof AREA_UNITS

/** Label oxide → elemental conversion factors (P = 0.4364 × P2O5, K = 0.8301 × K2O). */
export const P_FROM_P2O5 = 0.4364
export const K_FROM_K2O = 0.8301

/** Grams of product for a nutrient target. Returns Infinity if the product lacks the nutrient. */
export function productGrams(target: number, rateUnit: RateUnit, area: number, areaUnit: AreaUnit, pct: number): number {
  if (pct <= 0) return Infinity
  const nutrientG = target * RATE_UNITS[rateUnit] * area * AREA_UNITS[areaUnit]
  return nutrientG / (pct / 100)
}

/** Nutrient rates delivered (in `rateUnit`) by `grams` of product over the area. */
export function delivered(p: Product, grams: number, rateUnit: RateUnit, area: number, areaUnit: AreaUnit): Record<Nut, number> {
  const m2 = area * AREA_UNITS[areaUnit]
  const r = (pct: number) => (m2 > 0 ? (grams * pct) / 100 / m2 / RATE_UNITS[rateUnit] : 0)
  return { n: r(p.n), p: r(p.p), k: r(p.k) }
}

/** Cost of one kg of the given nutrient when bought in this product. */
export const costPerKgNutrient = (p: Product, nut: Nut) => (p[nut] > 0 && p.bag > 0 ? p.price / (p.bag * (p[nut] / 100)) : Infinity)

/** Grams of soluble product per litre of water for a target ppm (mg/L) of a nutrient. */
export const gramsPerLitre = (ppm: number, pct: number) => (pct > 0 ? ppm / (pct * 10) : Infinity)

/** N:P2O5:K2O ratio reduced by the smallest non-zero value, e.g. 24-8-16 → 3 : 1 : 2. */
export function ratio(p: Pick<Product, Nut>): string {
  const vals = [p.n, p.p, p.k]
  const min = Math.min(...vals.filter((v) => v > 0))
  if (!Number.isFinite(min)) return '0 : 0 : 0'
  return vals.map((v) => +(v / min).toFixed(1)).join(' : ')
}

/** Parses a label string like "10-10-10" or "24 8 16". */
export function parseLabel(s: string): [number, number, number] | null {
  const m = s.trim().match(/^(\d+(?:\.\d+)?)\s*[-–/ ]\s*(\d+(?:\.\d+)?)\s*[-–/ ]\s*(\d+(?:\.\d+)?)$/)
  if (!m) return null
  const v = [+m[1], +m[2], +m[3]] as [number, number, number]
  return v.reduce((a, x) => a + x, 0) <= 100 ? v : null
}
