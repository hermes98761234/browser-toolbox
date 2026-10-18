// Coordinate Mapper logic: finds latitude/longitude columns in a table (decimal, DMS/DDM or a
// combined "lat, lon" column), grid-clusters projected points, colours by a column, GeoJSON export.
import { parseAngle, parseAny } from './compass-and-coordinates'
import { project, type LL } from './dog-walk-tracker'

export interface Pick { lat: number; lon: number; combined: number }
export interface Pt { lat: number; lon: number; row: number }

const LAT = /^(lat|latitude|lat_?deg|y|breite|latitud)$/i
const LON = /^(lon|lng|long|longitude|lon_?deg|x|länge|laenge|longitud)$/i
const BOTH = /^(coord|coords|coordinates|location|position|latlng|lat_?lon|lat_?long|gps|point|geo)$/i

/** Parses one coordinate cell for an axis: decimal, "40°42'46\"N", "74 0 21.6 W", "40°42.767'N". */
export function parseCoord(v: string, isLat: boolean): number | null {
  const t = v.trim()
  if (!t) return null
  const hemi = t.toUpperCase().match(/[NSEW]/)?.[0]
  if (hemi && (isLat ? /[EW]/ : /[NS]/).test(hemi)) return null
  const x = parseAngle(t.replace(/,(\d)/, '.$1'))
  if (x === null || !Number.isFinite(x)) return null
  return Math.abs(x) <= (isLat ? 90 : 180) ? x : null
}

const share = (rows: string[][], c: number, f: (v: string) => boolean) => {
  const vals = rows.map((r) => r[c] ?? '').filter((v) => v.trim())
  return vals.length ? vals.filter(f).length / vals.length : 0
}

