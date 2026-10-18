// Surface Finish Converter logic. Exact: µm ⇄ µin and ISO 1302 N-grades / GOST 2789 classes (defined by Ra).
// Approximate: Rq/Ra from the profile shape, Rz ≈ k·Ra and Rt ≈ 1.2·Rz (empirical; real ratios vary by process).

export const UM_PER_UIN = 0.0254

/** ISO 1302 roughness grade numbers N1–N12 (Ra in µm). */
export const N_GRADES: [string, number][] = [
  ['N1', 0.025], ['N2', 0.05], ['N3', 0.1], ['N4', 0.2], ['N5', 0.4], ['N6', 0.8], ['N7', 1.6], ['N8', 3.2], ['N9', 6.3], ['N10', 12.5], ['N11', 25], ['N12', 50],
]
/** GOST 2789-73 roughness classes 1–14: upper Ra limit (µm). */
export const GOST: [number, number][] = [[1, 80], [2, 40], [3, 20], [4, 10], [5, 5], [6, 2.5], [7, 1.25], [8, 0.63], [9, 0.32], [10, 0.16], [11, 0.08], [12, 0.04], [13, 0.02], [14, 0.01]]

export type Profile = 'sine' | 'gauss' | 'triangle'
/** Rq/Ra ratios: sinusoid π/(2√2), Gaussian heights √(π/2), triangular (saw-tooth) 2/√3. */
export const RQ_RA: Record<Profile, number> = { sine: Math.PI / (2 * Math.SQRT2), gauss: Math.sqrt(Math.PI / 2), triangle: 2 / Math.sqrt(3) }

export type Param = 'ra' | 'rq' | 'rz' | 'rt'
export type Unit = 'um' | 'uin'
export interface Model { profile: Profile; rzRatio: number; rtRatio: number }

/** Converts a parameter value in a unit to Ra in µm under the model. */
export function toRa(value: number, p: Param, u: Unit, m: Model): number {
  const um = u === 'uin' ? value * UM_PER_UIN : value
  if (p === 'ra') return um
  if (p === 'rq') return um / RQ_RA[m.profile]
  if (p === 'rz') return um / m.rzRatio
  return um / (m.rzRatio * m.rtRatio)
}

export function fromRa(ra: number, p: Param, u: Unit, m: Model): number {
  const um = p === 'ra' ? ra : p === 'rq' ? ra * RQ_RA[m.profile] : p === 'rz' ? ra * m.rzRatio : ra * m.rzRatio * m.rtRatio
  return u === 'uin' ? um / UM_PER_UIN : um
}

/** Smallest (finest-allowed) N grade whose Ra limit is ≥ the value, i.e. the grade the surface satisfies. */
export function nGrade(ra: number): { grade: string; limit: number } | null {
  const g = N_GRADES.find(([, v]) => v >= ra * (1 - 1e-9))
  return g ? { grade: g[0], limit: g[1] } : null
}
export function gostClass(ra: number): number | null {
  let cls: number | null = null
  for (const [c, lim] of GOST) if (ra <= lim * (1 + 1e-9)) cls = c
  return cls
}

/** Typical Ra ranges (µm) by process: [name, common lo, common hi, rare lo, rare hi]. Ballpark chart values. */
export const PROCESSES: [string, number, number, number, number][] = [
  ['Flame cutting', 12.5, 25, 6.3, 50], ['Sawing', 3.2, 25, 1.6, 50], ['Sand casting', 12.5, 25, 6.3, 50], ['Hot rolling', 12.5, 25, 6.3, 50],
  ['Forging', 3.2, 12.5, 1.6, 25], ['FDM 3D printing', 6.3, 25, 3.2, 50], ['Planing / shaping', 1.6, 12.5, 0.8, 25], ['Drilling', 1.6, 6.3, 0.8, 12.5],
  ['Milling', 0.8, 6.3, 0.4, 25], ['EDM', 0.8, 6.3, 0.4, 12.5], ['Turning / boring', 0.4, 6.3, 0.2, 25], ['Laser-sintered (SLS)', 3.2, 12.5, 1.6, 25],
  ['Investment casting', 1.6, 3.2, 0.8, 6.3], ['Extruding', 0.8, 3.2, 0.4, 6.3], ['Cold rolling / drawing', 0.8, 3.2, 0.2, 6.3], ['Die casting', 0.8, 1.6, 0.4, 3.2],
  ['Reaming', 0.8, 3.2, 0.4, 6.3], ['Broaching', 0.8, 3.2, 0.4, 6.3], ['Grinding', 0.1, 1.6, 0.025, 6.3], ['Honing', 0.1, 0.8, 0.025, 1.6],
  ['Electropolishing', 0.1, 0.8, 0.012, 1.6], ['Polishing', 0.1, 0.4, 0.012, 0.8], ['Lapping', 0.05, 0.4, 0.012, 0.8], ['Superfinishing', 0.025, 0.2, 0.012, 0.8],
]

/** Typical required Ra (µm) by application: [use, lo, hi]. */
export const APPLICATIONS: [string, number, number][] = [
  ['Clearance / non-functional surfaces', 6.3, 12.5], ['General machined parts', 3.2, 6.3], ['Mating surfaces, gasket faces', 1.6, 3.2], ['Gear teeth, keyways', 0.8, 1.6],
  ['Static O-ring grooves', 0.8, 1.6], ['Sliding surfaces, bushings', 0.4, 0.8], ['Bearing seats, shafts for lip seals', 0.2, 0.8],
  ['Dynamic O-ring / hydraulic rod', 0.1, 0.4], ['Hydraulic cylinder bore', 0.1, 0.4], ['Gauge blocks, optical-grade', 0.012, 0.05],
]
