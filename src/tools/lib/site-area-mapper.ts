// Geodesy for the site area mapper: polygon area on the WGS84 ellipsoid (authalic-sphere excess),
// Vincenty inverse distances/bearings, validation and GeoJSON helpers. Points are [lon, lat] degrees.

export type LonLat = [number, number]

const RAD = Math.PI / 180
export const WGS84 = { a: 6378137, f: 1 / 298.257223563 }
const { a: A, f: F } = WGS84
const B = A * (1 - F)
const E2 = F * (2 - F)
const E = Math.sqrt(E2)

/** Authalic helper q(φ) (Snyder, Map Projections — A Working Manual, eq. 3-12). */
function q(phi: number): number {
  const s = Math.sin(phi)
  return (1 - E2) * (s / (1 - E2 * s * s) - (1 / (2 * E)) * Math.log((1 - E * s) / (1 + E * s)))
}
const QP = q(Math.PI / 2)
/** Radius of the sphere with the same surface area as the WGS84 ellipsoid (≈ 6371007.18 m). */
export const R_AUTHALIC = A * Math.sqrt(QP / 2)
/** Authalic latitude β (radians) for geodetic latitude φ (degrees). */
export const authalic = (latDeg: number) => Math.asin(Math.max(-1, Math.min(1, q(latDeg * RAD) / QP)))

const openRing = (ring: LonLat[]) =>
  ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? ring.slice(0, -1) : ring

/** Signed spherical excess of a ring on a unit sphere, edges as great circles (latitudes in radians). */
function excess(pts: [number, number][]): number {
  let sum = 0
  for (let i = 0; i < pts.length; i++) {
    const [l1, b1] = pts[i]
    const [l2, b2] = pts[(i + 1) % pts.length]
    let dl = l2 - l1
    if (dl > Math.PI) dl -= 2 * Math.PI
    if (dl < -Math.PI) dl += 2 * Math.PI
    const t1 = Math.tan(b1 / 2), t2 = Math.tan(b2 / 2)
    sum += 2 * Math.atan2(Math.tan(dl / 2) * (t1 + t2), 1 + t1 * t2)
  }
  return sum
}

/**
 * Area (m²) of a polygon on the WGS84 ellipsoid: vertices are mapped to authalic latitude, then the
 * spherical excess on the equal-area sphere is taken. Exact for equal-area mapping; edge shape differs from
 * true ellipsoidal geodesics by far less than 1 ppm for parcels.
 */
export function ellipsoidArea(ring: LonLat[]): number {
  const pts = openRing(ring)
  if (pts.length < 3) return 0
  return Math.abs(excess(pts.map(([lon, lat]) => [lon * RAD, authalic(lat)]))) * R_AUTHALIC * R_AUTHALIC
}

/** Area on a sphere of radius r (default 6378137 m, the convention used by Turf.js and many web maps). */
export function sphereArea(ring: LonLat[], r = A): number {
  const pts = openRing(ring)
  if (pts.length < 3) return 0
  return Math.abs(excess(pts.map(([lon, lat]) => [lon * RAD, lat * RAD]))) * r * r
}

/** Area of the quadrangle between two parallels and two meridians on the ellipsoid (reference value). */
export function quadArea(lat1: number, lat2: number, dLonDeg: number): number {
  return Math.abs(R_AUTHALIC ** 2 * dLonDeg * RAD * (Math.sin(authalic(lat2)) - Math.sin(authalic(lat1))))
}

/** Vincenty inverse on WGS84: distance (m) and initial/final bearings (degrees). */
export function vincenty(p1: LonLat, p2: LonLat): { dist: number; az1: number; az2: number } {
  const L = (p2[0] - p1[0]) * RAD
  const U1 = Math.atan((1 - F) * Math.tan(p1[1] * RAD))
  const U2 = Math.atan((1 - F) * Math.tan(p2[1] * RAD))
  const sU1 = Math.sin(U1), cU1 = Math.cos(U1), sU2 = Math.sin(U2), cU2 = Math.cos(U2)
  let lam = L, prev = 0, iter = 0
  let sS = 0, cS = 0, sig = 0, ca2 = 0, c2sm = 0, sl = 0, cl = 0
  do {
    sl = Math.sin(lam)
    cl = Math.cos(lam)
    sS = Math.sqrt((cU2 * sl) ** 2 + (cU1 * sU2 - sU1 * cU2 * cl) ** 2)
    if (sS === 0) return { dist: 0, az1: 0, az2: 0 }
    cS = sU1 * sU2 + cU1 * cU2 * cl
    sig = Math.atan2(sS, cS)
    const sa = (cU1 * cU2 * sl) / sS
    ca2 = 1 - sa * sa
    c2sm = ca2 ? cS - (2 * sU1 * sU2) / ca2 : 0
    const C = (F / 16) * ca2 * (4 + F * (4 - 3 * ca2))
    prev = lam
    lam = L + (1 - C) * F * sa * (sig + C * sS * (c2sm + C * cS * (-1 + 2 * c2sm * c2sm)))
  } while (Math.abs(lam - prev) > 1e-12 && ++iter < 200)
  const u2 = (ca2 * (A * A - B * B)) / (B * B)
  const Ak = 1 + (u2 / 16384) * (4096 + u2 * (-768 + u2 * (320 - 175 * u2)))
  const Bk = (u2 / 1024) * (256 + u2 * (-128 + u2 * (74 - 47 * u2)))
  const dS = Bk * sS * (c2sm + (Bk / 4) * (cS * (-1 + 2 * c2sm * c2sm) - (Bk / 6) * c2sm * (-3 + 4 * sS * sS) * (-3 + 4 * c2sm * c2sm)))
  const dist = B * Ak * (sig - dS)
  const az1 = Math.atan2(cU2 * sl, cU1 * sU2 - sU1 * cU2 * cl) / RAD
  const az2 = Math.atan2(cU1 * sl, -sU1 * cU2 + cU1 * sU2 * cl) / RAD
  return { dist, az1: (az1 + 360) % 360, az2: (az2 + 360) % 360 }
}

