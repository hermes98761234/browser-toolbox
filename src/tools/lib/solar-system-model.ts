// Solar system model helpers: planet facts, display scaling (true vs compressed distances),
// orbit sampling from the J2000 Keplerian elements in night-sky-planner, and Earth-season maths.
import { centuries, helio, sunLonOfDate } from './night-sky-planner'

export { centuries, helio, sunLonOfDate }

export const AU_KM = 149597870.7
export const OBLIQUITY = 23.44
const RAD = Math.PI / 180

export interface Planet { name: string; a: number; periodD: number; radiusKm: number; color: string; tilt: number; dayH: number; moons: number }
// Semi-major axis (AU), sidereal period (days), mean radius (km), axial tilt (°), sidereal day (h), known moons (approx.)
export const PLANETS: Planet[] = [
  { name: 'Mercury', a: 0.387, periodD: 87.97, radiusKm: 2440, color: '#a8a29e', tilt: 0.03, dayH: 1407.6, moons: 0 },
  { name: 'Venus', a: 0.723, periodD: 224.7, radiusKm: 6052, color: '#fcd34d', tilt: 177.4, dayH: -5832.5, moons: 0 },
  { name: 'Earth', a: 1.0, periodD: 365.256, radiusKm: 6371, color: '#3b82f6', tilt: 23.44, dayH: 23.93, moons: 1 },
  { name: 'Mars', a: 1.524, periodD: 686.98, radiusKm: 3390, color: '#ef4444', tilt: 25.19, dayH: 24.62, moons: 2 },
  { name: 'Jupiter', a: 5.203, periodD: 4332.6, radiusKm: 69911, color: '#fdba74', tilt: 3.13, dayH: 9.93, moons: 95 },
  { name: 'Saturn', a: 9.537, periodD: 10759, radiusKm: 58232, color: '#fde68a', tilt: 26.73, dayH: 10.66, moons: 146 },
  { name: 'Uranus', a: 19.19, periodD: 30687, radiusKm: 25362, color: '#67e8f9', tilt: 97.77, dayH: -17.24, moons: 28 },
  { name: 'Neptune', a: 30.07, periodD: 60190, radiusKm: 24622, color: '#818cf8', tilt: 28.32, dayH: 16.11, moons: 16 },
]
export const SUN_RADIUS_KM = 695700

export type Scale = 'true' | 'visible'
/** Scene units per AU in true-scale mode. */
export const UNITS_PER_AU = 10

/** Radial distance (AU) → scene units. Visible mode compresses with √r so Neptune stays on screen. */
export const radial = (rAu: number, mode: Scale) => (mode === 'true' ? rAu * UNITS_PER_AU : 10 * Math.sqrt(rAu))

/** Heliocentric ecliptic position (AU) → scene units, keeping the direction. */
export function scalePos(p: [number, number, number], mode: Scale): [number, number, number] {
  const r = Math.hypot(...p) || 1
  const k = radial(r, mode) / r
  return [p[0] * k, p[1] * k, p[2] * k]
}

/** Display radius in scene units. True mode: real size × multiplier. Visible mode: log-compressed. */
export function bodyRadius(radiusKm: number, mode: Scale, mult: number): number {
  if (mode === 'true') return (radiusKm / AU_KM) * UNITS_PER_AU * mult
  return 0.22 + 0.42 * Math.log10(radiusKm / 1000)
}

/** Points along one orbit (heliocentric AU), sampled evenly in time around `ms`. */
export function orbitPoints(name: string, ms: number, n = 240): [number, number, number][] {
  const p = PLANETS.find((x) => x.name === name)!
  return Array.from({ length: n + 1 }, (_, i) => helio(name, centuries(ms + ((i / n) - 0.5) * p.periodD * 86400000)))
}

export const distAu = (p: [number, number, number]) => Math.hypot(...p)

/** Sun's declination (°) from its ecliptic longitude of date. */
export const sunDec = (ms: number) => Math.asin(Math.sin(OBLIQUITY * RAD) * Math.sin(sunLonOfDate(ms) * RAD)) / RAD

/** Hours of daylight at latitude (°) for solar declination (°), geometric (no refraction). */
export function dayLength(lat: number, dec: number): number {
  const x = -Math.tan(lat * RAD) * Math.tan(dec * RAD)
  if (x <= -1) return 24
  if (x >= 1) return 0
  return (2 * Math.acos(x)) / RAD / 15
}

/** Noon Sun altitude (°) at latitude for declination. */
export const noonAltitude = (lat: number, dec: number) => 90 - Math.abs(lat - dec)

export function season(ms: number, lat: number): string {
  const q = Math.floor(sunLonOfDate(ms) / 90) // 0: Mar equinox→Jun solstice …
  const north = ['Spring', 'Summer', 'Autumn', 'Winter'][q]
  const south = ['Autumn', 'Winter', 'Spring', 'Summer'][q]
  return Math.abs(lat) < 10 ? `Tropics (${lat >= 0 ? north : south} by the calendar)` : lat >= 0 ? north : south
}

const EVENTS = ['March equinox', 'June solstice', 'September equinox', 'December solstice']
/** Next equinox/solstice after ms (bisection on the Sun's longitude of date). */
export function nextEvent(ms: number): { name: string; t: number } {
  const lon0 = sunLonOfDate(ms)
  const k = (Math.floor(lon0 / 90) + 1) % 4
  const target = k * 90
  const ahead = (t: number) => ((sunLonOfDate(t) - target + 540) % 360) - 180 // <0 before, >0 after
  let lo = ms, hi = ms + 100 * 86400000
  while (ahead(hi) < 0) hi += 30 * 86400000
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2
    if (ahead(mid) < 0) lo = mid
    else hi = mid
  }
  return { name: EVENTS[k], t: hi }
}

/** Light travel time in minutes for a distance in AU. */
export const lightMinutes = (au: number) => (au * AU_KM) / 299792.458 / 60
