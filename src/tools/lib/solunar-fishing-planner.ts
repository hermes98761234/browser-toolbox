// Solunar planner: major periods around the Moon's upper/lower transit, minor periods around
// moonrise/moonset, plus a day rating from moon phase and sunrise/sunset overlap. Solunar theory is
// folklore-based (John Alden Knight, 1926) and not scientifically proven; the astronomy is real.
import { crossings, lst, moonEq, moonHz, moonPhase } from './night-sky-planner'
import { crossing, sunPosition } from './sunrise-sunset-planner'

const H = 3600000
const wrap180 = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180

export interface Period {
  kind: 'major' | 'minor'
  label: string
  center: number
  start: number
  end: number
}

export interface SolunarDay {
  t0: number
  t1: number
  sunrise: number | null
  sunset: number | null
  moonrise: number | null
  moonset: number | null
  upper: number | null
  lower: number | null
  periods: Period[]
  phase: { frac: number; ang: number; name: string }
  phaseScore: number
  overlap: number
  score: number
  rating: 'Poor' | 'Fair' | 'Good' | 'Very good' | 'Excellent'
}

/** Local-day window [t0, t1) in UTC ms for an ISO date and a UTC offset in hours. */
export function dayWindow(date: string, tz: number): [number, number] {
  const t0 = Date.parse(date + 'T00:00:00Z') - tz * H
  return [t0, t0 + 24 * H]
}

/** Moon hour angle (deg, −180..180); 0 = upper transit (overhead), ±180 = lower transit (underfoot). */
export const moonHourAngle = (ms: number, lon: number) => wrap180(lst(ms, lon) - moonEq(ms).ra)

function sunEvent(t0: number, t1: number, lat: number, lon: number, rising: boolean): number | null {
  for (const d of [0, -1, 1]) {
    const t = crossing(t0 + 12 * H + d * 24 * H, lat, lon, -0.833, rising)
    if (t !== null && t >= t0 && t < t1) return t
  }
  return null
}

/** 0 at quarter moons, 1 at new and full moon. */
export const phaseScore = (ang: number) => Math.pow(Math.abs(Math.cos((ang * Math.PI) / 180)), 1.5)

export function solunarDay(date: string, lat: number, lon: number, tz: number, majorH = 2, minorH = 1): SolunarDay {
  const [t0, t1] = dayWindow(date, tz)
  const step = 10 * 60000
  const sinH = (t: number) => Math.sin((moonHourAngle(t, lon) * Math.PI) / 180)
  const tr = crossings(sinH, 0, t0, t1, step)
  const upper = tr.find((c) => c.rising)?.t ?? null
  const lower = tr.find((c) => !c.rising)?.t ?? null
  const rs = crossings((t) => moonHz(t, lat, lon).alt, -0.27, t0, t1, step)
  const moonrise = rs.find((c) => c.rising)?.t ?? null
  const moonset = rs.find((c) => !c.rising)?.t ?? null
  const sunrise = sunEvent(t0, t1, lat, lon, true)
  const sunset = sunEvent(t0, t1, lat, lon, false)
  const periods: Period[] = []
  const add = (kind: Period['kind'], label: string, c: number | null) => {
    if (c === null) return
    const half = ((kind === 'major' ? majorH : minorH) * H) / 2
    periods.push({ kind, label, center: c, start: c - half, end: c + half })
  }
  add('major', 'Moon overhead', upper)
  add('major', 'Moon underfoot', lower)
  add('minor', 'Moonrise', moonrise)
  add('minor', 'Moonset', moonset)
  periods.sort((a, b) => a.center - b.center)
  const phase = moonPhase(t0 + 12 * H)
  const ps = phaseScore(phase.ang)
  // periods that overlap sunrise/sunset ±1 h (dawn and dusk feeding windows)
  const twi = [sunrise, sunset].filter((x): x is number => x !== null)
  let overlap = 0
  for (const p of periods) if (twi.some((s) => p.start < s + H && p.end > s - H)) overlap += p.kind === 'major' ? 1 : 0.6
  const score = Math.round(100 * Math.min(1, 0.65 * ps + 0.35 * Math.min(1, overlap / 1.2)))
  const rating = score >= 80 ? 'Excellent' : score >= 60 ? 'Very good' : score >= 40 ? 'Good' : score >= 20 ? 'Fair' : 'Poor'
  return { t0, t1, sunrise, sunset, moonrise, moonset, upper, lower, periods, phase, phaseScore: ps, overlap, score, rating }
}

/** Sun and moon altitude samples across the day for the timeline. */
export function altitudes(t0: number, lat: number, lon: number, n = 97) {
  return Array.from({ length: n }, (_, i) => {
    const t = t0 + (i / (n - 1)) * 24 * H
    return { t, sun: sunPosition(t, lat, lon).elevation, moon: moonHz(t, lat, lon).alt }
  })
}
