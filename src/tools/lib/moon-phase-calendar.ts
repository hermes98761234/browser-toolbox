// Moon phase calendar: principal phase instants (bisection on the Sun–Moon elongation from the
// night-sky planner's Meeus lunar theory), per-day illumination, moon/sun rise and set, SVG moon shape
// and time-zone helpers.
import { crossings, moonEcl, moonHz, moonPhase } from './night-sky-planner'
import { sunPosition } from './sunrise-sunset-planner'

// Shared with the night-sky planner (single implementation of the phase angle).
export { moonPhase, sunLonOfDate } from './night-sky-planner'

export const SYNODIC = 29.530588853
const H = 3600000
const DAY = 86400000
const wrap180 = (x: number) => ((((x + 180) % 360) + 360) % 360) - 180

export const PHASE_NAMES = ['New Moon', 'First Quarter', 'Full Moon', 'Last Quarter'] as const
export interface PhaseEvent { t: number; q: 0 | 1 | 2 | 3 }

/** All principal phases between t0 and t1 (UTC ms), accurate to a few minutes. */
export function phaseEvents(t0: number, t1: number): PhaseEvent[] {
  const out: PhaseEvent[] = []
  const step = 6 * H
  for (let q = 0 as 0 | 1 | 2 | 3; q < 4; q = (q + 1) as 0 | 1 | 2 | 3) {
    const f = (t: number) => wrap180(moonPhase(t).ang - q * 90)
    let pt = t0 - step, pv = f(pt)
    for (let t = t0; t <= t1 + step; t += step) {
      const v = f(t)
      if (pv < 0 && v >= 0 && v - pv < 90) {
        let a = pt, b = t
        for (let i = 0; i < 32; i++) {
          const m = (a + b) / 2
          if (f(m) < 0) a = m
          else b = m
        }
        const te = (a + b) / 2
        if (te >= t0 && te < t1) out.push({ t: te, q })
      }
      pt = t
      pv = v
    }
  }
  return out.sort((a, b) => a.t - b.t)
}

/** Offset of a time zone from UTC in minutes at instant ms (DST aware via Intl). */
export function tzOffset(ms: number, tz: string): number {
  try {
    const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(ms))
    const g = (k: string) => Number(p.find((x) => x.type === k)?.value)
    const local = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour') % 24, g('minute'), g('second'))
    return Math.round((local - Math.floor(ms / 1000) * 1000) / 60000)
  } catch {
    return 0
  }
}

/** UTC ms of local midnight that starts Y-M-D in tz. */
export function localMidnight(y: number, m: number, d: number, tz: string): number {
  let t = Date.UTC(y, m, d)
  for (let i = 0; i < 3; i++) t = Date.UTC(y, m, d) - tzOffset(t, tz) * 60000
  return t
}

export interface MoonDay {
  frac: number
  ang: number
  age: number
  waxing: boolean
  name: string
  distKm: number
  rise: number | null
  set: number | null
  sunrise: number | null
  sunset: number | null
  /** Astronomical darkness with the Moon below the horizon during the night starting this evening (h). */
  darkNoMoon: number
}

/** Data for the local day [start, start + 24 h); illumination is taken at local noon. */
export function moonDay(start: number, lat: number, lon: number, withDark = true): MoonDay {
  const noon = start + 12 * H
  const ph = moonPhase(noon)
  const alt = (t: number) => moonHz(t, lat, lon).alt
  const mc = crossings(alt, -0.27, start, start + DAY, 900000)
  const sun = (t: number) => sunPosition(t, lat, lon).elevation
  const sc = crossings(sun, -0.833, start, start + DAY, 900000)
  let dark = 0
  if (withDark) {
    const step = 15 * 60000
    for (let t = noon; t < noon + DAY; t += step) if (sun(t) < -18 && alt(t) < 0) dark += step
  }
  return {
    frac: ph.frac,
    ang: ph.ang,
    age: (ph.ang / 360) * SYNODIC,
    waxing: ph.ang < 180,
    name: ph.name,
    distKm: moonEcl(noon).dist,
    rise: mc.find((c) => c.rising)?.t ?? null,
    set: mc.find((c) => !c.rising)?.t ?? null,
    sunrise: sc.find((c) => c.rising)?.t ?? null,
    sunset: sc.find((c) => !c.rising)?.t ?? null,
    darkNoMoon: dark / H,
  }
}

/**
 * SVG path of the lit part of a moon disc (radius r at cx, cy) for elongation `ang` (0 new … 180 full).
 * Northern-hemisphere view: waxing lit on the right. `south` mirrors it.
 */
export function litPath(ang: number, r: number, cx: number, cy: number, south = false): string {
  const a = ((ang % 360) + 360) % 360
  const waxing = a < 180
  const rx = Math.abs(Math.cos((a * Math.PI) / 180)) * r
  const gibbous = a > 90 && a < 270
  let rightLimb = waxing
  if (south) rightLimb = !rightLimb
  const top = `${cx},${cy - r}`, bot = `${cx},${cy + r}`
  // limb half: clockwise from top to bottom along the right side (or the left side)
  const limb = rightLimb ? `M${top} A${r},${r} 0 0 1 ${bot}` : `M${top} A${r},${r} 0 0 0 ${bot}`
  // terminator back to top: bulges away from the limb for gibbous, towards it for crescent
  const sweep = rightLimb ? (gibbous ? 1 : 0) : gibbous ? 0 : 1
  return `${limb} A${rx.toFixed(3)},${r} 0 0 ${sweep} ${top} Z`
}

const FULL_NAMES = ['Wolf Moon', 'Snow Moon', 'Worm Moon', 'Pink Moon', 'Flower Moon', 'Strawberry Moon', 'Buck Moon', 'Sturgeon Moon', 'Corn Moon', "Hunter's Moon", 'Beaver Moon', 'Cold Moon']
/** Traditional (North American folklore) name for a full moon in the given month (0-11). */
export const fullMoonName = (month: number) => FULL_NAMES[month]

/** Perigee-ish full moons are popularly called supermoons (closer than ~360 000 km). */
export const isSuper = (distKm: number) => distKm < 360000
