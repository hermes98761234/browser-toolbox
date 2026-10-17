// Tilt maths for the spirit level, from W3C DeviceOrientation beta/gamma (degrees).
const RAD = Math.PI / 180

/** World "up" expressed in device coordinates (x right, y top of screen, z out of screen). */
export function upVector(beta: number, gamma: number): [number, number, number] {
  const b = beta * RAD, g = gamma * RAD
  return [-Math.cos(b) * Math.sin(g), Math.sin(b), Math.cos(b) * Math.cos(g)]
}

/**
 * Phone lying on a surface: tilt about each screen axis in degrees.
 * x > 0 means the right side is higher, y > 0 means the top is higher (the bubble drifts to the high side).
 */
export function surfaceAngles(beta: number, gamma: number) {
  const [x, y, z] = upVector(beta, gamma)
  return { x: Math.atan2(x, Math.abs(z)) / RAD, y: Math.atan2(y, Math.abs(z)) / RAD, total: Math.acos(Math.min(1, Math.abs(z))) / RAD, faceDown: z < 0 }
}

/** Phone standing on an edge: rotation in the screen plane away from the nearest 90° step, −45..45. */
export function edgeAngle(beta: number, gamma: number) {
  const [x, y] = upVector(beta, gamma)
  const a = Math.atan2(y, x) / RAD // 90 = upright portrait
  return ((((a - 90) % 90) + 135) % 90) - 45
}

/** Two-reading calibration: measure, rotate the phone 180° on the same spot, measure again. */
export const twoPointOffset = (r1: number, r2: number) => (r1 + r2) / 2

export type Unit = 'deg' | 'pct' | 'mmm' | 'inft' | 'ratio'
export const UNITS: [Unit, string][] = [['deg', 'Degrees'], ['pct', 'Percent grade'], ['mmm', 'mm per metre'], ['inft', 'Inches per foot'], ['ratio', 'Ratio 1:x']]

export function formatTilt(deg: number, unit: Unit): string {
  const t = Math.tan(Math.abs(deg) * RAD)
  const sign = deg < 0 ? '−' : ''
  switch (unit) {
    case 'deg': return `${sign}${Math.abs(deg).toFixed(1)}°`
    case 'pct': return `${sign}${(t * 100).toFixed(1)}%`
    case 'mmm': return `${sign}${(t * 1000).toFixed(0)} mm/m`
    case 'inft': return `${sign}${(t * 12).toFixed(2)}″/ft`
    case 'ratio': return t < 1e-4 ? 'level' : `1:${(1 / t).toFixed(t > 0.1 ? 1 : 0)}`
  }
}

/** Exponential smoothing step for noisy sensor values. */
export const smooth = (prev: number, next: number, k: number) => prev + (next - prev) * k
