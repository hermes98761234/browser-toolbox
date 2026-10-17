export type LL = [number, number] // [lat, lon]
export interface Fix { lat: number; lon: number; t: number; acc: number }

const R = 6371008.8 // mean Earth radius, m
const rad = (d: number) => (d * Math.PI) / 180

/** Great-circle distance in metres (haversine). */
export function haversine(a: LL, b: LL): number {
  const dLat = rad(b[0] - a[0])
  const dLon = rad(b[1] - a[1])
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Initial bearing from a to b in degrees (0 = north, clockwise). */
export function bearing(a: LL, b: LL): number {
  const y = Math.sin(rad(b[1] - a[1])) * Math.cos(rad(b[0]))
  const x = Math.cos(rad(a[0])) * Math.sin(rad(b[0])) - Math.sin(rad(a[0])) * Math.cos(rad(b[0])) * Math.cos(rad(b[1] - a[1]))
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}

export const compass = (deg: number) => ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(deg / 45) % 8]

export const pathLength = (pts: LL[]) => pts.reduce((a, p, i) => (i ? a + haversine(pts[i - 1], p) : 0), 0)

/** GPS jitter filter: drop inaccurate fixes, tiny moves and impossible jumps. */
export function acceptFix(prev: Fix | undefined, f: Fix, maxAcc = 35, minMove = 4, maxSpeed = 12): boolean {
  if (!(f.acc <= maxAcc)) return false
  if (!prev) return true
  const d = haversine([prev.lat, prev.lon], [f.lat, f.lon])
  if (d < Math.max(minMove, Math.min(f.acc, prev.acc) * 0.5)) return false
  const dt = (f.t - prev.t) / 1000
  return dt <= 0 ? false : d / dt <= maxSpeed
}

// ── Web Mercator (OSM tile scheme, 256 px tiles) ──
export function project(ll: LL, z: number): [number, number] {
  const s = 256 * 2 ** z
  const lat = Math.max(-85.0511, Math.min(85.0511, ll[0]))
  const x = ((ll[1] + 180) / 360) * s
  const y = (0.5 - Math.log(Math.tan(Math.PI / 4 + rad(lat) / 2)) / (2 * Math.PI)) * s
  return [x, y]
}

export interface View { z: number; cx: number; cy: number; w: number; h: number }

/** Largest zoom (≤ maxZ) where all points fit into w×h minus padding; centred on their bounding box. */
export function fitView(pts: LL[], w: number, h: number, pad = 40, maxZ = 18): View {
  if (!pts.length) return { z: 2, ...center(project([20, 0], 2)), w, h }
  let z = maxZ
  for (; z > 1; z--) {
    const p = pts.map((x) => project(x, z))
    const xs = p.map((q) => q[0])
    const ys = p.map((q) => q[1])
    if (Math.max(...xs) - Math.min(...xs) <= w - 2 * pad && Math.max(...ys) - Math.min(...ys) <= h - 2 * pad) break
  }
  const p = pts.map((x) => project(x, z))
  const xs = p.map((q) => q[0])
  const ys = p.map((q) => q[1])
  return { z, cx: (Math.min(...xs) + Math.max(...xs)) / 2, cy: (Math.min(...ys) + Math.max(...ys)) / 2, w, h }
  function center(c: [number, number]) {
    return { cx: c[0], cy: c[1] }
  }
}

/** Screen position of a point in a view. */
export function toScreen(ll: LL, v: View): [number, number] {
  const [x, y] = project(ll, v.z)
  return [x - v.cx + v.w / 2, y - v.cy + v.h / 2]
}

/** Tiles covering the view: {x, y, z, sx, sy} with screen offsets. */
export function tiles(v: View): { x: number; y: number; z: number; sx: number; sy: number }[] {
  const out = []
  const n = 2 ** v.z
  const x0 = Math.floor((v.cx - v.w / 2) / 256)
  const x1 = Math.floor((v.cx + v.w / 2) / 256)
  const y0 = Math.max(0, Math.floor((v.cy - v.h / 2) / 256))
  const y1 = Math.min(n - 1, Math.floor((v.cy + v.h / 2) / 256))
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) out.push({ x: ((x % n) + n) % n, y, z: v.z, sx: x * 256 - v.cx + v.w / 2, sy: y * 256 - v.cy + v.h / 2 })
  return out
}

