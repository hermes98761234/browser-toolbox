// Coordinate formats (WGS84): decimal degrees, DMS, DDM, UTM and MGRS, plus compass helpers.

const A = 6378137
const F = 1 / 298.257223563
const E2 = F * (2 - F)
const EP2 = E2 / (1 - E2)
const K0 = 0.9996
const D2R = Math.PI / 180

export interface Utm { zone: number; hemi: 'N' | 'S'; easting: number; northing: number; band: string }

const BANDS = 'CDEFGHJKLMNPQRSTUVWX'

export function latBand(lat: number): string {
  if (lat < -80 || lat > 84) return ''
  return BANDS[Math.min(19, Math.floor((lat + 80) / 8))]
}

export function utmZone(lat: number, lon: number): number {
  let lo = lon
  if (lo >= 180) lo -= 360
  let z = Math.floor((lo + 180) / 6) + 1
  if (lat >= 56 && lat < 64 && lo >= 3 && lo < 12) z = 32
  if (lat >= 72 && lat < 84) {
    if (lo >= 0 && lo < 9) z = 31
    else if (lo >= 9 && lo < 21) z = 33
    else if (lo >= 21 && lo < 33) z = 35
    else if (lo >= 33 && lo < 42) z = 37
  }
  return Math.min(60, Math.max(1, z))
}

function meridianArc(phi: number): number {
  const e4 = E2 * E2, e6 = e4 * E2
  return A * ((1 - E2 / 4 - 3 * e4 / 64 - 5 * e6 / 256) * phi
    - (3 * E2 / 8 + 3 * e4 / 32 + 45 * e6 / 1024) * Math.sin(2 * phi)
    + (15 * e4 / 256 + 45 * e6 / 1024) * Math.sin(4 * phi)
    - (35 * e6 / 3072) * Math.sin(6 * phi))
}

/** Lat/lon → easting/northing in a given zone (Snyder's series, mm-level accuracy in-zone). */
export function toUtmInZone(lat: number, lon: number, zone: number): { easting: number; northing: number } {
  const phi = lat * D2R
  const lam0 = ((zone - 1) * 6 - 180 + 3) * D2R
  const sin = Math.sin(phi), cos = Math.cos(phi), tan = Math.tan(phi)
  const N = A / Math.sqrt(1 - E2 * sin * sin)
  const T = tan * tan
  const C = EP2 * cos * cos
  let dl = lon * D2R - lam0
  if (dl > Math.PI) dl -= 2 * Math.PI
  if (dl < -Math.PI) dl += 2 * Math.PI
  const Aa = cos * dl
  const M = meridianArc(phi)
  const easting = K0 * N * (Aa + (1 - T + C) * Aa ** 3 / 6 + (5 - 18 * T + T * T + 72 * C - 58 * EP2) * Aa ** 5 / 120) + 500000
  let northing = K0 * (M + N * tan * (Aa * Aa / 2 + (5 - T + 9 * C + 4 * C * C) * Aa ** 4 / 24 + (61 - 58 * T + T * T + 600 * C - 330 * EP2) * Aa ** 6 / 720))
  if (lat < 0) northing += 10000000
  return { easting, northing }
}

export function toUtm(lat: number, lon: number): Utm {
  const zone = utmZone(lat, lon)
  const { easting, northing } = toUtmInZone(lat, lon, zone)
  return { zone, hemi: lat < 0 ? 'S' : 'N', easting, northing, band: latBand(lat) }
}

