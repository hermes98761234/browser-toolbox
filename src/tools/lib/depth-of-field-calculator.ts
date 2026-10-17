// Thin-lens depth-of-field maths. All lengths in millimetres.

export interface Sensor { name: string; w: number; h: number }

export const SENSORS: Sensor[] = [
  { name: 'Full frame (35 mm)', w: 36, h: 24 },
  { name: 'APS-C (Nikon/Sony/Fuji)', w: 23.5, h: 15.6 },
  { name: 'APS-C (Canon)', w: 22.3, h: 14.9 },
  { name: 'APS-H', w: 28.7, h: 19 },
  { name: 'Micro Four Thirds', w: 17.3, h: 13 },
  { name: '1-inch', w: 13.2, h: 8.8 },
  { name: 'Medium format 44×33', w: 43.8, h: 32.9 },
  { name: 'Medium format 6×6', w: 56, h: 56 },
  { name: 'Super 35 (cine)', w: 24.89, h: 18.66 },
  { name: 'Phone 1/1.3"', w: 9.8, h: 7.4 },
  { name: 'Phone 1/2.55"', w: 5.6, h: 4.2 },
  { name: '4×5 large format', w: 127, h: 102 },
]

export const diagonal = (s: { w: number; h: number }) => Math.hypot(s.w, s.h)
export const FF_DIAG = Math.hypot(36, 24)
export const cropFactor = (s: { w: number; h: number }) => FF_DIAG / diagonal(s)
/** Circle of confusion: sensor diagonal / divisor (1500 classic, 1730 Zeiss). */
export const defaultCoc = (s: { w: number; h: number }, divisor = 1500) => diagonal(s) / divisor

export interface Dof {
  hyperfocal: number
  near: number
  far: number // Infinity when focused at or beyond the hyperfocal distance
  total: number
  front: number
  behind: number
}

/** f focal length, N f-number, c circle of confusion, s focus distance (from the sensor plane ≈ lens). */
export function dof(f: number, N: number, c: number, s: number): Dof {
  const H = (f * f) / (N * c) + f
  const near = (s * (H - f)) / (H + s - 2 * f)
  const far = s >= H ? Infinity : (s * (H - f)) / (H - s)
  return { hyperfocal: H, near, far, total: far - near, front: s - near, behind: far - s }
}

/** Horizontal / vertical / diagonal angle of view in degrees (focused at infinity). */
export function angleOfView(f: number, s: { w: number; h: number }) {
  const a = (d: number) => (2 * Math.atan(d / (2 * f)) * 180) / Math.PI
  return { h: a(s.w), v: a(s.h), d: a(diagonal(s)) }
}

/** Full-stop and third-stop f-numbers. */
export const STOPS = [1, 1.1, 1.2, 1.4, 1.6, 1.8, 2, 2.2, 2.5, 2.8, 3.2, 3.5, 4, 4.5, 5, 5.6, 6.3, 7.1, 8, 9, 10, 11, 13, 14, 16, 18, 20, 22, 25, 29, 32, 45, 64]
