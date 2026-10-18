// Cake pan geometry (all lengths in inches) and recipe scaling between pans.
// Recipe-line parsing/formatting is shared with the recipe scaler.
import { formatScaled, parseLine, scaleIngredient } from './recipe-scaler'

export type Shape = 'round' | 'square' | 'rect' | 'tube' | 'oval' | 'muffin'

export interface Pan {
  shape: Shape
  /** round/tube: outer diameter; square: side; rect/oval: width; muffin: cup top diameter */
  a: number
  /** rect/oval: length; tube: inner (chimney) diameter; muffin: cup bottom diameter */
  b: number
  /** Wall height. */
  h: number
  /** muffin: number of cups */
  n: number
}

export const SHAPE_NAMES: Record<Shape, string> = {
  round: 'Round', square: 'Square', rect: 'Rectangle / loaf', tube: 'Tube / Bundt', oval: 'Oval', muffin: 'Muffin tin',
}

/** Horizontal cross-section area (in²) at mid-depth; this is what batter spreads over. */
export function panArea(p: Pan): number {
  const { a, b } = p
  switch (p.shape) {
    case 'round': return (Math.PI * a * a) / 4
    case 'square': return a * a
    case 'rect': return a * b
    case 'oval': return (Math.PI * a * b) / 4
    case 'tube': return (Math.PI * Math.max(0, a * a - b * b)) / 4
    case 'muffin': {
      const d = (a + b) / 2
      return (Math.max(1, Math.round(p.n)) * Math.PI * d * d) / 4
    }
  }
}

/** Full-to-the-brim volume (in³). Muffin cups are treated as frustums. */
export function panVolume(p: Pan): number {
  if (p.shape === 'muffin') {
    const R = p.a / 2, r = p.b / 2
    return Math.max(1, Math.round(p.n)) * (Math.PI * p.h * (R * R + R * r + r * r)) / 3
  }
  return panArea(p) * p.h
}

export const IN3_ML = 16.387064
export const CUP_ML = 236.5882365

export interface Conversion {
  /** Multiply the recipe by this. */
  factor: number
  areaRatio: number
  volRatio: number
  /** Batter depth in the target pan if the *unscaled* recipe is poured in. */
  depthUnscaled: number
  /** Batter depth in the target pan after scaling. */
  depthScaled: number
  /** Fraction of the target pan's height filled after scaling. */
  fill: number
}

/**
 * mode 'area' keeps the batter depth (best for layer cakes, brownies);
 * mode 'volume' keeps the same fill fraction of the pan (best when pan heights differ, e.g. Bundt).
 * `depth` = batter depth in the original pan (in).
 */
export function convert(from: Pan, to: Pan, depth: number, mode: 'area' | 'volume'): Conversion {
  const A1 = panArea(from), A2 = panArea(to)
  const V1 = panVolume(from), V2 = panVolume(to)
  const areaRatio = A2 / A1
  const volRatio = V2 / V1
  const factor = mode === 'area' ? areaRatio : volRatio
  const batter = depth * A1
  const depthUnscaled = batter / A2
  const depthScaled = (batter * factor) / A2
  return { factor, areaRatio, volRatio, depthUnscaled, depthScaled, fill: depthScaled / to.h }
}

/** Rule-of-thumb baking time for a new batter depth: t ∝ depth^1.3 (heat must reach the centre). */
export function bakeTime(minutes: number, d1: number, d2: number): number {
  return minutes * Math.pow(Math.max(0.05, d2) / Math.max(0.05, d1), 1.3)
}

/** Scale a whole recipe; non-quantity lines pass through. Eggs get rounded with a hint. */
export function scaleRecipe(text: string, factor: number): { line: string; note?: string }[] {
  return text.split('\n').map((raw) => {
    if (!raw.trim()) return { line: '' }
    const ing = parseLine(raw)
    if (ing.qty === null) return { line: raw.trim() }
    const sc = scaleIngredient(ing, factor, 'tidy')
    if (!ing.unit && /\begg/i.test(ing.text) && sc.qty !== null) {
      const whole = Math.floor(sc.qty + 1e-9)
      const frac = sc.qty - whole
      const note = frac > 0.15 && frac < 0.85 ? `≈ ${whole} + beat 1 egg and use ${Math.round(frac * 50)} g (whole egg ≈ 50 g)` : undefined
      return { line: formatScaled({ ...sc, qty: frac >= 0.85 ? whole + 1 : frac <= 0.15 ? Math.max(1, whole) : sc.qty }), note }
    }
    return { line: formatScaled(sc) }
  })
}