export function fromUtm(zone: number, hemi: 'N' | 'S', easting: number, northing: number): { lat: number; lon: number } {
  const e4 = E2 * E2, e6 = e4 * E2
  const x = easting - 500000
  const y = hemi === 'S' ? northing - 10000000 : northing
  const M = y / K0
  const mu = M / (A * (1 - E2 / 4 - 3 * e4 / 64 - 5 * e6 / 256))
  const e1 = (1 - Math.sqrt(1 - E2)) / (1 + Math.sqrt(1 - E2))
  const p1 = mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu) + (21 * e1 * e1 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu)
    + (151 * e1 ** 3 / 96) * Math.sin(6 * mu) + (1097 * e1 ** 4 / 512) * Math.sin(8 * mu)
  const s = Math.sin(p1), c = Math.cos(p1), t = Math.tan(p1)
  const C1 = EP2 * c * c, T1 = t * t
  const N1 = A / Math.sqrt(1 - E2 * s * s)
  const R1 = A * (1 - E2) / Math.pow(1 - E2 * s * s, 1.5)
  const D = x / (N1 * K0)
  const lat = p1 - (N1 * t / R1) * (D * D / 2 - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * EP2) * D ** 4 / 24
    + (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * EP2 - 3 * C1 * C1) * D ** 6 / 720)
  const lam0 = ((zone - 1) * 6 - 180 + 3) * D2R
  const lon = lam0 + (D - (1 + 2 * T1 + C1) * D ** 3 / 6 + (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * EP2 + 24 * T1 * T1) * D ** 5 / 120) / c
  return { lat: lat / D2R, lon: lon / D2R }
}

const COLS = ['ABCDEFGH', 'JKLMNPQR', 'STUVWXYZ']
const ROWS = 'ABCDEFGHJKLMNPQRSTUV'

/** MGRS string with given precision digits per axis (5 = 1 m). Empty outside 80°S–84°N. */
export function toMgrs(lat: number, lon: number, digits = 5, spaced = true): string {
  if (lat < -80 || lat > 84) return ''
  const u = toUtm(lat, lon)
  const set = (u.zone - 1) % 3
  const e100 = Math.floor(u.easting / 100000)
  const col = COLS[set][e100 - 1] ?? '?'
  const row = ROWS[(Math.floor(u.northing / 100000) + (u.zone % 2 === 0 ? 5 : 0)) % 20]
  const div = 10 ** (5 - digits)
  const e = String(Math.floor((u.easting % 100000) / div)).padStart(digits, '0')
  const n = String(Math.floor((u.northing % 100000) / div)).padStart(digits, '0')
  const parts = [`${u.zone}${u.band}`, col + row, e, n]
  return spaced ? parts.join(' ') : parts.join('')
}

export function fromMgrs(s: string): { lat: number; lon: number } | null {
  const m = s.toUpperCase().replace(/\s+/g, '').match(/^(\d{1,2})([C-HJ-NP-X])([A-HJ-NP-Z])([A-HJ-NP-V])(\d*)$/)
  if (!m || m[5].length % 2) return null
  const zone = +m[1], band = m[2]
  if (zone < 1 || zone > 60) return null
  const half = m[5].length / 2
  if (half > 5) return null
  const scale = 10 ** (5 - half)
  const e = half ? +m[5].slice(0, half) * scale : 0
  const n = half ? +m[5].slice(half) * scale : 0
  const colIdx = COLS[(zone - 1) % 3].indexOf(m[3])
  let rowIdx = ROWS.indexOf(m[4]) - (zone % 2 === 0 ? 5 : 0)
  if (colIdx < 0 || rowIdx < -20) return null
  rowIdx = ((rowIdx % 20) + 20) % 20
  const easting = (colIdx + 1) * 100000 + e
  let northing = rowIdx * 100000 + n
  const bandIdx = BANDS.indexOf(band)
  const latBottom = -80 + bandIdx * 8
  const hemi: 'N' | 'S' = latBottom < 0 ? 'S' : 'N'
  const cm = (zone - 1) * 6 - 180 + 3
  const minN = Math.min(...[cm - 3, cm, cm + 3].map((lo) => toUtmInZone(latBottom, lo, zone).northing))
  const floorN = Math.floor(minN / 100000) * 100000
  while (northing < floorN) northing += 2000000
  return fromUtm(zone, hemi, easting, northing)
}

export function parseUtm(s: string): { lat: number; lon: number } | null {
  const m = s.toUpperCase().trim().match(/^(\d{1,2})\s*([A-Z])\s+(\d+(?:\.\d+)?)\s*(?:M?E)?\s+(\d+(?:\.\d+)?)\s*(?:M?N)?$/)
  if (!m) return null
  const zone = +m[1]
  if (zone < 1 || zone > 60) return null
  const letter = m[2]
  const hemi: 'N' | 'S' = letter === 'S' ? 'S' : letter === 'N' ? 'N' : letter < 'N' ? 'S' : 'N'
  return fromUtm(zone, hemi, +m[3], +m[4])
}

