// Geodesic helpers for the field area measurer. Points are [lon, lat] in degrees (GeoJSON order).

export type LonLat = [number, number]
const RAD = Math.PI / 180
/** WGS84 equatorial radius — the same constant Turf.js uses for `area`. */
export const R_AREA = 6378137
/** Mean Earth radius for distances. */
export const R_MEAN = 6371008.8

/**
 * Spherical polygon area (m²) after Chamberlain & Duquette (JPL, 2007), as in Turf.js `area`.
 * The ring may be open or closed.
 */
export function ringArea(ring: LonLat[]): number {
  const pts = ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? ring.slice(0, -1) : ring
  const n = pts.length
  if (n < 3) return 0
  let total = 0
  for (let i = 0; i < n; i++) {
    const p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n]
    total += (p3[0] * RAD - p1[0] * RAD) * Math.sin(p2[1] * RAD)
  }
  return Math.abs((total * R_AREA * R_AREA) / 2)
}

/** Great-circle distance (m). */
export function haversine(a: LonLat, b: LonLat): number {
  const dLat = (b[1] - a[1]) * RAD, dLon = (b[0] - a[0]) * RAD
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * RAD) * Math.cos(b[1] * RAD) * Math.sin(dLon / 2) ** 2
  return 2 * R_MEAN * Math.asin(Math.min(1, Math.sqrt(h)))
}

export function perimeter(ring: LonLat[], closed = true): number {
  let p = 0
  for (let i = 1; i < ring.length; i++) p += haversine(ring[i - 1], ring[i])
  if (closed && ring.length > 2) p += haversine(ring[ring.length - 1], ring[0])
  return p
}

// Web Mercator (slippy-map) pixel coordinates at zoom z for 256-px tiles.
export const worldSize = (z: number) => 256 * 2 ** z
export function project([lon, lat]: LonLat, z: number): [number, number] {
  const s = worldSize(z)
  const la = Math.max(-85.0511, Math.min(85.0511, lat)) * RAD
  return [((lon + 180) / 360) * s, ((1 - Math.log(Math.tan(la) + 1 / Math.cos(la)) / Math.PI) / 2) * s]
}
export function unproject([x, y]: [number, number], z: number): LonLat {
  const s = worldSize(z)
  const lon = (x / s) * 360 - 180
  const lat = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / s))) / RAD
  return [lon, lat]
}

export const toGeoJSON = (ring: LonLat[], name: string) => ({
  type: 'Feature',
  properties: { name, area_m2: Math.round(ringArea(ring)), perimeter_m: Math.round(perimeter(ring)) },
  geometry: { type: 'Polygon', coordinates: [[...ring, ring[0]].map(([x, y]) => [+x.toFixed(7), +y.toFixed(7)])] },
})

export function toKml(ring: LonLat[], name: string): string {
  const coords = [...ring, ring[0]].map(([x, y]) => `${x.toFixed(7)},${y.toFixed(7)},0`).join(' ')
  const esc = name.replace(/[<&>]/g, (c) => ({ '<': '&lt;', '&': '&amp;', '>': '&gt;' })[c]!)
  return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark><name>${esc}</name><Polygon><outerBoundaryIs><LinearRing><coordinates>${coords}</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark></Document></kml>\n`
}

/** Extracts the first polygon ring from GeoJSON (Feature, FeatureCollection, Polygon, MultiPolygon). */
export function ringFromGeoJSON(g: unknown): LonLat[] | null {
  const o = g as { type?: string; features?: unknown[]; geometry?: unknown; coordinates?: unknown }
  if (!o || typeof o !== 'object') return null
  if (o.type === 'FeatureCollection') {
    for (const f of o.features ?? []) {
      const r = ringFromGeoJSON(f)
      if (r) return r
    }
    return null
  }
  if (o.type === 'Feature') return ringFromGeoJSON(o.geometry)
  const c = o.coordinates as number[][][] | number[][][][]
  const ring = o.type === 'Polygon' ? (c as number[][][])[0] : o.type === 'MultiPolygon' ? (c as number[][][][])[0][0] : null
  if (!ring || ring.length < 4) return null
  return ring.slice(0, -1).map((p) => [p[0], p[1]] as LonLat)
}
