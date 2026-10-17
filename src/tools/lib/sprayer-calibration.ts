// Boom sprayer calibration: application rate, nozzle flow, speed, catch test uniformity and tank mix.

/** Application rate in L/ha from nozzle flow (L/min), travel speed (km/h) and nozzle spacing (cm). */
export const rateLha = (lpm: number, kmh: number, spacingCm: number) => (60000 * lpm) / (kmh * spacingCm)
/** Nozzle flow (L/min) needed for a target L/ha. */
export const flowForRate = (lha: number, kmh: number, spacingCm: number) => (lha * kmh * spacingCm) / 60000
/** US: gallons per acre from GPM, MPH and spacing in inches. */
export const gpa = (gpm: number, mph: number, spacingIn: number) => (5940 * gpm) / (mph * spacingIn)
/** Speed (km/h) from a timed run. */
export const speedKmh = (metres: number, seconds: number) => (3.6 * metres) / seconds
/** Flow (L/min) from a catch: millilitres collected over seconds. */
export const catchLpm = (ml: number, seconds: number) => (ml / 1000) * (60 / seconds)
/** Pressure needed to change flow from q0 to q1 (flow ∝ √pressure). */
export const pressureFor = (p0: number, q0: number, q1: number) => p0 * (q1 / q0) ** 2

export interface Uniformity { mean: number; cv: number; flagged: number[]; min: number; max: number }
/** Catch-test summary; nozzles more than `tol` (fraction) away from the mean are flagged. */
export function uniformity(vals: number[], tol = 0.1): Uniformity {
  const v = vals.filter((x) => Number.isFinite(x) && x > 0)
  const mean = v.reduce((a, b) => a + b, 0) / (v.length || 1)
  const sd = Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, v.length - 1))
  return {
    mean,
    cv: mean ? sd / mean : 0,
    flagged: vals.map((x, i) => (Math.abs(x - mean) > tol * mean ? i : -1)).filter((i) => i >= 0),
    min: Math.min(...v),
    max: Math.max(...v),
  }
}

export interface TankPlan { haPerTank: number; tanks: number; fullTanks: number; lastTankL: number; totalWater: number }
export function tankPlan(tankL: number, lha: number, fieldHa: number): TankPlan {
  const haPerTank = tankL / lha
  const totalWater = lha * fieldHa
  const tanks = totalWater / tankL
  const fullTanks = Math.floor(tanks + 1e-9)
  return { haPerTank, tanks, fullTanks, lastTankL: totalWater - fullTanks * tankL, totalWater }
}
