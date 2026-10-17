// EV charging: power curve vs state of charge, time integration, grid energy with losses and costs.

export interface Session {
  /** usable battery capacity, kWh */
  battery: number
  /** start / target state of charge, % */
  from: number
  to: number
  /** charger rating, kW */
  charger: number
  kind: 'ac' | 'dc'
  /** car limits, kW */
  onboardAc: number
  dcPeak: number
  /** charging losses between grid and battery, % */
  loss: number
}

/** Typical DC fast-charge taper as a fraction of the car's peak power at a given SoC (%). */
export function dcTaper(soc: number): number {
  const pts: [number, number][] = [[0, 0.75], [10, 1], [50, 1], [60, 0.85], [70, 0.62], [80, 0.42], [90, 0.22], [100, 0.08]]
  for (let i = 1; i < pts.length; i++) {
    if (soc <= pts[i][0]) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]
      return y0 + ((soc - x0) / (x1 - x0)) * (y1 - y0)
    }
  }
  return pts[pts.length - 1][1]
}

/** AC charging is flat until the battery management system tapers the last few percent. */
export const acTaper = (soc: number) => (soc < 92 ? 1 : Math.max(0.3, 1 - ((soc - 92) / 8) * 0.7))

/** Power delivered from the grid (kW) at a given SoC. */
export function powerAt(s: Session, soc: number): number {
  if (s.kind === 'ac') return Math.min(s.charger, s.onboardAc) * acTaper(soc)
  return Math.min(s.charger, s.dcPeak * dcTaper(soc))
}

export interface Result {
  minutes: number
  /** energy stored in the battery, kWh */
  battery: number
  /** energy drawn from the grid, kWh */
  grid: number
  avgKw: number
  /** [SoC %, grid kW] */
  curve: [number, number][]
  /** [minutes, SoC %] */
  timeline: [number, number][]
}

export function simulate(s: Session, step = 0.25): Result {
  const from = Math.max(0, Math.min(100, s.from)), to = Math.max(from, Math.min(100, s.to))
  const eff = 1 - Math.max(0, Math.min(60, s.loss)) / 100
  let t = 0, grid = 0
  const curve: [number, number][] = []
  const timeline: [number, number][] = [[0, from]]
  for (let soc = from; soc < to - 1e-9; soc += step) {
    const d = Math.min(step, to - soc)
    const p = powerAt(s, soc + d / 2)
    if (!(p > 0)) return { minutes: Infinity, battery: 0, grid: 0, avgKw: 0, curve, timeline }
    const eb = (s.battery * d) / 100
    const hours = eb / (p * eff)
    t += hours * 60
    grid += eb / eff
    curve.push([soc, p])
    timeline.push([t, soc + d])
  }
  const battery = (s.battery * (to - from)) / 100
  return { minutes: t, battery, grid, avgKw: t > 0 ? grid / (t / 60) : 0, curve, timeline }
}

/** kWh per 100 km ↔ miles per kWh. */
export const kwh100kmToMiPerKwh = (k: number) => 100 / (k * 1.609344)
export const miPerKwhToKwh100km = (m: number) => 100 / (m * 1.609344)

export function fmtDuration(min: number): string {
  if (!Number.isFinite(min)) return '—'
  const h = Math.floor(min / 60), m = Math.round(min % 60)
  return h ? `${h} h ${String(m === 60 ? 0 : m).padStart(2, '0')} min` : `${m} min`
}
