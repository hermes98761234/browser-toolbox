// Tree growth: species table with typical mature sizes (nursery / extension-service ranges; local
// conditions change them a lot), Chapman–Richards growth curves and planting-distance checks.

export type Form = 'round' | 'oval' | 'vase' | 'cone' | 'column' | 'weeping' | 'palm'
export interface Species {
  id: string; name: string; h: number; w: number; years: number; form: Form; ever: boolean
  leaf: string; fall: string; roots: 'low' | 'moderate' | 'aggressive'; trunk: number
}

/** h, w: mature height/spread (m); years: age reaching ~90 % of mature height; trunk: mature trunk diameter (m). */
export const SPECIES: Species[] = [
  { id: 'redmaple', name: 'Red maple', h: 18, w: 12, years: 40, form: 'oval', ever: false, leaf: '#4d7c0f', fall: '#dc2626', roots: 'moderate', trunk: 0.6 },
  { id: 'sugarmaple', name: 'Sugar maple', h: 24, w: 15, years: 60, form: 'round', ever: false, leaf: '#3f6212', fall: '#f97316', roots: 'moderate', trunk: 0.8 },
  { id: 'jmaple', name: 'Japanese maple', h: 6, w: 6, years: 30, form: 'round', ever: false, leaf: '#9f1239', fall: '#b91c1c', roots: 'low', trunk: 0.25 },
  { id: 'whiteoak', name: 'White oak', h: 25, w: 25, years: 80, form: 'round', ever: false, leaf: '#365314', fall: '#92400e', roots: 'moderate', trunk: 1.1 },
  { id: 'pinoak', name: 'Pin oak', h: 21, w: 12, years: 50, form: 'cone', ever: false, leaf: '#3f6212', fall: '#991b1b', roots: 'moderate', trunk: 0.8 },
  { id: 'elm', name: 'American elm (DED-resistant)', h: 25, w: 18, years: 50, form: 'vase', ever: false, leaf: '#4d7c0f', fall: '#ca8a04', roots: 'aggressive', trunk: 1.0 },
  { id: 'birch', name: 'River birch', h: 15, w: 10, years: 30, form: 'oval', ever: false, leaf: '#65a30d', fall: '#eab308', roots: 'moderate', trunk: 0.4 },
  { id: 'willow', name: 'Weeping willow', h: 12, w: 12, years: 20, form: 'weeping', ever: false, leaf: '#84cc16', fall: '#ca8a04', roots: 'aggressive', trunk: 0.9 },
  { id: 'poplar', name: 'Lombardy poplar', h: 20, w: 4, years: 20, form: 'column', ever: false, leaf: '#4d7c0f', fall: '#facc15', roots: 'aggressive', trunk: 0.6 },
  { id: 'ginkgo', name: 'Ginkgo', h: 20, w: 10, years: 60, form: 'oval', ever: false, leaf: '#65a30d', fall: '#facc15', roots: 'low', trunk: 0.6 },
  { id: 'crabapple', name: 'Flowering crabapple', h: 6, w: 6, years: 15, form: 'round', ever: false, leaf: '#4d7c0f', fall: '#ea580c', roots: 'low', trunk: 0.25 },
  { id: 'redbud', name: 'Eastern redbud', h: 8, w: 9, years: 20, form: 'vase', ever: false, leaf: '#65a30d', fall: '#eab308', roots: 'low', trunk: 0.3 },
  { id: 'magnolia', name: 'Southern magnolia', h: 18, w: 10, years: 50, form: 'oval', ever: true, leaf: '#14532d', fall: '#14532d', roots: 'moderate', trunk: 0.7 },
  { id: 'wpine', name: 'Eastern white pine', h: 25, w: 10, years: 50, form: 'cone', ever: true, leaf: '#166534', fall: '#166534', roots: 'moderate', trunk: 0.9 },
  { id: 'spruce', name: 'Norway spruce', h: 30, w: 10, years: 60, form: 'cone', ever: true, leaf: '#14532d', fall: '#14532d', roots: 'moderate', trunk: 0.9 },
  { id: 'bluespruce', name: 'Colorado blue spruce', h: 18, w: 6, years: 50, form: 'cone', ever: true, leaf: '#4b7f86', fall: '#4b7f86', roots: 'low', trunk: 0.5 },
  { id: 'leyland', name: 'Leyland cypress', h: 20, w: 5, years: 20, form: 'column', ever: true, leaf: '#15803d', fall: '#15803d', roots: 'moderate', trunk: 0.5 },
  { id: 'palm', name: 'Mexican fan palm', h: 20, w: 4, years: 40, form: 'palm', ever: true, leaf: '#4d7c0f', fall: '#4d7c0f', roots: 'low', trunk: 0.35 },
]
export const speciesById = (id: string) => SPECIES.find((s) => s.id === id) ?? SPECIES[0]