export function edges(ring: LonLat[]) {
  const pts = openRing(ring)
  return pts.map((p, i) => ({ from: i, to: (i + 1) % pts.length, ...vincenty(p, pts[(i + 1) % pts.length]) }))
}

export const perimeter = (ring: LonLat[]) => (openRing(ring).length < 2 ? 0 : edges(ring).reduce((s, e) => s + e.dist, 0))

/** Area-weighted centroid computed in a local equirectangular frame (fine for parcels). */
export function centroid(ring: LonLat[]): LonLat {
  const pts = openRing(ring)
  if (!pts.length) return [0, 0]
  const k = Math.cos(pts[0][1] * RAD)
  let a2 = 0, cx = 0, cy = 0
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = [pts[i][0] * k, pts[i][1]]
    const [x2, y2] = [pts[(i + 1) % pts.length][0] * k, pts[(i + 1) % pts.length][1]]
    const c = x1 * y2 - x2 * y1
    a2 += c
    cx += (x1 + x2) * c
    cy += (y1 + y2) * c
  }
  if (Math.abs(a2) < 1e-18) return [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length]
  return [cx / (3 * a2) / k, cy / (3 * a2)]
}

/** True when two non-adjacent edges cross (polygon is not simple → area is meaningless). */
export function selfIntersects(ring: LonLat[]): boolean {
  const p = openRing(ring)
  const n = p.length
  if (n < 4) return false
  const cross = (o: LonLat, a: LonLat, b: LonLat) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue
      const a = p[i], b = p[(i + 1) % n], c = p[j], d = p[(j + 1) % n]
      const d1 = cross(c, d, a), d2 = cross(c, d, b), d3 = cross(a, b, c), d4 = cross(a, b, d)
      if (d1 * d2 < 0 && d3 * d4 < 0) return true
    }
  }
  return false
}

/** Parses "lat, lon" lines (or "lon lat" when `lonFirst`); accepts commas, spaces, tabs or semicolons. */
export function parseCoords(text: string, lonFirst = false): LonLat[] {
  const out: LonLat[] = []
  for (const line of text.split(/\r?\n/)) {
    const nums = line.match(/-?\d+(?:\.\d+)?/g)
    if (!nums || nums.length < 2) continue
    const [u, v] = [Number(nums[0]), Number(nums[1])]
    const [lon, lat] = lonFirst ? [u, v] : [v, u]
    if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) out.push([lon, lat])
  }
  return out
}

export interface Parcel {
  id: string
  name: string
  color: string
  ring: LonLat[]
}

export function toGeoJSON(parcels: Parcel[]) {
  return {
    type: 'FeatureCollection',
    features: parcels
      .filter((p) => p.ring.length >= 3)
      .map((p) => ({
        type: 'Feature',
        properties: { name: p.name, area_m2: +ellipsoidArea(p.ring).toFixed(2), perimeter_m: +perimeter(p.ring).toFixed(2), stroke: p.color },
        geometry: { type: 'Polygon', coordinates: [[...p.ring, p.ring[0]].map(([x, y]) => [+x.toFixed(8), +y.toFixed(8)])] },
      })),
  }
}

/** Every outer polygon ring in a GeoJSON object, with a name if available. */
export function fromGeoJSON(g: unknown): { name: string; ring: LonLat[] }[] {
  const out: { name: string; ring: LonLat[] }[] = []
  const walk = (o: unknown, name: string) => {
    const x = o as { type?: string; features?: unknown[]; geometry?: unknown; geometries?: unknown[]; coordinates?: unknown; properties?: { name?: string } }
    if (!x || typeof x !== 'object') return
    if (x.type === 'FeatureCollection') x.features?.forEach((f, i) => walk(f, `Parcel ${i + 1}`))
    else if (x.type === 'Feature') walk(x.geometry, String(x.properties?.name ?? name))
    else if (x.type === 'GeometryCollection') x.geometries?.forEach((gg) => walk(gg, name))
    else if (x.type === 'Polygon') out.push({ name, ring: openRing(((x.coordinates as number[][][])[0] ?? []).map((p) => [p[0], p[1]] as LonLat)) })
    else if (x.type === 'MultiPolygon') (x.coordinates as number[][][][]).forEach((poly, i) => out.push({ name: `${name} ${i + 1}`, ring: openRing(poly[0].map((p) => [p[0], p[1]] as LonLat)) }))
  }
  walk(g, 'Parcel')
  return out.filter((p) => p.ring.length >= 3)
}

// Web Mercator pixel coordinates for 256-px slippy-map tiles.
export const worldSize = (z: number) => 256 * 2 ** z
export function project([lon, lat]: LonLat, z: number): [number, number] {
  const s = worldSize(z)
  const la = Math.max(-85.0511, Math.min(85.0511, lat)) * RAD
  return [((lon + 180) / 360) * s, ((1 - Math.log(Math.tan(la) + 1 / Math.cos(la)) / Math.PI) / 2) * s]
}
export function unproject([x, y]: [number, number], z: number): LonLat {
  const s = worldSize(z)
  return [(x / s) * 360 - 180, Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / s))) / RAD]
}
