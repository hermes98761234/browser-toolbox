// NOAA solar position algorithm (after the NOAA Global Monitoring Division solar calculator /
// Meeus "Astronomical Algorithms"): declination, equation of time, elevation/azimuth and
// rise/set times for any elevation angle. Longitude is east-positive; times are UTC ms.

const RAD = Math.PI / 180
const DAY = 86400000
const sin = (d: number) => Math.sin(d * RAD)
const cos = (d: number) => Math.cos(d * RAD)
const tan = (d: number) => Math.tan(d * RAD)
const mod = (a: number, n: number) => ((a % n) + n) % n

export const julianDay = (ms: number) => ms / DAY + 2440587.5
const century = (ms: number) => (julianDay(ms) - 2451545) / 36525

export interface SunCore {
  /** Declination, degrees. */
  decl: number
  /** Equation of time, minutes (apparent minus mean solar time). */
  eqTime: number
}

export function sunCore(ms: number): SunCore {
  const T = century(ms)
  const L0 = mod(280.46646 + T * (36000.76983 + T * 0.0003032), 360)
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T)
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T)
  const C = sin(M) * (1.914602 - T * (0.004817 + 0.000014 * T)) + sin(2 * M) * (0.019993 - 0.000101 * T) + sin(3 * M) * 0.000289
  const trueLong = L0 + C
  const omega = 125.04 - 1934.136 * T
  const lambda = trueLong - 0.00569 - 0.00478 * sin(omega)
  const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60
  const eps = eps0 + 0.00256 * cos(omega)
  const decl = Math.asin(sin(eps) * sin(lambda)) / RAD
  const y = tan(eps / 2) ** 2
  const eqTime = (4 / RAD) * (y * sin(2 * L0) - 2 * e * sin(M) + 4 * e * y * sin(M) * cos(2 * L0) - 0.5 * y * y * sin(4 * L0) - 1.25 * e * e * sin(2 * M))
  return { decl, eqTime }
}

/** NOAA atmospheric refraction correction (degrees) for a geometric elevation. */
function refraction(h: number): number {
  if (h > 85) return 0
  const t = tan(h)
  let r: number
  if (h > 5) r = 58.1 / t - 0.07 / t ** 3 + 0.000086 / t ** 5
  else if (h > -0.575) r = 1735 + h * (-518.2 + h * (103.4 + h * (-12.79 + h * 0.711)))
  else r = -20.772 / t
  return r / 3600
}

export interface SunPos {
  /** Apparent elevation above the horizon (refraction included), degrees. */
  elevation: number
  /** Compass bearing, degrees clockwise from north. */
  azimuth: number
}

export function sunPosition(ms: number, lat: number, lon: number): SunPos {
  const { decl, eqTime } = sunCore(ms)
  const minutes = mod(ms, DAY) / 60000
  const tst = mod(minutes + eqTime + 4 * lon, 1440)
  const ha = tst / 4 < 0 ? tst / 4 + 180 : tst / 4 - 180
  const cz = Math.max(-1, Math.min(1, sin(lat) * sin(decl) + cos(lat) * cos(decl) * cos(ha)))
  const zen = Math.acos(cz) / RAD
  const elev = 90 - zen
  const den = cos(lat) * Math.sin(zen * RAD)
  let az: number
  if (Math.abs(den) > 1e-9) {
    const ca = Math.max(-1, Math.min(1, (sin(lat) * cz - sin(decl)) / den))
    const a = Math.acos(ca) / RAD
    az = ha > 0 ? mod(a + 180, 360) : mod(540 - a, 360)
  } else az = lat > 0 ? 180 : 0
  return { elevation: elev + refraction(elev), azimuth: az }
}

