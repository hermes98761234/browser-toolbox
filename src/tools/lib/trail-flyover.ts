// Trail flyover helpers: Terrarium elevation tiles, terrain grids, local projection and path sampling.
import { cumDist, lat2y, lon2x, type TrkPt } from './gpx-track-viewer'

/** Terrarium PNG encoding (AWS / Mapzen elevation tiles): metres = R·256 + G + B/256 − 32768. */
export const decodeTerrarium = (r: number, g: number, b: number) => r * 256 + g + b / 256 - 32768

export interface BBox { minLat: number; maxLat: number; minLon: number; maxLon: number }

export function bbox(p: { lat: number; lon: number }[], margin = 0.2): BBox {
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity
  for (const q of p) {
    minLat = Math.min(minLat, q.lat)
    maxLat = Math.max(maxLat, q.lat)
    minLon = Math.min(minLon, q.lon)
    maxLon = Math.max(maxLon, q.lon)
  }
  // square-ish box in metres, padded
  const midLat = (minLat + maxLat) / 2
  const k = Math.cos((midLat * Math.PI) / 180)
  const h = maxLat - minLat, w = (maxLon - minLon) * k
  const side = Math.max(h, w, 0.002) * (1 + 2 * margin)
  const cLat = midLat, cLon = (minLon + maxLon) / 2
  return { minLat: cLat - side / 2, maxLat: cLat + side / 2, minLon: cLon - side / 2 / k, maxLon: cLon + side / 2 / k }
}

/** Highest zoom (≤ maxZ) whose tile cover of the box has at most `maxTiles` tiles. */
export function tileCover(b: BBox, maxTiles = 16, maxZ = 14) {
  for (let z = maxZ; z >= 1; z--) {
    const x0 = Math.floor(lon2x(b.minLon, z) / 256), x1 = Math.floor(lon2x(b.maxLon, z) / 256)
    const y0 = Math.floor(lat2y(b.maxLat, z) / 256), y1 = Math.floor(lat2y(b.minLat, z) / 256)
    if ((x1 - x0 + 1) * (y1 - y0 + 1) <= maxTiles) return { z, x0, x1, y0, y1 }
  }
  return { z: 1, x0: 0, x1: 1, y0: 0, y1: 1 }
}

/** Regular elevation grid over a bbox; row 0 = north edge. */
export interface Grid { n: number; b: BBox; ele: Float32Array; min: number; max: number }

export function gridFrom(b: BBox, n: number, sample: (lat: number, lon: number) => number): Grid {
  const ele = new Float32Array(n * n)
  let min = Infinity, max = -Infinity
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const lat = b.maxLat - (j / (n - 1)) * (b.maxLat - b.minLat)
      const lon = b.minLon + (i / (n - 1)) * (b.maxLon - b.minLon)
      const e = sample(lat, lon)
      ele[j * n + i] = e
      if (e < min) min = e
      if (e > max) max = e
    }
  return { n, b, ele, min, max }
}

/** Bilinear elevation lookup in a grid. */
export function gridAt(g: Grid, lat: number, lon: number): number {
  const fx = ((lon - g.b.minLon) / (g.b.maxLon - g.b.minLon)) * (g.n - 1)
  const fy = ((g.b.maxLat - lat) / (g.b.maxLat - g.b.minLat)) * (g.n - 1)
  const x = Math.min(g.n - 1.0001, Math.max(0, fx)), y = Math.min(g.n - 1.0001, Math.max(0, fy))
  const i = Math.floor(x), j = Math.floor(y), tx = x - i, ty = y - j
  const e = (a: number, b: number) => g.ele[b * g.n + a]
  return (e(i, j) * (1 - tx) + e(i + 1, j) * tx) * (1 - ty) + (e(i, j + 1) * (1 - tx) + e(i + 1, j + 1) * tx) * ty
}

/** Offline terrain: inverse-distance interpolation of track elevations plus hills rising away from the trail. */
export function syntheticGrid(p: TrkPt[], b: BBox, n = 96): Grid {
  const pts = p.filter((_, i) => i % Math.max(1, Math.floor(p.length / 120)) === 0)
  const k = Math.cos((((b.minLat + b.maxLat) / 2) * Math.PI) / 180)
  const eles = pts.map((q) => q.ele ?? 0)
  const range = Math.max(50, Math.max(...eles) - Math.min(...eles))
  const span = (b.maxLat - b.minLat) * 111000
  return gridFrom(b, n, (lat, lon) => {
    let wsum = 0, esum = 0, dmin = Infinity
    for (let i = 0; i < pts.length; i++) {
      const dy = (lat - pts[i].lat) * 111000, dx = (lon - pts[i].lon) * 111000 * k
      const d2 = dx * dx + dy * dy + 1
      dmin = Math.min(dmin, d2)
      const w = 1 / (d2 * d2)
      wsum += w
      esum += w * eles[i]
    }
    const away = Math.sqrt(dmin) / span
    const hills = 0.5 * range * (Math.sin(lat * 900) * Math.cos(lon * 700) + 0.5 * Math.sin(lat * 2100 + lon * 1700))
    return esum / wsum + away * range * 1.6 + away * hills
  })
}

/** Local metric projection centred on the bbox: x east, z south (metres). */
export function projector(b: BBox) {
  const lat0 = (b.minLat + b.maxLat) / 2, lon0 = (b.minLon + b.maxLon) / 2
  const k = Math.cos((lat0 * Math.PI) / 180)
  return (lat: number, lon: number): [number, number] => [(lon - lon0) * 111320 * k, -(lat - lat0) * 110540]
}

/** Point at distance `s` along a polyline with cumulative distances `cd`. */
export function along<T extends number[]>(pts: T[], cd: number[], s: number): number[] {
  if (s <= 0) return [...pts[0]]
  const L = cd[cd.length - 1]
  if (s >= L) return [...pts[pts.length - 1]]
  let lo = 0, hi = cd.length - 1
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1
    if (cd[m] <= s) lo = m
    else hi = m
  }
  const t = (s - cd[lo]) / (cd[hi] - cd[lo] || 1)
  return pts[lo].map((v, i) => v + (pts[hi][i] - v) * t)
}

export { cumDist }