export function toDms(v: number, isLat: boolean, decimals = 1): string {
  const h = isLat ? (v < 0 ? 'S' : 'N') : (v < 0 ? 'W' : 'E')
  const a = Math.abs(v)
  let d = Math.floor(a)
  let m = Math.floor((a - d) * 60)
  let s = +(((a - d) * 60 - m) * 60).toFixed(decimals)
  if (s >= 60) { s = 0; m += 1 }
  if (m >= 60) { m = 0; d += 1 }
  return `${d}°${String(m).padStart(2, '0')}′${s.toFixed(decimals).padStart(decimals ? 3 + decimals : 2, '0')}″${h}`
}

export function toDdm(v: number, isLat: boolean, decimals = 4): string {
  const h = isLat ? (v < 0 ? 'S' : 'N') : (v < 0 ? 'W' : 'E')
  const a = Math.abs(v)
  let d = Math.floor(a)
  let m = +((a - d) * 60).toFixed(decimals)
  if (m >= 60) { m = 0; d += 1 }
  return `${d}°${m.toFixed(decimals)}′${h}`
}

/** Parses one angle: "40.7128", "-74.006", "40°42'46\"N", "74 0 21.6 W", "40°42.767'N". */
export function parseAngle(s: string): number | null {
  const t = s.trim().toUpperCase()
  if (!t) return null
  const hemi = t.match(/[NSEW]/)?.[0]
  const nums = t.replace(/[NSEW]/g, ' ').match(/-?\d+(?:\.\d+)?/g)
  if (!nums || nums.length > 3) return null
  const [d, m = '0', sec = '0'] = nums
  const neg = d.startsWith('-') || hemi === 'S' || hemi === 'W'
  const v = Math.abs(+d) + +m / 60 + +sec / 3600
  if (+m >= 60 || +sec >= 60) return null
  return neg ? -v : v
}

/** Parses any supported text: "lat, lon" in DD/DMS/DDM, a UTM string, or an MGRS string. */
export function parseAny(s: string): { lat: number; lon: number } | null {
  const t = s.trim()
  if (!t) return null
  const mg = fromMgrs(t)
  if (mg) return mg
  const ut = parseUtm(t)
  if (ut) return ut
  let parts = t.split(/[,;]|\s{2,}/).filter((p) => p.trim())
  if (parts.length !== 2) {
    const m = t.toUpperCase().match(/^(.*?[NS])\s*(.*[EW])$/)
    if (m) parts = [m[1], m[2]]
    else {
      const nums = t.split(/\s+/)
      if (nums.length === 2) parts = nums
    }
  }
  if (parts.length !== 2) return null
  let lat = parseAngle(parts[0]), lon = parseAngle(parts[1])
  if (lat === null || lon === null) return null
  if (/[EW]/i.test(parts[0]) && /[NS]/i.test(parts[1])) [lat, lon] = [lon, lat]
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null
  return { lat, lon }
}

export const CARDINALS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']
export function cardinal(deg: number): string {
  return CARDINALS[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16]
}

/** Initial great-circle bearing and haversine distance (m) from point 1 to point 2. */
export function bearingDistance(lat1: number, lon1: number, lat2: number, lon2: number): { bearing: number; distance: number } {
  const p1 = lat1 * D2R, p2 = lat2 * D2R, dl = (lon2 - lon1) * D2R
  const y = Math.sin(dl) * Math.cos(p2)
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl)
  const bearing = ((Math.atan2(y, x) / D2R) + 360) % 360
  const h = Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2
  return { bearing, distance: 2 * 6371008.8 * Math.asin(Math.sqrt(h)) }
}

/** Compass heading from a deviceorientationabsolute event's alpha (counter-clockwise) and screen angle. */
export function headingFromAlpha(alpha: number, screenAngle = 0): number {
  return (((360 - alpha + screenAngle) % 360) + 360) % 360
}