const P = 1.4 // shape exponent of the Chapman–Richards curve

/** Growth rate k so that the tree reaches 90 % of its mature size at `years`. */
export const rateFor = (years: number) => -Math.log(1 - 0.9 ** (1 / P)) / Math.max(1, years)

/** Fraction (0..1) of mature size at age (years). */
export const growth = (age: number, years: number) => (age <= 0 ? 0 : (1 - Math.exp(-rateFor(years) * age)) ** P)

export interface Size { h: number; w: number; trunk: number; crownBase: number }
export function sizeAt(sp: Species, age: number, plantedH = 1.8, plantedAge = 3): Size {
  // Nursery stock starts at plantedH; the curve is shifted so size(plantedAge) ≈ planted size.
  const f = growth(age + plantedAge, sp.years)
  const h = Math.max(plantedH, sp.h * f)
  const w = Math.max(plantedH * (sp.w / sp.h) * 0.8, sp.w * f)
  const crownBase = sp.form === 'cone' || sp.form === 'column' ? h * 0.06 : sp.form === 'palm' ? h * 0.85 : Math.min(h * 0.35, 2.5 + h * 0.1)
  return { h, w, trunk: Math.max(0.03, sp.trunk * f), crownBase }
}

/** Age (years after planting) when the tree first reaches a height. */
export function ageForHeight(sp: Species, target: number, plantedH = 1.8, plantedAge = 3): number | null {
  for (let a = 0; a <= 200; a++) if (sizeAt(sp, a, plantedH, plantedAge).h >= target) return a
  return null
}

export interface Advice { minDist: number; overhang: number; ok: boolean; notes: string[] }
/** Planting distance from a wall: half the spread plus 1.5 m, or the mature height for aggressive roots. */
export function advice(sp: Species, dist: number, now: Size): Advice {
  const minDist = sp.roots === 'aggressive' ? Math.max(sp.h, sp.w / 2 + 1.5) : sp.w / 2 + 1.5
  const overhang = Math.max(0, now.w / 2 - dist)
  const notes: string[] = []
  if (dist < sp.w / 2) notes.push(`At maturity the canopy (radius ${(sp.w / 2).toFixed(1)} m) will reach the wall: plan for pruning, gutter cleaning and roof debris.`)
  if (sp.roots === 'aggressive' && dist < sp.h) notes.push('Vigorous, water-seeking roots: keep at least the mature height away from foundations, drains and sewer lines, especially on clay soils.')
  if (dist > sp.h * 1.1) notes.push('Far enough that even a failing trunk would not reach the house.')
  if (sp.ever) notes.push('Evergreen: shades all year, good as a windbreak on the winter-wind side, less ideal south of the house (north in the southern hemisphere).')
  else notes.push('Deciduous: summer shade, winter sun once the leaves drop — ideal on the sunny side of the house.')
  return { minDist, overhang, ok: dist >= minDist, notes }
}

/** Seeded pseudo-random generator (mulberry32) so trees look the same between renders. */
export function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** True when deciduous trees are leafless (late Nov–mid Apr; hemisphere-aware). */
export function leafless(month: number, lat: number): boolean {
  const m = lat < 0 ? ((month + 6) % 12) : month // 0 = January
  return m <= 2 || m === 11
}
export function autumn(month: number, lat: number): boolean {
  const m = lat < 0 ? ((month + 6) % 12) : month
  return m === 9 || m === 10
}
