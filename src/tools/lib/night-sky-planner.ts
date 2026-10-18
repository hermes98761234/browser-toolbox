// Low-precision astronomy for the night sky planner: time scales, Sun/Moon/planets (JPL approximate
// Keplerian elements, valid 1800–2050, ~arcminutes), horizontal coordinates, rise/set and night events.
import { LINES, STARS, STAR_NAMES } from './night-sky-planner-data'

const RAD = Math.PI / 180
const EPS = 23.43928 * RAD
const norm360 = (x: number) => ((x % 360) + 360) % 360

export const jd = (ms: number) => ms / 86400000 + 2440587.5
export const centuries = (ms: number) => (jd(ms) - 2451545) / 36525

/** Greenwich mean sidereal time in degrees. */
export function gmst(ms: number) {
  const d = jd(ms) - 2451545, T = d / 36525
  return norm360(280.46061837 + 360.98564736629 * d + 0.000387933 * T * T)
}
export const lst = (ms: number, lonDeg: number) => norm360(gmst(ms) + lonDeg)

export interface Eq { ra: number; dec: number } // degrees
export interface Hz { alt: number; az: number } // degrees, az from North through East

export function eclToEq(lon: number, lat: number): Eq {
  const l = lon * RAD, b = lat * RAD
  const x = Math.cos(b) * Math.cos(l), y = Math.cos(b) * Math.sin(l), z = Math.sin(b)
  return vecToEq(x, Math.cos(EPS) * y - Math.sin(EPS) * z, Math.sin(EPS) * y + Math.cos(EPS) * z)
}
export function vecToEq(x: number, y: number, z: number): Eq {
  return { ra: norm360(Math.atan2(y, x) / RAD), dec: Math.atan2(z, Math.hypot(x, y)) / RAD }
}

export function toHorizontal(e: Eq, ms: number, lat: number, lon: number): Hz {
  const H = (lst(ms, lon) - e.ra) * RAD, d = e.dec * RAD, p = lat * RAD
  const alt = Math.asin(Math.sin(p) * Math.sin(d) + Math.cos(p) * Math.cos(d) * Math.cos(H))
  const az = Math.atan2(-Math.cos(d) * Math.sin(H), Math.cos(p) * Math.sin(d) - Math.sin(p) * Math.cos(d) * Math.cos(H))
  return { alt: alt / RAD, az: norm360(az / RAD) }
}

/** Standard refraction (Bennett) in degrees for an apparent-ish altitude. */
export const refraction = (alt: number) => (alt < -1 ? 0 : 1.02 / Math.tan((alt + 10.3 / (alt + 5.11)) * RAD) / 60)

// ---- planets ----
type El = [number, number, number, number, number, number, number, number, number, number, number, number]
// a, e, I, L, varpi, Omega  and their rates per Julian century (Standish, JPL, J2000 ecliptic).
const ELEMENTS: Record<string, El> = {
  Mercury: [0.38709927, 0.20563593, 7.00497902, 252.2503235, 77.45779628, 48.33076593, 0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081],
  Venus: [0.72333566, 0.00677672, 3.39467605, 181.9790995, 131.60246718, 76.67984255, 0.0000039, -0.00004107, -0.0007889, 58517.81538729, 0.00268329, -0.27769418],
  Earth: [1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0, 0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0],
  Mars: [1.52371034, 0.0933941, 1.84969142, -4.55343205, -23.94362959, 49.55953891, 0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343],
  Jupiter: [5.202887, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909, -0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106],
  Saturn: [9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448, -0.0012506, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794],
  Uranus: [19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.9542763, 74.01692503, -0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589],
  Neptune: [30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574, 0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464, -0.00508664],
}
export const PLANETS = ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'] as const
export const PLANET_COLOR: Record<string, string> = { Mercury: '#cbd5e1', Venus: '#fef3c7', Mars: '#f87171', Jupiter: '#fde68a', Saturn: '#facc15', Uranus: '#67e8f9', Neptune: '#818cf8', Moon: '#f1f5f9', Sun: '#fde047' }
// Rough visual magnitudes used only for display sizing.
const PLANET_MAG: Record<string, number> = { Mercury: 0, Venus: -4.2, Mars: 0.5, Jupiter: -2.3, Saturn: 0.7, Uranus: 5.7, Neptune: 7.8 }