/** Guesses the coordinate columns: by header name first, then by content. -1 = none. */
export function detect(header: string[], rows: string[][]): Pick {
  const norm = header.map((h) => h.trim().replace(/[\s.-]+/g, '_'))
  let lat = norm.findIndex((h) => LAT.test(h))
  let lon = norm.findIndex((h) => LON.test(h))
  if (lat >= 0 && lon >= 0 && share(rows, lat, (v) => parseCoord(v, true) !== null) > 0.6 && share(rows, lon, (v) => parseCoord(v, false) !== null) > 0.6) return { lat, lon, combined: -1 }
  const comb = norm.findIndex((h, i) => BOTH.test(h) && share(rows, i, (v) => parseAny(v) !== null) > 0.6)
  if (comb >= 0) return { lat: -1, lon: -1, combined: comb }
  // content-based: first pair of adjacent-ish columns that parse as lat then lon
  lat = lon = -1
  const n = header.length
  const okLat = Array.from({ length: n }, (_, c) => share(rows, c, (v) => parseCoord(v, true) !== null && !/^\d{4,}$/.test(v.trim())) > 0.8)
  const okLon = Array.from({ length: n }, (_, c) => share(rows, c, (v) => parseCoord(v, false) !== null && !/^\d{4,}$/.test(v.trim())) > 0.8)
  const decimals = (c: number) => share(rows, c, (v) => /\.\d{2,}|°|'|"/.test(v))
  for (let c = 0; c < n - 1 && lat < 0; c++) if (okLat[c] && okLon[c + 1] && decimals(c) > 0.5 && decimals(c + 1) > 0.5) [lat, lon] = [c, c + 1]
  if (lat < 0) {
    const combined = header.findIndex((_, c) => share(rows, c, (v) => parseAny(v) !== null && /[,;\s]/.test(v.trim())) > 0.8)
    if (combined >= 0) return { lat: -1, lon: -1, combined }
  }
  return { lat, lon, combined: -1 }
}

/** Converts rows to points; returns indices of rows that could not be read. */
export function toPoints(rows: string[][], p: Pick, swap = false): { pts: Pt[]; bad: number[] } {
  const pts: Pt[] = [], bad: number[] = []
  rows.forEach((r, i) => {
    let lat: number | null = null, lon: number | null = null
    if (p.combined >= 0) {
      const c = parseAny(r[p.combined] ?? '')
      if (c) ({ lat, lon } = c)
    } else if (p.lat >= 0 && p.lon >= 0) {
      lat = parseCoord(r[p.lat] ?? '', true)
      lon = parseCoord(r[p.lon] ?? '', false)
    }
    if (swap && lat !== null && lon !== null && Math.abs(lon) <= 90) [lat, lon] = [lon, lat]
    if (lat === null || lon === null || (lat === 0 && lon === 0)) bad.push(i)
    else pts.push({ lat, lon, row: i })
  })
  return { pts, bad }
}

export interface Cluster { lat: number; lon: number; x: number; y: number; members: number[] }

/** Grid clustering in world pixels at zoom z: one cluster per occupied cell, then merges cells closer than `cell`. */
export function gridCluster(pts: Pt[], z: number, cell = 60): Cluster[] {
  const cells = new Map<string, { sx: number; sy: number; slat: number; slon: number; m: number[] }>()
  for (let i = 0; i < pts.length; i++) {
    const [x, y] = project([pts[i].lat, pts[i].lon], z)
    const k = `${Math.floor(x / cell)}:${Math.floor(y / cell)}`
    const c = cells.get(k) ?? { sx: 0, sy: 0, slat: 0, slon: 0, m: [] }
    c.sx += x
    c.sy += y
    c.slat += pts[i].lat
    c.slon += pts[i].lon
    c.m.push(i)
    cells.set(k, c)
  }
  let cl: Cluster[] = [...cells.values()].map((c) => ({ x: c.sx / c.m.length, y: c.sy / c.m.length, lat: c.slat / c.m.length, lon: c.slon / c.m.length, members: c.m }))
  // merge neighbours that ended up close across cell borders (largest first)
  cl.sort((a, b) => b.members.length - a.members.length)
  const out: Cluster[] = []
  for (const c of cl) {
    const near = out.find((o) => Math.hypot(o.x - c.x, o.y - c.y) < cell * 0.8)
    if (near) {
      const n1 = near.members.length, n2 = c.members.length, t = n1 + n2
      near.x = (near.x * n1 + c.x * n2) / t
      near.y = (near.y * n1 + c.y * n2) / t
      near.lat = (near.lat * n1 + c.lat * n2) / t
      near.lon = (near.lon * n1 + c.lon * n2) / t
      near.members.push(...c.members)
    } else out.push({ ...c, members: [...c.members] })
  }
  cl = out
  return cl
}

export type ColorScale = { kind: 'none' } | { kind: 'cat'; values: string[] } | { kind: 'num'; min: number; max: number }

const num = (v: string) => {
  const t = v.replace(/[\s,$€£%]/g, '')
  return t && Number.isFinite(+t) ? +t : NaN
}

/** Categorical (≤ 12 distinct values) or numeric colour scale for a column. */
export function colorScale(rows: string[][], col: number): ColorScale {
  if (col < 0) return { kind: 'none' }
  const vals = rows.map((r) => (r[col] ?? '').trim()).filter(Boolean)
  const nums = vals.map(num).filter((x) => !Number.isNaN(x))
  const distinct = [...new Set(vals)]
  if (nums.length >= vals.length * 0.9 && distinct.length > 6) return { kind: 'num', min: Math.min(...nums), max: Math.max(...nums) }
  const counts = new Map<string, number>()
  for (const v of vals) counts.set(v, (counts.get(v) ?? 0) + 1)
  return { kind: 'cat', values: [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 11).map((e) => e[0]) }
}

const RAMP = ['#440154', '#3b528b', '#21918c', '#5ec962', '#fde725']
function ramp(t: number): string {
  const x = Math.max(0, Math.min(1, t)) * (RAMP.length - 1)
  const i = Math.min(RAMP.length - 2, Math.floor(x)), f = x - i
  const h = (s: string, k: number) => parseInt(s.slice(1 + 2 * k, 3 + 2 * k), 16)
  return '#' + [0, 1, 2].map((k) => Math.round(h(RAMP[i], k) * (1 - f) + h(RAMP[i + 1], k) * f).toString(16).padStart(2, '0')).join('')
}

export function colorOf(sc: ColorScale, v: string | undefined, palette: string[]): string {
  if (sc.kind === 'none') return palette[0]
  const t = (v ?? '').trim()
  if (sc.kind === 'cat') {
    const i = sc.values.indexOf(t)
    return i >= 0 ? palette[i % palette.length] : '#94a3b8'
  }
  const x = num(t)
  return Number.isNaN(x) ? '#94a3b8' : ramp(sc.max > sc.min ? (x - sc.min) / (sc.max - sc.min) : 0.5)
}
export const rampCss = `linear-gradient(90deg, ${RAMP.join(', ')})`

/** GeoJSON FeatureCollection of points; every other column becomes a property (numbers kept numeric). */
export function toGeoJSON(header: string[], rows: string[][], pts: Pt[], skip: number[] = []): string {
  const features = pts.map((p) => {
    const props: Record<string, string | number> = {}
    header.forEach((h, i) => {
      if (skip.includes(i)) return
      const v = rows[p.row][i] ?? ''
      const n = num(v)
      props[h || `col${i + 1}`] = v.trim() !== '' && !Number.isNaN(n) && /^-?[\d.,\s]+$/.test(v.trim()) ? n : v
    })
    return { type: 'Feature', geometry: { type: 'Point', coordinates: [+p.lon.toFixed(7), +p.lat.toFixed(7)] }, properties: props }
  })
  return JSON.stringify({ type: 'FeatureCollection', features }, null, 1)
}

export function bbox(pts: Pt[]): { s: number; w: number; n: number; e: number } | null {
  if (!pts.length) return null
  return { s: Math.min(...pts.map((p) => p.lat)), n: Math.max(...pts.map((p) => p.lat)), w: Math.min(...pts.map((p) => p.lon)), e: Math.max(...pts.map((p) => p.lon)) }
}

export const asLL = (p: Pt): LL => [p.lat, p.lon]