/** UTC ms when the sun's centre crosses `angle` (degrees; −0.833 = sunrise/sunset) on the UTC day of `dayMs`. */
export function crossing(dayMs: number, lat: number, lon: number, angle: number, rising: boolean): number | null {
  const day0 = Math.floor(dayMs / DAY) * DAY
  let t = day0 + (720 - 4 * lon) * 60000
  for (let i = 0; i < 3; i++) {
    const { decl, eqTime } = sunCore(t)
    const c = (sin(angle) - sin(lat) * sin(decl)) / (cos(lat) * cos(decl))
    if (c > 1 || c < -1) return null
    const H = Math.acos(c) / RAD
    t = day0 + (720 - 4 * lon - eqTime + (rising ? -4 : 4) * H) * 60000
  }
  return t
}

export function solarNoon(dayMs: number, lon: number): number {
  const day0 = Math.floor(dayMs / DAY) * DAY
  let t = day0 + (720 - 4 * lon) * 60000
  for (let i = 0; i < 2; i++) t = day0 + (720 - 4 * lon - sunCore(t).eqTime) * 60000
  return t
}

export const ANGLES = { astro: -18, nautical: -12, civil: -6, blueTop: -4, rise: -0.833, golden: 6 }

export interface Day {
  noon: number
  noonElevation: number
  sunrise: number | null
  sunset: number | null
  civilDawn: number | null
  civilDusk: number | null
  nauticalDawn: number | null
  nauticalDusk: number | null
  astroDawn: number | null
  astroDusk: number | null
  /** End of morning golden hour (sun reaches 6°) and start of evening golden hour. */
  goldenEnd: number | null
  goldenStart: number | null
  blueMorningEnd: number | null
  blueEveningStart: number | null
  /** Minutes of daylight (sunrise to sunset); 1440 for polar day, 0 for polar night. */
  dayLength: number
  kind: 'normal' | 'polar-day' | 'polar-night'
}

/** All events for the local solar day whose date (YYYY-MM-DD) is given. */
export function dayInfo(date: string, lat: number, lon: number): Day {
  const d = Date.parse(date + 'T00:00:00Z')
  const up = (a: number) => crossing(d, lat, lon, a, true)
  const down = (a: number) => crossing(d, lat, lon, a, false)
  const noon = solarNoon(d, lon)
  const noonElevation = sunPosition(noon, lat, lon).elevation
  const sunrise = up(ANGLES.rise), sunset = down(ANGLES.rise)
  const kind = sunrise !== null && sunset !== null ? 'normal' : noonElevation > 0 ? 'polar-day' : 'polar-night'
  return {
    noon, noonElevation, sunrise, sunset,
    civilDawn: up(ANGLES.civil), civilDusk: down(ANGLES.civil),
    nauticalDawn: up(ANGLES.nautical), nauticalDusk: down(ANGLES.nautical),
    astroDawn: up(ANGLES.astro), astroDusk: down(ANGLES.astro),
    goldenEnd: up(ANGLES.golden), goldenStart: down(ANGLES.golden),
    blueMorningEnd: up(ANGLES.blueTop), blueEveningStart: down(ANGLES.blueTop),
    dayLength: kind === 'normal' ? (sunset! - sunrise!) / 60000 : kind === 'polar-day' ? 1440 : 0,
    kind,
  }
}

export type Phase = 'night' | 'astro' | 'nautical' | 'civil' | 'golden' | 'day'
/** Light phase for an apparent sun elevation (civil twilight band −6…−4° is the blue hour). */
export function phase(elev: number): Phase {
  if (elev < -18) return 'night'
  if (elev < -12) return 'astro'
  if (elev < -6) return 'nautical'
  if (elev < -0.833) return 'civil'
  if (elev < 6) return 'golden'
  return 'day'
}

export const addDaysIso = (iso: string, n: number) => new Date(Date.parse(iso + 'T00:00:00Z') + n * DAY).toISOString().slice(0, 10)
export const hm = (min: number) => `${Math.floor(min / 60)}h ${String(Math.round(min % 60)).padStart(2, '0')}m`
