// Route measuring on the sphere: great-circle and rhumb-line distances/bearings, destination points,
// geodesic circles, densified paths, GeoJSON/GPX conversion. Points are [lon, lat] (GeoJSON order).
// Formulas follow the standard spherical-trigonometry derivations (e.g. Bowditch / Williams' Aviation Formulary).
import { haversine, R_MEAN, type LonLat } from './field-area-measurer'

export { haversine, type LonLat }
const RAD = Math.PI / 180
const norm360 = (d: number) => ((d % 360) + 360) % 360

/** Initial great-circle bearing a → b, degrees clockwise from true north. */
export function bearing(a: LonLat, b: LonLat): number {
  const φ1 = a[1] * RAD, φ2 = b[1] * RAD, Δλ = (b[0] - a[0]) * RAD
  const y = Math.sin(Δλ) * Math.cos(φ2)
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  return norm360(Math.atan2(y, x) / RAD)
}

/** Final bearing on arrival at b. */
export const finalBearing = (a: LonLat, b: LonLat) => norm360(bearing(b, a) + 180)

function rhumbParts(a: LonLat, b: LonLat) {
  const φ1 = a[1] * RAD, φ2 = b[1] * RAD
  const Δφ = φ2 - φ1
  let Δλ = (b[0] - a[0]) * RAD
  if (Math.abs(Δλ) > Math.PI) Δλ = Δλ > 0 ? -(2 * Math.PI - Δλ) : 2 * Math.PI + Δλ
  const Δψ = Math.log(Math.tan(Math.PI / 4 + φ2 / 2) / Math.tan(Math.PI / 4 + φ1 / 2))
  const q = Math.abs(Δψ) > 1e-12 ? Δφ / Δψ : Math.cos(φ1)
  return { Δφ, Δλ, Δψ, q }
}

/** Rhumb-line (constant bearing) distance in metres. */
export function rhumbDistance(a: LonLat, b: LonLat): number {
  const { Δφ, Δλ, q } = rhumbParts(a, b)
  return Math.sqrt(Δφ * Δφ + q * q * Δλ * Δλ) * R_MEAN
}
export function rhumbBearing(a: LonLat, b: LonLat): number {
  const { Δλ, Δψ } = rhumbParts(a, b)
  return norm360(Math.atan2(Δλ, Δψ) / RAD)
}

/** Point reached from p after `dist` metres on initial bearing `brg` (great circle). */
export function destination(p: LonLat, brg: number, dist: number): LonLat {
  const δ = dist / R_MEAN, θ = brg * RAD, φ1 = p[1] * RAD, λ1 = p[0] * RAD
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ))
  const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2))
  return [((λ2 / RAD + 540) % 360) - 180, φ2 / RAD]
}

/** Points along the great circle a → b (inclusive), for drawing long legs as curves. */
export function greatCirclePath(a: LonLat, b: LonLat, n = 32): LonLat[] {
  const d = haversine(a, b)
  if (d < 20000) return [a, b]
  const φ1 = a[1] * RAD, λ1 = a[0] * RAD, φ2 = b[1] * RAD, λ2 = b[0] * RAD
  const δ = d / R_MEAN
  const out: LonLat[] = []
  let prevLon = a[0]
  for (let i = 0; i <= n; i++) {
    const f = i / n
    const A = Math.sin((1 - f) * δ) / Math.sin(δ), B = Math.sin(f * δ) / Math.sin(δ)
    const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2)
    const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2)
    const z = A * Math.sin(φ1) + B * Math.sin(φ2)
    let lon = Math.atan2(y, x) / RAD
    while (lon - prevLon > 180) lon -= 360 // keep the path continuous across the antimeridian
    while (lon - prevLon < -180) lon += 360
    prevLon = lon
    out.push([lon, Math.atan2(z, Math.hypot(x, y)) / RAD])
  }
  return out
}

/** Geodesic circle (polygon) of radius r metres. */
export const circle = (c: LonLat, r: number, n = 72): LonLat[] => Array.from({ length: n }, (_, i) => destination(c, (i * 360) / n, r))

export type Method = 'gc' | 'rhumb'
export interface Leg { from: LonLat; to: LonLat; d: number; cum: number; brg: number }
export function legs(pts: LonLat[], m: Method): Leg[] {
  const out: Leg[] = []
  let cum = 0
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i]
    const d = m === 'gc' ? haversine(a, b) : rhumbDistance(a, b)
    cum += d
    out.push({ from: a, to: b, d, cum, brg: m === 'gc' ? bearing(a, b) : rhumbBearing(a, b) })
  }
  return out
}

