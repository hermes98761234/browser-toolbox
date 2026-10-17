// Aquarium water chemistry: safe ranges, free-ammonia fraction and nitrogen-cycle stage detection.

export type Param = 'nh3' | 'no2' | 'no3' | 'ph' | 'temp'
export interface Test { id: string; date: string; nh3?: number; no2?: number; no3?: number; ph?: number; temp?: number; change?: number; note?: string }
export type Kind = 'fresh' | 'planted' | 'reef'

/** [ideal min, ideal max, danger min, danger max] */
export const RANGES: Record<Kind, Record<Param, [number, number, number, number]>> = {
  fresh: { nh3: [0, 0.25, 0, 1], no2: [0, 0.25, 0, 1], no3: [0, 40, 0, 80], ph: [6.5, 7.8, 6, 8.5], temp: [24, 27, 20, 30] },
  planted: { nh3: [0, 0.25, 0, 1], no2: [0, 0.25, 0, 1], no3: [5, 30, 0, 60], ph: [6.2, 7.2, 5.6, 8], temp: [22, 26, 18, 30] },
  reef: { nh3: [0, 0.05, 0, 0.25], no2: [0, 0.1, 0, 0.5], no3: [1, 10, 0, 25], ph: [8.0, 8.4, 7.8, 8.6], temp: [25, 27, 23, 29] },
}

export function status(kind: Kind, p: Param, v: number | undefined): 'ok' | 'warn' | 'bad' | 'none' {
  if (v === undefined || !Number.isFinite(v)) return 'none'
  const [a, b, c, d] = RANGES[kind][p]
  if (v >= a && v <= b) return 'ok'
  if (v >= c && v <= d) return 'warn'
  return 'bad'
}

/**
 * Fraction of total ammonia nitrogen present as toxic un-ionised NH₃ (Emerson et al. 1975):
 * pKa = 0.09018 + 2729.92 / T(K); f = 1 / (10^(pKa − pH) + 1).
 */
export function freeAmmoniaFraction(ph: number, tempC: number): number {
  const pKa = 0.09018 + 2729.92 / (tempC + 273.15)
  return 1 / (Math.pow(10, pKa - ph) + 1)
}

export interface Cycle { stage: 0 | 1 | 2 | 3 | 4; label: string; progress: number; hint: string }

/**
 * Nitrogen-cycle stage from the most recent tests (sorted by date):
 * 0 no data · 1 ammonia phase · 2 nitrite phase · 3 nearly cycled (NH₃ & NO₂ falling, NO₃ rising) · 4 cycled (NH₃ = NO₂ = 0 with NO₃ > 0 for 3 tests).
 */
export function cycleStage(tests: Test[]): Cycle {
  const t = [...tests].filter((x) => x.nh3 !== undefined || x.no2 !== undefined).sort((a, b) => a.date.localeCompare(b.date))
  if (!t.length) return { stage: 0, label: 'No tests yet', progress: 0, hint: 'Log ammonia, nitrite and nitrate to track the cycle.' }
  const zero = (v?: number) => (v ?? 0) <= 0.05
  const last3 = t.slice(-3)
  if (last3.length === 3 && last3.every((x) => zero(x.nh3) && zero(x.no2) && (x.no3 ?? 0) > 0)) return { stage: 4, label: 'Cycled', progress: 1, hint: 'Ammonia and nitrite stay at 0 with nitrate present. Stock slowly and keep up water changes.' }
  const l = t[t.length - 1]
  const peakNo2 = Math.max(...t.map((x) => x.no2 ?? 0))
  if ((l.no2 ?? 0) < peakNo2 * 0.5 && peakNo2 > 0.25 && (l.no3 ?? 0) > 0) return { stage: 3, label: 'Almost there', progress: 0.8, hint: 'Nitrite is falling and nitrate is building. Keep dosing ammonia until both read 0 within 24 h.' }
  if ((l.no2 ?? 0) > 0.05 || peakNo2 > 0.05) return { stage: 2, label: 'Nitrite phase', progress: 0.55, hint: 'Nitrosomonas are working. Nitrite spikes next; Nitrobacter take a few weeks. Do not add fish yet.' }
  return { stage: 1, label: 'Ammonia phase', progress: 0.25, hint: 'Ammonia-oxidising bacteria are establishing. Keep ammonia around 2 ppm for a fishless cycle.' }
}
