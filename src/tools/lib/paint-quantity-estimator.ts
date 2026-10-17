// Surface-by-surface paint take-off: areas, opening deductions, texture factors, coats, primer and can plans.
import { bestCans, type CanPlan } from './paint-calculator'

export type Kind = 'room' | 'wall' | 'ceiling' | 'trim' | 'door'
export type Texture = 'smooth' | 'light' | 'heavy' | 'masonry'
export type ProductId = 'wall' | 'ceiling' | 'trim'
export interface Surface { id: string; name: string; kind: Kind; a: number; b: number; c: number; qty: number; product: ProductId; texture: Texture; primer: boolean }
export interface Opening { id: string; name: string; w: number; h: number; qty: number; surface: string }
export interface Product { name: string; coverage: number; coats: number; prices: number[] }

export const TEXTURE: Record<Texture, [string, number]> = {
  smooth: ['Smooth / previously painted', 1],
  light: ['Light texture (orange peel)', 1.1],
  heavy: ['Heavy texture / popcorn', 1.25],
  masonry: ['Masonry / brick / stucco', 1.5],
}

export const KIND_LABEL: Record<Kind, string> = { room: 'Room walls (L × W × H)', wall: 'Single wall (W × H)', ceiling: 'Ceiling (L × W)', trim: 'Trim / baseboard (length × width)', door: 'Door (W × H, both sides)' }

export const UNITS = {
  imperial: { len: 'ft', area: 'ft²', vol: 'gal', small: 'in', cans: [0.25, 1, 5], canNames: ['Quart', 'Gallon', '5-gallon pail'] },
  metric: { len: 'm', area: 'm²', vol: 'L', small: 'cm', cans: [1, 2.5, 10], canNames: ['1 L', '2.5 L', '10 L'] },
} as const
export type Units = keyof typeof UNITS

/** Gross area of one surface (× qty). Trim width is in inches (imperial) or cm (metric). */
export function grossArea(s: Surface, units: Units): number {
  const q = Math.max(0, s.qty)
  const [a, b, c] = [Math.max(0, s.a), Math.max(0, s.b), Math.max(0, s.c)]
  switch (s.kind) {
    case 'room': return 2 * (a + b) * c * q
    case 'wall': return a * b * q
    case 'ceiling': return a * b * q
    case 'trim': return a * (b / (units === 'imperial' ? 12 : 100)) * q
    case 'door': return a * b * 2 * q
  }
}

export interface SurfaceResult { id: string; gross: number; deduct: number; net: number; effective: number }

/** Net and texture-weighted area per surface after subtracting assigned openings (never below zero). */
export function surfaceAreas(surfaces: Surface[], openings: Opening[], units: Units): SurfaceResult[] {
  return surfaces.map((s) => {
    const gross = grossArea(s, units)
    const deduct = s.kind === 'room' || s.kind === 'wall' ? openings.filter((o) => o.surface === s.id).reduce((t, o) => t + Math.max(0, o.w) * Math.max(0, o.h) * Math.max(0, o.qty), 0) : 0
    const net = Math.max(0, gross - deduct)
    return { id: s.id, gross, deduct: Math.min(deduct, gross), net, effective: net * TEXTURE[s.texture][1] }
  })
}

export interface ProductResult { id: ProductId | 'primer'; area: number; coats: number; volume: number; plan: CanPlan | null }

/**
 * Volume per product = Σ effective area × coats / coverage × (1 + waste). Extra coat for dark→light colour changes on wall paint.
 * Primer covers surfaces flagged for primer with one coat.
 */
export function estimate(surfaces: Surface[], openings: Opening[], products: Record<ProductId | 'primer', Product>, units: Units, wastePct: number, colorChange: boolean): { areas: SurfaceResult[]; products: ProductResult[] } {
  const areas = surfaceAreas(surfaces, openings, units)
  const cans = UNITS[units].cans
  const out: ProductResult[] = []
  for (const id of ['wall', 'ceiling', 'trim', 'primer'] as const) {
    const p = products[id]
    const area = areas.reduce((t, a, i) => t + (id === 'primer' ? (surfaces[i].primer ? a.effective : 0) : surfaces[i].product === id ? a.effective : 0), 0)
    const coats = Math.max(0, p.coats) + (colorChange && id === 'wall' ? 1 : 0)
    const volume = p.coverage > 0 ? ((area * coats) / p.coverage) * (1 + Math.max(0, wastePct) / 100) : 0
    out.push({ id, area, coats, volume, plan: volume > 0 ? bestCans(volume, cans.map((size, k) => ({ size, price: p.prices[k] ?? 0 }))) : null })
  }
  return { areas, products: out }
}

/** Typical spread rates: ~350–400 ft²/gal, 9–11 m²/L for interior latex; primer is a little lower. */
export const DEFAULT_PRODUCTS: Record<Units, Record<ProductId | 'primer', Product>> = {
  imperial: {
    wall: { name: 'Wall paint (eggshell)', coverage: 375, coats: 2, prices: [17, 42, 185] },
    ceiling: { name: 'Ceiling paint (flat)', coverage: 400, coats: 2, prices: [14, 34, 150] },
    trim: { name: 'Trim enamel (semi-gloss)', coverage: 400, coats: 2, prices: [22, 55, 240] },
    primer: { name: 'Primer', coverage: 300, coats: 1, prices: [13, 28, 120] },
  },
  metric: {
    wall: { name: 'Wall paint (eggshell)', coverage: 10, coats: 2, prices: [16, 34, 110] },
    ceiling: { name: 'Ceiling paint (flat)', coverage: 11, coats: 2, prices: [13, 28, 90] },
    trim: { name: 'Trim enamel (satin)', coverage: 12, coats: 2, prices: [21, 45, 150] },
    primer: { name: 'Primer', coverage: 8, coats: 1, prices: [12, 25, 80] },
  },
}
