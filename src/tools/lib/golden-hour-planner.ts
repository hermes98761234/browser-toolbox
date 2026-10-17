// Sun & moon positions (after the SunCalc / Astronomy Answers formulas) and golden/blue hour times.

const RAD = Math.PI / 180
const DAY_MS = 86400000
const J1970 = 2440588
const J2000 = 2451545
const E = RAD * 23.4397 // obliquity of the Earth

const toDays = (ms: number) => ms / DAY_MS - 0.5 + J1970 - J2000
const rightAscension = (l: number, b: number) => Math.atan2(Math.sin(l) * Math.cos(E) - Math.tan(b) * Math.sin(E), Math.cos(l))
const declination = (l: number, b: number) => Math.asin(Math.sin(b) * Math.cos(E) + Math.cos(b) * Math.sin(E) * Math.sin(l))
const siderealTime = (d: number, lw: number) => RAD * (280.16 + 360.9856235 * d) - lw
const solarMeanAnomaly = (d: number) => RAD * (357.5291 + 0.98560028 * d)
function eclipticLongitude(M: number) {
  const C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M))
  return M + C + RAD * 102.9372 + Math.PI
}
function astroRefraction(h: number) {
  if (h < 0) h = 0
  return 0.0002967 / Math.tan(h + 0.00312536 / (h + 0.08901179))
}

export interface SkyPos {
  /** degrees above horizon */
  alt: number
  /** compass bearing in degrees, 0 = north, clockwise */
  az: number
}

function horizontal(ms: number, lat: number, lng: number, ra: number, dec: number, refract: boolean): SkyPos {
  const lw = RAD * -lng
  const phi = RAD * lat
  const H = siderealTime(toDays(ms), lw) - ra
  const az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi))
  let h = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H))
  if (refract) h += astroRefraction(h)
  return { alt: h / RAD, az: ((az / RAD + 180) % 360 + 360) % 360 }
}

/** Geometric sun position (no refraction, so -0.833° is the standard sunrise altitude). */
export function sunPosition(ms: number, lat: number, lng: number): SkyPos {
  const d = toDays(ms)
  const L = eclipticLongitude(solarMeanAnomaly(d))
  return horizontal(ms, lat, lng, rightAscension(L, 0), declination(L, 0), false)
}

function moonCoords(d: number) {
  const L = RAD * (218.316 + 13.176396 * d)
  const M = RAD * (134.963 + 13.064993 * d)
  const F = RAD * (93.272 + 13.22935 * d)
  const l = L + RAD * 6.289 * Math.sin(M)
  const b = RAD * 5.128 * Math.sin(F)
  const dt = 385001 - 20905 * Math.cos(M)
  return { ra: rightAscension(l, b), dec: declination(l, b), dist: dt }
}

export function moonPosition(ms: number, lat: number, lng: number): SkyPos {
  const c = moonCoords(toDays(ms))
  return horizontal(ms, lat, lng, c.ra, c.dec, true)
}

/** Illuminated fraction (0..1) and phase (0 new, 0.25 first quarter, 0.5 full, 0.75 last quarter). */
export function moonIllumination(ms: number) {
  const d = toDays(ms)
  const M = solarMeanAnomaly(d)
  const L = eclipticLongitude(M)
  const s = { ra: rightAscension(L, 0), dec: declination(L, 0) }
  const m = moonCoords(d)
  const sdist = 149598000
  const phi = Math.acos(Math.sin(s.dec) * Math.sin(m.dec) + Math.cos(s.dec) * Math.cos(m.dec) * Math.cos(s.ra - m.ra))
  const inc = Math.atan2(sdist * Math.sin(phi), m.dist - sdist * Math.cos(phi))
  const angle = Math.atan2(Math.cos(s.dec) * Math.sin(s.ra - m.ra), Math.sin(s.dec) * Math.cos(m.dec) - Math.cos(s.dec) * Math.sin(m.dec) * Math.cos(s.ra - m.ra))
  return { fraction: (1 + Math.cos(inc)) / 2, phase: 0.5 + (0.5 * inc * (angle < 0 ? -1 : 1)) / Math.PI }
}

export function phaseName(p: number) {
  const names = ['New moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous', 'Full moon', 'Waning gibbous', 'Last quarter', 'Waning crescent']
  return names[Math.round(p * 8) % 8]
}