const POINTS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']
export const compass = (brg: number) => POINTS[Math.round(norm360(brg) / 22.5) % 16]

export type Unit = 'km' | 'mi' | 'nmi'
export const UNIT_M: Record<Unit, number> = { km: 1000, mi: 1609.344, nmi: 1852 }
export function fmtDist(m: number, u: Unit): string {
  if (u === 'km' && m < 1000) return `${m.toFixed(0)} m`
  if (u === 'mi' && m < 402.336) return `${(m / 0.3048).toFixed(0)} ft`
  const v = m / UNIT_M[u]
  return `${v.toFixed(v < 10 ? 2 : v < 100 ? 1 : 0)} ${u}`
}

/** Hours → "2 h 05 min" / "3 d 4 h". */
export function fmtDur(h: number): string {
  if (!Number.isFinite(h)) return '—'
  const min = Math.round(h * 60)
  if (min < 60) return `${min} min`
  if (min < 48 * 60) return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`
  return `${Math.floor(min / 1440)} d ${Math.round((min % 1440) / 60)} h`
}

/** All line strings in a GeoJSON object (LineString, MultiLineString, Polygon rings, collections). */
export function linesFromGeoJSON(g: unknown): { name: string; pts: LonLat[] }[] {
  const out: { name: string; pts: LonLat[] }[] = []
  const walk = (o: unknown, name: string) => {
    const x = o as { type?: string; features?: unknown[]; geometry?: unknown; geometries?: unknown[]; coordinates?: unknown; properties?: { name?: string } }
    if (!x || typeof x !== 'object') return
    const nm = x.properties?.name ?? name
    if (x.type === 'FeatureCollection') x.features?.forEach((f, i) => walk(f, `${name} ${i + 1}`))
    else if (x.type === 'Feature') walk(x.geometry, nm)
    else if (x.type === 'GeometryCollection') x.geometries?.forEach((f) => walk(f, nm))
    else if (x.type === 'LineString') out.push({ name: nm, pts: (x.coordinates as number[][]).map((p) => [p[0], p[1]]) })
    else if (x.type === 'MultiLineString') (x.coordinates as number[][][]).forEach((l, i) => out.push({ name: `${nm} ${i + 1}`, pts: l.map((p) => [p[0], p[1]]) }))
    else if (x.type === 'Polygon') out.push({ name: nm, pts: (x.coordinates as number[][][])[0].map((p) => [p[0], p[1]]) })
  }
  walk(g, 'Line')
  return out.filter((l) => l.pts.length >= 2 && l.pts.every((p) => Number.isFinite(p[0]) && Number.isFinite(p[1])))
}

export interface RouteLike { name: string; pts: LonLat[] }
export interface RingLike { c: LonLat; r: number }
const r7 = (p: LonLat) => [+p[0].toFixed(7), +p[1].toFixed(7)]
export function toGeoJSON(routes: RouteLike[], rings: RingLike[], m: Method) {
  return {
    type: 'FeatureCollection',
    features: [
      ...routes.filter((r) => r.pts.length >= 2).map((r) => ({ type: 'Feature', properties: { name: r.name, length_m: Math.round(legs(r.pts, m).at(-1)?.cum ?? 0), method: m }, geometry: { type: 'LineString', coordinates: r.pts.map(r7) } })),
      ...rings.map((g) => ({ type: 'Feature', properties: { radius_m: g.r, center: r7(g.c) }, geometry: { type: 'Polygon', coordinates: [[...circle(g.c, g.r, 72), circle(g.c, g.r, 72)[0]].map(r7)] } })),
    ],
  }
}

const esc = (s: string) => s.replace(/[<&>"]/g, (c) => ({ '<': '&lt;', '&': '&amp;', '>': '&gt;', '"': '&quot;' })[c]!)
export function toGpx(routes: RouteLike[]): string {
  const body = routes.filter((r) => r.pts.length >= 2).map((r) => `  <rte><name>${esc(r.name)}</name>\n${r.pts.map((p, i) => `    <rtept lat="${p[1].toFixed(7)}" lon="${p[0].toFixed(7)}"><name>${i === 0 ? 'Start' : `WP${i}`}</name></rtept>`).join('\n')}\n  </rte>`).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Browser Toolbox Map Distance Measurer" xmlns="http://www.topografix.com/GPX/1/1">\n${body}\n</gpx>\n`
}
