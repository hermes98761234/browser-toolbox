// Grain moisture shrink: weight lost when drying grain from an initial to a target moisture
// (wet basis), plus handling loss, bushel conversions and price impact.

export interface Crop {
  id: string
  name: string
  /** Standard test weight, lb per bushel. */
  lbPerBu: number
  /** Typical market base moisture, % wet basis. */
  base: number
  /** Typical elevator shrink factor, % per point (incl. some handling). */
  factor: number
}

export const CROPS: Crop[] = [
  { id: 'corn', name: 'Corn (shelled)', lbPerBu: 56, base: 15.5, factor: 1.4 },
  { id: 'soy', name: 'Soybeans', lbPerBu: 60, base: 13, factor: 1.3 },
  { id: 'wheat', name: 'Wheat', lbPerBu: 60, base: 13.5, factor: 1.3 },
  { id: 'sorghum', name: 'Sorghum (milo)', lbPerBu: 56, base: 14, factor: 1.3 },
  { id: 'barley', name: 'Barley', lbPerBu: 48, base: 14.5, factor: 1.3 },
  { id: 'oats', name: 'Oats', lbPerBu: 32, base: 14, factor: 1.3 },
  { id: 'sunflower', name: 'Sunflower (oil)', lbPerBu: 28, base: 10, factor: 1.2 },
  { id: 'canola', name: 'Canola', lbPerBu: 50, base: 10, factor: 1.2 },
]

export const LB_PER_KG = 2.2046226218

/** Water shrink (fraction of wet weight) going from m0 % to m1 % moisture, wet basis. */
export function waterShrink(m0: number, m1: number): number {
  if (!(m0 >= 0 && m0 < 100 && m1 >= 0 && m1 < 100)) return NaN
  if (m0 <= m1) return 0
  return (m0 - m1) / (100 - m1)
}

/** Shrink factor per point of moisture removed (%/point) implied by the exact formula. */
export const pointFactor = (m1: number) => 100 / (100 - m1)

export interface ShrinkInput {
  wetWeight: number // any mass unit
  m0: number // % initial
  m1: number // % target
  handling: number // % of wet weight (invisible loss)
  method: 'exact' | 'factor'
  factor: number // %/point, only for 'factor'
}

export interface ShrinkResult {
  points: number
  water: number // fraction
  total: number // fraction of wet weight
  dryWeight: number
  waterLost: number
  handlingLost: number
}

export function shrink(i: ShrinkInput): ShrinkResult {
  const points = Math.max(0, i.m0 - i.m1)
  const water = i.method === 'exact' ? waterShrink(i.m0, i.m1) : (points * i.factor) / 100
  const handling = points > 0 ? Math.max(0, i.handling) / 100 : 0
  const total = Math.min(1, water + handling)
  const dryWeight = i.wetWeight * (1 - total)
  return { points, water, total, dryWeight, waterLost: i.wetWeight * water, handlingLost: i.wetWeight * handling }
}

/** Dry matter is conserved: mass at m1 for a given mass at m0 (no handling loss). */
export const atMoisture = (w: number, m0: number, m1: number) => (w * (100 - m0)) / (100 - m1)
