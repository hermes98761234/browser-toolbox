// Aquarium geometry: footprint areas per shape, gross/net volume, weights and equipment rules of thumb.

export type Shape = 'rect' | 'cylinder' | 'hexagon' | 'bowfront' | 'corner'
export interface Dims { l: number; w: number; h: number; bow: number } // cm; l = length / diameter / across-flats / radius

/** Circular segment area for chord c and sagitta b. */
export function segment(c: number, b: number): number {
  if (b <= 0 || c <= 0) return 0
  const R = (c * c) / (8 * b) + b / 2
  const th = 2 * Math.asin(Math.min(1, c / (2 * R)))
  return (R * R * (th - Math.sin(th))) / 2
}

/** Footprint area in cm². */
export function area(shape: Shape, d: Dims): number {
  switch (shape) {
    case 'rect': return d.l * d.w
    case 'cylinder': return Math.PI * (d.l / 2) ** 2
    case 'hexagon': return (Math.sqrt(3) / 2) * d.l * d.l // across flats
    case 'bowfront': return d.l * d.w + segment(d.l, d.bow)
    case 'corner': return (Math.PI * d.l * d.l) / 4 // quarter circle, radius l
  }
}

/** Inner dimensions after subtracting glass thickness t (cm). */
export function inner(shape: Shape, d: Dims, t: number): Dims {
  const two = 2 * t
  switch (shape) {
    case 'corner': return { ...d, l: Math.max(0, d.l - two), h: Math.max(0, d.h - t) }
    case 'bowfront': return { l: Math.max(0, d.l - two), w: Math.max(0, d.w - two), h: Math.max(0, d.h - t), bow: d.bow }
    default: return { ...d, l: Math.max(0, d.l - two), w: Math.max(0, d.w - two), h: Math.max(0, d.h - t) }
  }
}

export interface Result {
  gross: number; inner: number; water: number; surface: number; waterWeight: number; substrateKg: number; glassKg: number; total: number
}

/**
 * gross = outer footprint × height; water = inner footprint × (fill level − substrate) × (1 − decor%).
 * Volumes in litres (1 L = 1000 cm³); weights in kg.
 */
export function compute(shape: Shape, d: Dims, o: { glass: number; fill: number; substrate: number; decor: number; salt: boolean }): Result {
  const inn = inner(shape, d, o.glass / 10)
  const A = area(shape, d), Ai = area(shape, inn)
  const level = Math.min(inn.h, Math.max(0, o.fill))
  const water = (Ai * Math.max(0, level - o.substrate) * (1 - o.decor / 100)) / 1000
  const perimeter = (() => {
    switch (shape) {
      case 'rect': return 2 * (d.l + d.w)
      case 'cylinder': return Math.PI * d.l
      case 'hexagon': return 6 * (d.l / Math.sqrt(3))
      case 'bowfront': return d.l + 2 * d.w + d.l * 1.1
      case 'corner': return 2 * d.l + (Math.PI * d.l) / 2
    }
  })()
  const glassCm3 = (perimeter * d.h + A) * (o.glass / 10)
  const substrateKg = (Ai * Math.max(0, o.substrate) * 1.6) / 1000
  const waterWeight = water * (o.salt ? 1.025 : 1)
  const glassKg = (glassCm3 * 2.5) / 1000
  return { gross: (A * d.h) / 1000, inner: (Ai * inn.h) / 1000, water, surface: Ai, waterWeight, substrateKg, glassKg, total: waterWeight + substrateKg + glassKg }
}

export const L_PER_USGAL = 3.785411784
export const L_PER_UKGAL = 4.54609

/** Heater watts ≈ 0.25 W per litre per °C above room temperature (min 25 W). */
export const heaterW = (litres: number, dT: number) => Math.max(25, Math.ceil((litres * 0.25 * Math.max(0, dT)) / 25) * 25)

/** Stocking: ~1 cm of slim adult fish per 1.5 L, or per 30 cm² of surface (whichever is lower). */
export const stockingCm = (litres: number, surfaceCm2: number) => Math.min(litres / 1.5, surfaceCm2 / 30)
