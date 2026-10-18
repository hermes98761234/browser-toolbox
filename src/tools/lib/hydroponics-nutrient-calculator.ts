// Hydroponic reservoir maths: EC ↔ ppm scales, label-based dosing scaled to a target EC,
// elemental ppm delivered, and pH-adjuster dose estimates.
import { K_FROM_K2O, P_FROM_P2O5 } from './fertilizer-npk-calculator'

/** ppm = EC (µS/cm) × factor. */
export const PPM_SCALES = {
  '500': { factor: 0.5, name: '500 scale (NaCl / “TDS”)', note: 'Common on low-cost pens and many US meters.' },
  '640': { factor: 0.64, name: '640 scale', note: 'Used by some European and Australian growers and meters.' },
  '700': { factor: 0.7, name: '700 scale (442 / KCl)', note: 'Common on many EU/UK meters (“442 natural water”).' },
} as const
export type Scale = keyof typeof PPM_SCALES

export const ecToPpm = (ecMs: number, scale: Scale) => ecMs * 1000 * PPM_SCALES[scale].factor
export const ppmToEc = (ppm: number, scale: Scale) => ppm / 1000 / PPM_SCALES[scale].factor

export const VOL_L = { L: 1, gal: 3.785411784 } as const
export type VolUnit = keyof typeof VOL_L
/** Dose units → ml (liquids) or g (powders). */
export const DOSE_UNITS = { ml: 1, g: 1, tsp: 4.92892159, tbsp: 14.7867648, 'fl oz': 29.5735296 } as const
export type DoseUnit = keyof typeof DOSE_UNITS

export type Role = 'silica' | 'calmag' | 'a' | 'b' | 'base' | 'bloom' | 'additive'
export const ROLE_ORDER: Record<Role, [number, string]> = {
  silica: [0, 'Silica'],
  calmag: [1, 'Cal-Mag'],
  a: [2, 'Part A (calcium side)'],
  b: [3, 'Part B (sulphate/phosphate side)'],
  base: [2, 'One-part base nutrient'],
  bloom: [4, 'Bloom booster / PK'],
  additive: [5, 'Additive'],
}

export interface Product {
  id: string
  name: string
  role: Role
  amount: number // label dose amount
  unit: DoseUnit
  per: number // … per this much water
  perUnit: VolUnit
  ec: number // EC added by one full label dose (mS/cm), measured or from the label
  n: number; p: number; k: number // label N-P2O5-K2O %
  liquid: boolean
  density: number // kg/L for liquids
  on: boolean
}

/** Amount (in the product's dose unit) per litre of reservoir at full label strength. */
export function perLitre(p: Product): number {
  const water = p.per * VOL_L[p.perUnit]
  return water > 0 ? p.amount / water : 0
}

/** Strength factor (1 = label dose) that reaches a target EC, given the source water EC. */
export function strengthForEc(target: number, waterEc: number, products: Product[]): number {
  const sum = products.filter((p) => p.on).reduce((a, p) => a + Math.max(0, p.ec), 0)
  if (sum <= 0) return NaN
  return Math.max(0, (target - waterEc) / sum)
}

export const predictedEc = (strength: number, waterEc: number, products: Product[]) =>
  waterEc + strength * products.filter((p) => p.on).reduce((a, p) => a + Math.max(0, p.ec), 0)

/** Elemental N, P, K in ppm (mg/L) delivered by a product at the given strength. */
export function elementalPpm(p: Product, strength: number): { n: number; p: number; k: number } {
  const perL = perLitre(p) * strength * DOSE_UNITS[p.unit] // ml or g per L
  const grams = p.liquid ? perL * p.density : perL
  const mg = grams * 1000
  return { n: (mg * p.n) / 100, p: (mg * p.p * P_FROM_P2O5) / 100, k: (mg * p.k * K_FROM_K2O) / 100 }
}

/**
 * Estimated pH adjuster volume (ml) for a pH change. `mlPerLPerUnit` is how many ml per litre move pH by
 * one unit in your water (from a past adjustment). Buffering is non-linear, so the tool advises dosing in parts.
 */
export const phDose = (litres: number, delta: number, mlPerLPerUnit: number) => Math.max(0, litres * Math.abs(delta) * mlPerLPerUnit)

/** Calibrates the ml/L/unit rate from a measured adjustment. */
export const calibrate = (ml: number, litres: number, phChange: number) => (litres > 0 && phChange !== 0 ? ml / litres / Math.abs(phChange) : NaN)

export interface Crop { name: string; ec: [number, number]; ph: [number, number] }
/** Typical reservoir ranges for mature plants (EC in mS/cm). Start seedlings and clones lower. */
export const CROPS: Crop[] = [
  { name: 'Lettuce', ec: [0.8, 1.2], ph: [5.5, 6.5] },
  { name: 'Spinach', ec: [1.8, 2.3], ph: [5.5, 6.6] },
  { name: 'Kale', ec: [1.25, 1.5], ph: [5.5, 6.5] },
  { name: 'Basil', ec: [1.0, 1.6], ph: [5.5, 6.5] },
  { name: 'Mint', ec: [2.0, 2.4], ph: [5.5, 6.5] },
  { name: 'Strawberry', ec: [1.0, 1.5], ph: [5.5, 6.2] },
  { name: 'Tomato', ec: [2.0, 4.0], ph: [5.5, 6.5] },
  { name: 'Cucumber', ec: [1.7, 2.5], ph: [5.5, 6.0] },
  { name: 'Pepper', ec: [2.0, 3.0], ph: [5.5, 6.5] },
  { name: 'Microgreens', ec: [0.5, 1.0], ph: [5.5, 6.5] },
]
export const STAGES = { seedling: [0.4, 'Seedlings / clones'], veg: [0.75, 'Vegetative'], mature: [1, 'Mature / fruiting'] } as const
export type Stage = keyof typeof STAGES