/** Times (ms) in [start, end) where f(t) crosses `level`, refined by bisection. */
export function crossings(f: (ms: number) => number, start: number, end: number, level: number, stepMin = 10) {
  const out: { t: number; rising: boolean }[] = []
  const step = stepMin * 60000
  let t0 = start
  let v0 = f(t0) - level
  for (let t1 = start + step; t1 <= end; t1 += step) {
    const v1 = f(t1) - level
    if (v0 === 0 || v0 * v1 < 0) {
      let a = t0, b = t1, fa = v0
      for (let i = 0; i < 30 && b - a > 500; i++) {
        const m = (a + b) / 2
        const fm = f(m) - level
        if (fa * fm <= 0) b = m
        else { a = m; fa = fm }
      }
      out.push({ t: (a + b) / 2, rising: v1 > v0 })
    }
    t0 = t1
    v0 = v1
  }
  return out
}

export interface DayEvents {
  sunrise?: number
  sunset?: number
  noon: number
  noonAlt: number
  morningBlue?: [number, number]
  morningGolden?: [number, number]
  eveningGolden?: [number, number]
  eveningBlue?: [number, number]
  dawn?: number // civil, -6°
  dusk?: number
  moonrise?: number
  moonset?: number
}

export const LEVELS = { blueLow: -6, blueHigh: -4, sunrise: -0.833, goldenHigh: 6 }

/** Events between start and start + 24 h (start = local midnight as a UTC timestamp). */
export function dayEvents(start: number, lat: number, lng: number): DayEvents {
  const end = start + DAY_MS
  const alt = (t: number) => sunPosition(t, lat, lng).alt
  const first = (lvl: number, rising: boolean) => crossings(alt, start, end, lvl).find((c) => c.rising === rising)?.t
  let noon = start, noonAlt = -90
  for (let t = start; t < end; t += 5 * 60000) {
    const a = alt(t)
    if (a > noonAlt) { noonAlt = a; noon = t }
  }
  const pair = (a?: number, b?: number): [number, number] | undefined => (a !== undefined && b !== undefined ? [a, b] : undefined)
  const mAlt = (t: number) => moonPosition(t, lat, lng).alt
  const mc = crossings(mAlt, start, end, 0.133, 10)
  return {
    sunrise: first(LEVELS.sunrise, true),
    sunset: first(LEVELS.sunrise, false),
    noon,
    noonAlt,
    dawn: first(LEVELS.blueLow, true),
    dusk: first(LEVELS.blueLow, false),
    morningBlue: pair(first(LEVELS.blueLow, true), first(LEVELS.blueHigh, true)),
    morningGolden: pair(first(LEVELS.blueHigh, true), first(LEVELS.goldenHigh, true)),
    eveningGolden: pair(first(LEVELS.goldenHigh, false), first(LEVELS.blueHigh, false)),
    eveningBlue: pair(first(LEVELS.blueHigh, false), first(LEVELS.blueLow, false)),
    moonrise: mc.find((c) => c.rising)?.t,
    moonset: mc.find((c) => !c.rising)?.t,
  }
}

/** Phase of the light at a solar altitude. */
export function lightPhase(alt: number): 'night' | 'twilight' | 'blue' | 'golden' | 'day' {
  if (alt < -18) return 'night'
  if (alt < LEVELS.blueLow) return 'twilight'
  if (alt < LEVELS.blueHigh) return 'blue'
  if (alt < LEVELS.goldenHigh) return 'golden'
  return 'day'
}

/** UTC offset in minutes for an IANA zone at a moment (e.g. +120 for Europe/Kyiv in summer). */
export function tzOffset(zone: string, ms: number): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }).formatToParts(new Date(ms))
    const g = (t: string) => Number(parts.find((p) => p.type === t)?.value)
    const asUtc = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour') % 24, g('minute'))
    return Math.round((asUtc - Math.floor(ms / 60000) * 60000) / 60000)
  } catch {
    return -new Date(ms).getTimezoneOffset()
  }
}

/** UTC timestamp of local midnight for a YYYY-MM-DD date in a zone. */
export function localMidnight(date: string, zone: string): number {
  const [y, m, d] = date.split('-').map(Number)
  const guess = Date.UTC(y, m - 1, d)
  let t = guess - tzOffset(zone, guess) * 60000
  t = guess - tzOffset(zone, t) * 60000
  return t
}

export function hhmm(ms: number | undefined, zone: string) {
  if (ms === undefined) return '—'
  const t = ms + tzOffset(zone, ms) * 60000
  const d = new Date(t)
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

export const compass = (az: number) => ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'][Math.round(az / 22.5) % 16]