/** Heliocentric ecliptic J2000 position in AU. */
export function helio(name: string, T: number): [number, number, number] {
  const k = ELEMENTS[name]
  const a = k[0] + k[6] * T, e = k[1] + k[7] * T, I = (k[2] + k[8] * T) * RAD, L = k[3] + k[9] * T, w = k[4] + k[10] * T, O = k[5] + k[11] * T
  const M = norm360(L - w) * RAD, om = (w - O) * RAD, Om = O * RAD
  let E = M + e * Math.sin(M)
  for (let i = 0; i < 8; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E))
  const xp = a * (Math.cos(E) - e), yp = a * Math.sqrt(1 - e * e) * Math.sin(E)
  const cw = Math.cos(om), sw = Math.sin(om), cO = Math.cos(Om), sO = Math.sin(Om), cI = Math.cos(I), sI = Math.sin(I)
  return [
    (cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp,
    (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp,
    sw * sI * xp + cw * sI * yp,
  ]
}

function geoEq(v: [number, number, number]): Eq & { dist: number } {
  const [x, y, z] = v
  const e = vecToEq(x, Math.cos(EPS) * y - Math.sin(EPS) * z, Math.sin(EPS) * y + Math.cos(EPS) * z)
  return { ...e, dist: Math.hypot(x, y, z) }
}

export function planetEq(name: string, ms: number) {
  const T = centuries(ms)
  const p = helio(name, T), E = helio('Earth', T)
  // one light-time iteration
  const d0 = Math.hypot(p[0] - E[0], p[1] - E[1], p[2] - E[2])
  const p2 = helio(name, T - (d0 * 0.0057755183) / 36525)
  return geoEq([p2[0] - E[0], p2[1] - E[1], p2[2] - E[2]])
}

export function sunEq(ms: number) {
  const E = helio('Earth', centuries(ms))
  return geoEq([-E[0], -E[1], -E[2]])
}

/** Moon (Meeus ch. 47, main terms): ecliptic longitude/latitude (deg) and distance (km). */
export function moonEcl(ms: number) {
  const T = centuries(ms)
  const Lp = 218.3164477 + 481267.88123421 * T
  const D = (297.8501921 + 445267.1114034 * T) * RAD
  const M = (357.5291092 + 35999.0502909 * T) * RAD
  const Mp = (134.9633964 + 477198.8675055 * T) * RAD
  const F = (93.272095 + 483202.0175233 * T) * RAD
  const S = Math.sin, C = Math.cos
  const lon = Lp + 6.288774 * S(Mp) + 1.274027 * S(2 * D - Mp) + 0.658314 * S(2 * D) + 0.213618 * S(2 * Mp) - 0.185116 * S(M) - 0.114332 * S(2 * F) +
    0.058793 * S(2 * D - 2 * Mp) + 0.057066 * S(2 * D - M - Mp) + 0.053322 * S(2 * D + Mp) + 0.045758 * S(2 * D - M) - 0.040923 * S(M - Mp) - 0.03472 * S(D) - 0.030383 * S(M + Mp)
  const lat = 5.128122 * S(F) + 0.280602 * S(Mp + F) + 0.277693 * S(Mp - F) + 0.173237 * S(2 * D - F) + 0.055413 * S(2 * D - Mp + F) + 0.046271 * S(2 * D - Mp - F) + 0.032573 * S(2 * D + F)
  const dist = 385000.56 - 20905.355 * C(Mp) - 3699.111 * C(2 * D - Mp) - 2955.968 * C(2 * D) - 569.925 * C(2 * Mp)
  return { lon: norm360(lon), lat, dist }
}
export function moonEq(ms: number) {
  const m = moonEcl(ms)
  return { ...eclToEq(m.lon, m.lat), dist: m.dist }
}

const DELTA_T = 69000 // TT − UTC (≈ 69 s in the 2020s)

/** Apparent geometric solar longitude of date incl. aberration (Meeus ch. 25, low accuracy), degrees. */
export function sunLonOfDate(ms: number): number {
  const T = centuries(ms + DELTA_T)
  const L0 = 280.46646 + T * (36000.76983 + 0.0003032 * T)
  const M = (357.52911 + T * (35999.05029 - 0.0001537 * T)) * RAD
  const C = (1.914602 - T * (0.004817 + 0.000014 * T)) * Math.sin(M) + (0.019993 - 0.000101 * T) * Math.sin(2 * M) + 0.000289 * Math.sin(3 * M)
  return norm360(L0 + C - 0.00569)
}

const PHASE8 = ['New Moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous', 'Full Moon', 'Waning gibbous', 'Last quarter', 'Waning crescent']
/**
 * Moon phase: Moon − Sun ecliptic longitude of date (0 new, 90 first quarter, 180 full), illuminated
 * fraction 0..1 and a name. Both longitudes are in the same frame (mean equinox of date, TT); mixing the
 * J2000 heliocentric Earth vector with the of-date lunar longitude shifted phase instants by ~45 min.
 */
export function moonPhase(ms: number) {
  const ang = norm360(moonEcl(ms + DELTA_T).lon - sunLonOfDate(ms))
  return { ang, frac: (1 - Math.cos(ang * RAD)) / 2, name: PHASE8[Math.round(ang / 45) % 8] }
}

/** Topocentric altitude of the Moon (parallax up to ~1°) + refraction. */
export function moonHz(ms: number, lat: number, lon: number): Hz {
  const m = moonEq(ms)
  const h = toHorizontal(m, ms, lat, lon)
  const alt = h.alt - (Math.asin(6378.14 / m.dist) / RAD) * Math.cos(h.alt * RAD)
  return { alt: alt + refraction(alt), az: h.az }
}

export interface Body { name: string; eq: Eq; mag: number; color: string }
export function bodies(ms: number): Body[] {
  return [
    ...PLANETS.map((n) => ({ name: n, eq: planetEq(n, ms), mag: PLANET_MAG[n], color: PLANET_COLOR[n] })),
    { name: 'Moon', eq: moonEq(ms), mag: -12, color: PLANET_COLOR.Moon },
    { name: 'Sun', eq: sunEq(ms), mag: -26.7, color: PLANET_COLOR.Sun },
  ]
}

export function altOf(name: string, ms: number, lat: number, lon: number): number {
  if (name === 'Moon') return moonHz(ms, lat, lon).alt
  const e = name === 'Sun' ? sunEq(ms) : planetEq(name, ms)
  const a = toHorizontal(e, ms, lat, lon).alt
  return a + refraction(a)
}

/** Finds times in [t0, t1] where f crosses `level` (sampled every `step` ms, refined by bisection). */
export function crossings(f: (t: number) => number, level: number, t0: number, t1: number, step = 600000) {
  const out: { t: number; rising: boolean }[] = []
  let pt = t0, pv = f(t0) - level
  for (let t = t0 + step; t <= t1 + 1; t += step) {
    const v = f(t) - level
    if ((pv < 0) !== (v < 0)) {
      let a = pt, b = t, fa = pv
      for (let i = 0; i < 20; i++) {
        const m = (a + b) / 2, fm = f(m) - level
        if ((fa < 0) === (fm < 0)) { a = m; fa = fm } else b = m
      }
      out.push({ t: (a + b) / 2, rising: pv < 0 })
    }
    pt = t
    pv = v
  }
  return out
}

/** Sun events for the night that starts on the local noon `noon` (ms). */
export function nightEvents(noon: number, lat: number, lon: number) {
  const end = noon + 86400000
  const sun = (t: number) => altOf('Sun', t, lat, lon)
  const ev = (lvl: number) => {
    const c = crossings(sun, lvl, noon, end)
    return { set: c.find((x) => !x.rising)?.t ?? null, rise: c.find((x) => x.rising)?.t ?? null }
  }
  return { sun: ev(-0.833), civil: ev(-6), nautical: ev(-12), astro: ev(-18) }
}

/** Best viewing of a body during the dark part of the night (sun below −12°). */
export function bestTime(name: string, noon: number, lat: number, lon: number, step = 600000) {
  let best = { t: 0, alt: -90 }
  let darkUp = 0
  for (let t = noon; t <= noon + 86400000; t += step) {
    if (altOf('Sun', t, lat, lon) > -12) continue
    const a = altOf(name, t, lat, lon)
    if (a > best.alt) best = { t, alt: a }
    if (a > 10) darkUp += step
  }
  return { ...best, hours: darkUp / 3600000 }
}

// ---- catalogue decoding ----
const d36 = (s: string) => parseInt(s, 36)
export interface Star { ra: number; dec: number; mag: number; bv: number; name?: string }
let starCache: Star[] | null = null
export function stars(): Star[] {
  if (starCache) return starCache
  const out: Star[] = []
  for (let i = 0; i * 9 < STARS.length; i++) {
    const s = STARS.slice(i * 9, i * 9 + 9)
    out.push({ ra: d36(s.slice(0, 3)) * 0.05, dec: d36(s.slice(3, 6)) * 0.05 - 90, mag: d36(s.slice(6, 8)) / 10 - 2, bv: d36(s.slice(8, 9)) / 10 - 0.4, name: STAR_NAMES[i] })
  }
  return (starCache = out)
}
export interface Constellation { id: string; name: string; lines: Eq[][] }
export function constellations(): Constellation[] {
  return LINES.split(';').map((c) => {
    const [id, name, body] = c.split(':')
    return { id, name, lines: body.split(',').map((pl) => Array.from({ length: pl.length / 6 }, (_, k) => ({ ra: d36(pl.slice(k * 6, k * 6 + 3)) * 0.05, dec: d36(pl.slice(k * 6 + 3, k * 6 + 6)) * 0.05 - 90 }))) }
  })
}

/** Star colour from B−V (approximate blackbody tint). */
export function bvColor(bv: number): [number, number, number] {
  const t = Math.max(-0.4, Math.min(2, bv))
  if (t < 0) return [0.7 + 0.3 * (t + 0.4) / 0.4, 0.8 + 0.2 * (t + 0.4) / 0.4, 1]
  if (t < 0.6) return [1, 1 - t * 0.15, 1 - t * 0.6]
  return [1, 0.91 - (t - 0.6) * 0.25, 0.64 - (t - 0.6) * 0.35]
}

export const compass = (az: number) => ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'][Math.round(norm360(az) / 22.5) % 16]
