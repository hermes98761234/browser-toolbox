// Round grain bin volume: cylinder + peaked / inverted cone surface + optional hopper bottom,
// converted to bushels (US bushel = 2150.42 in³) and weight via crop test weights.
import { atMoisture, CROPS, LB_PER_KG } from './grain-moisture-shrink-calculator'

export { CROPS, LB_PER_KG, atMoisture }

export const FT3_PER_BU = 2150.42 / 1728 // 1.244456
export const M3_PER_FT3 = 0.0283168466
export const FT_PER_M = 3.28084

/** Typical angle of repose (°) for a peaked surface — approximate, varies with moisture and fines. */
export const REPOSE: Record<string, number> = { corn: 23, soy: 25, wheat: 25, sorghum: 27, barley: 28, oats: 32, sunflower: 30, canola: 22 }

export type Surface = 'level' | 'peaked' | 'inverted'
export interface Bin { diameter: number; wallHeight: number; roofPitch: number; hopper: boolean; hopperAngle: number }

export const cone = (r: number, angleDeg: number) => (Math.PI * r ** 3 * Math.tan((angleDeg * Math.PI) / 180)) / 3
export const coneHeight = (r: number, angleDeg: number) => r * Math.tan((angleDeg * Math.PI) / 180)

/**
 * Grain volume (same length unit cubed) for grain reaching `h` up the sidewall.
 * peaked: adds a cone at the repose angle (capped by the roof pitch); inverted: subtracts one.
 */
export function grainVolume(b: Bin, h: number, surface: Surface, repose: number): { total: number; cyl: number; cone: number; hopper: number; peakH: number } {
  const r = b.diameter / 2
  const hw = Math.max(0, Math.min(h, b.wallHeight))
  const hop = b.hopper ? cone(r, b.hopperAngle) : 0
  const cyl = Math.PI * r * r * hw
  const ang = surface === 'peaked' ? Math.min(repose, b.roofPitch) : repose
  let c = 0
  let peakH = 0
  if (surface === 'peaked') {
    c = cone(r, ang)
    peakH = coneHeight(r, ang)
  } else if (surface === 'inverted') {
    // a draw-down cone can't go deeper than the grain at the wall
    const depth = Math.min(coneHeight(r, ang), hw)
    const rr = depth / Math.tan((ang * Math.PI) / 180)
    c = -(Math.PI * rr * rr * depth) / 3
    peakH = -depth
  }
  return { total: cyl + c + hop, cyl, cone: c, hopper: hop, peakH }
}

/** Full capacity: level to the eave plus a peak up to the roof (repose capped by roof pitch). */
export const capacity = (b: Bin, repose: number) => grainVolume(b, b.wallHeight, 'peaked', repose).total

export interface Weight { bu: number; lb: number; marketBu: number; dryBu: number }
/**
 * volumeFt3 → volume bushels (with packing %), weight from the actual test weight, and market bushels
 * at the crop's standard weight; dryBu shrinks water from `moisture` to the crop's base moisture.
 */
export function bushels(volumeFt3: number, pack: number, testWeight: number, stdWeight: number, moisture: number, base: number): Weight {
  const bu = (volumeFt3 / FT3_PER_BU) * (1 + pack / 100)
  const lb = bu * testWeight
  const marketBu = lb / stdWeight
  const dryLb = moisture > base ? atMoisture(lb, moisture, base) : lb
  return { bu, lb, marketBu, dryBu: dryLb / stdWeight }
}

/** Common bin sizes (diameter ft, eave height ft). */
export const PRESETS: [string, number, number][] = [
  ['18 ft × 16 ft', 18, 16], ['24 ft × 20 ft', 24, 20], ['30 ft × 24 ft', 30, 24], ['36 ft × 28 ft', 36, 28], ['42 ft × 32 ft', 42, 32], ['48 ft × 36 ft', 48, 36], ['60 ft × 40 ft', 60, 40],
]