/** Metres per screen unit at a latitude and zoom. */
export const metresPerPx = (lat: number, z: number) => (2 * Math.PI * R * Math.cos(rad(lat))) / (256 * 2 ** z)

/** A nice round scale-bar length (m) not longer than maxM. */
export function niceScale(maxM: number): number {
  const p = 10 ** Math.floor(Math.log10(maxM))
  for (const m of [5, 2, 1]) if (m * p <= maxM) return m * p
  return p
}

/** Deterministic pseudo-random generator. */
export function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A wobbly loop of about `perimeter` metres around `c`, sampled every `step` metres. */
export function loopRoute(c: LL, seed: number, perimeter: number, step = 7): LL[] {
  const r = rng(seed)
  const ph = [r() * 6.28, r() * 6.28, r() * 6.28]
  const ecc = 0.6 + r() * 0.5
  const shape = (t: number) => 1 + 0.22 * Math.sin(3 * t + ph[0]) + 0.08 * Math.sin(7 * t + ph[1]) + 0.05 * Math.sin(11 * t + ph[2])
  // Estimate the base radius so the loop is ~perimeter long.
  const raw: [number, number][] = Array.from({ length: 721 }, (_, i) => {
    const t = (i / 720) * 2 * Math.PI
    return [Math.cos(t) * shape(t), Math.sin(t) * shape(t) * ecc]
  })
  let len = 0
  for (let i = 1; i < raw.length; i++) len += Math.hypot(raw[i][0] - raw[i - 1][0], raw[i][1] - raw[i - 1][1])
  const k = perimeter / len
  const out: LL[] = []
  let acc = 0
  for (let i = 0; i < raw.length; i++) {
    if (i) acc += Math.hypot(raw[i][0] - raw[i - 1][0], raw[i][1] - raw[i - 1][1]) * k
    if (i === 0 || acc >= step) {
      acc = i ? 0 : acc
      const dx = (raw[i][0] - 1) * k // start at the loop's east point offset to centre
      const dy = raw[i][1] * k
      out.push([c[0] + dy / 111320, c[1] + dx / (111320 * Math.cos(rad(c[0])))])
    }
  }
  return out
}

export function fmtDist(m: number, imperial: boolean): string {
  if (imperial) return m < 0.2 * 1609.344 ? `${Math.round(m * 3.28084)} ft` : `${(m / 1609.344).toFixed(2)} mi`
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(2)} km`
}

/** Pace as min:ss per km or per mile. */
export function fmtPace(m: number, sec: number, imperial: boolean): string {
  if (m < 10 || sec <= 0) return '—'
  const per = sec / (m / (imperial ? 1609.344 : 1000))
  return `${Math.floor(per / 60)}:${String(Math.round(per % 60)).padStart(2, '0')} /${imperial ? 'mi' : 'km'}`
}

/** Keep at most n points (uniform thinning, endpoints kept). */
export function thin<T>(pts: T[], n: number): T[] {
  if (pts.length <= n) return pts
  const out: T[] = []
  for (let i = 0; i < n; i++) out.push(pts[Math.round((i * (pts.length - 1)) / (n - 1))])
  return out
}

export function toGpx(name: string, pts: { lat: number; lon: number; t: number }[]): string {
  const seg = pts.map((p) => `<trkpt lat="${p.lat.toFixed(6)}" lon="${p.lon.toFixed(6)}"><time>${new Date(p.t).toISOString()}</time></trkpt>`).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Browser Toolbox" xmlns="http://www.topografix.com/GPX/1/1">\n<trk><name>${name.replace(/[<&>]/g, '')}</name><trkseg>\n${seg}\n</trkseg></trk>\n</gpx>\n`
}
