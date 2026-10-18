// Portion geometry for a healthy-plate model: each food group gets a sector of the plate's usable
// area, a typical mound height and a packing factor → volume (ml) → grams → kcal. Energy densities
// are rounded typical values for cooked foods (informational only).

export type Group = 'veg' | 'protein' | 'grain'

export interface Food { id: string; name: string; group: Group; height: number; fill: number; density: number; kcal: number; color: string }

/** height cm, fill = packing factor, density g/ml, kcal per gram. */
export const FOODS: Food[] = [
  { id: 'broccoli', name: 'Broccoli & carrots', group: 'veg', height: 3.5, fill: 0.55, density: 0.5, kcal: 0.35, color: '#16a34a' },
  { id: 'salad', name: 'Leafy salad', group: 'veg', height: 4.5, fill: 0.5, density: 0.2, kcal: 0.2, color: '#4ade80' },
  { id: 'roastveg', name: 'Roasted peppers & zucchini', group: 'veg', height: 3, fill: 0.6, density: 0.55, kcal: 0.45, color: '#ef4444' },
  { id: 'chicken', name: 'Chicken breast', group: 'protein', height: 2, fill: 0.7, density: 1.05, kcal: 1.65, color: '#f5deb3' },
  { id: 'salmon', name: 'Salmon fillet', group: 'protein', height: 2.2, fill: 0.65, density: 1.05, kcal: 2.0, color: '#fb923c' },
  { id: 'tofu', name: 'Firm tofu', group: 'protein', height: 2.5, fill: 0.65, density: 1.0, kcal: 1.45, color: '#fef9c3' },
  { id: 'beans', name: 'Beans / lentils', group: 'protein', height: 2.5, fill: 0.75, density: 0.75, kcal: 1.2, color: '#92400e' },
  { id: 'brownrice', name: 'Brown rice', group: 'grain', height: 2.5, fill: 0.75, density: 0.8, kcal: 1.12, color: '#e7d3a8' },
  { id: 'pasta', name: 'Whole-wheat pasta', group: 'grain', height: 3, fill: 0.6, density: 0.6, kcal: 1.5, color: '#f59e0b' },
  { id: 'potato', name: 'Potatoes', group: 'grain', height: 3, fill: 0.65, density: 0.7, kcal: 0.87, color: '#fde68a' },
  { id: 'quinoa', name: 'Quinoa', group: 'grain', height: 2.2, fill: 0.75, density: 0.8, kcal: 1.2, color: '#d6c69a' },
]
export const food = (id: string) => FOODS.find((f) => f.id === id) ?? FOODS[0]

export const ML_PER_CUP = 236.6
/** Share of the diameter that holds food (the rim is left free). */
export const USABLE = 0.82

export interface Section { group: Group; frac: number; food: string }
export interface Portion { group: Group; food: Food; area: number; ml: number; cups: number; grams: number; kcal: number; startDeg: number; spanDeg: number }

/** Plate diameter in cm → per-section portions. Fractions are normalised to sum to 1. */
export function portions(diameterCm: number, sections: Section[], scale = 1): Portion[] {
  const r = (diameterCm * USABLE) / 2
  const area = Math.PI * r * r
  const tot = sections.reduce((a, s) => a + Math.max(0, s.frac), 0) || 1
  let start = 0
  return sections.map((s) => {
    const f = food(s.food)
    const frac = Math.max(0, s.frac) / tot
    const a = area * frac
    const ml = a * f.height * f.fill * scale
    const grams = ml * f.density
    const out = { group: s.group, food: f, area: a, ml, cups: ml / ML_PER_CUP, grams, kcal: grams * f.kcal, startDeg: start, spanDeg: frac * 360 }
    start += frac * 360
    return out
  })
}

/** Hemisphere-like mound of volume `ml` and height `h` → base radius (cm). */
export const moundRadius = (ml: number, h: number) => Math.sqrt((3 * ml) / (2 * Math.PI * Math.max(0.1, h)))

/** Centroid distance of a circular sector (radius r, angle span in degrees) from the centre. */
export function sectorCentroid(r: number, spanDeg: number) {
  const a = (spanDeg * Math.PI) / 360 // half angle
  if (a >= Math.PI - 1e-9) return 0
  return (2 * r * Math.sin(a)) / (3 * a)
}

/** Hand-size guide (fist ≈ 1 cup, palm ≈ 100 g cooked protein). */
export function handGuide(p: Portion) {
  if (p.group === 'protein') return `${(p.grams / 100).toFixed(1)} palm${p.grams > 150 ? 's' : ''}`
  return `${p.cups.toFixed(1)} fist${p.cups >= 1.5 ? 's' : ''}`
}
