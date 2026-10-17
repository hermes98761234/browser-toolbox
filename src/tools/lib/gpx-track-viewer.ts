// GPX parsing, track statistics, simplification, export and Web Mercator helpers.

export interface TrkPt { lat: number; lon: number; ele?: number; time?: number }
export interface Track { name: string; points: TrkPt[] }
export interface Wpt { lat: number; lon: number; name: string }

const attr = (tag: string, name: string) => {
  const m = new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`).exec(tag)
  return m ? Number(m[1]) : NaN
}
const inner = (body: string, name: string) => {
  const m = new RegExp(`<(?:\\w+:)?${name}>([\\s\\S]*?)</(?:\\w+:)?${name}>`).exec(body)
  return m ? m[1].trim() : undefined
}
const unesc = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')

function points(body: string, tag: string): TrkPt[] {
  const out: TrkPt[] = []
  const re = new RegExp(`<${tag}\\b([^>]*?)(?:/>|>([\\s\\S]*?)</${tag}>)`, 'g')
  for (let m; (m = re.exec(body)); ) {
    const lat = attr(m[1], 'lat'), lon = attr(m[1], 'lon')
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
    const p: TrkPt = { lat, lon }
    const b = m[2] ?? ''
    const e = Number(inner(b, 'ele'))
    if (inner(b, 'ele') !== undefined && Number.isFinite(e)) p.ele = e
    const t = inner(b, 'time')
    if (t) {
      const ms = Date.parse(t)
      if (Number.isFinite(ms)) p.time = ms
    }
    out.push(p)
  }
  return out
}

/** Parses tracks (all segments joined per track), routes and waypoints. Throws on non-GPX input. */
export function parseGpx(xml: string): { tracks: Track[]; wpts: Wpt[] } {
  if (!/<gpx[\s>]/.test(xml)) throw new Error('Not a GPX file (no <gpx> root element).')
  const tracks: Track[] = []
  const blocks = (tag: string) => [...xml.matchAll(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'g'))].map((m) => m[1])
  blocks('trk').forEach((b, i) => {
    const pts = points(b, 'trkpt')
    if (pts.length) tracks.push({ name: unesc(inner(b.replace(/<trkseg[\s\S]*/, ''), 'name') ?? `Track ${i + 1}`), points: pts })
  })
  blocks('rte').forEach((b, i) => {
    const pts = points(b, 'rtept')
    if (pts.length) tracks.push({ name: unesc(inner(b.replace(/<rtept[\s\S]*/, ''), 'name') ?? `Route ${i + 1}`), points: pts })
  })
  const wpts: Wpt[] = []
  for (const m of xml.matchAll(/<wpt\b([^>]*?)(?:\/>|>([\s\S]*?)<\/wpt>)/g)) {
    const lat = attr(m[1], 'lat'), lon = attr(m[1], 'lon')
    if (Number.isFinite(lat) && Number.isFinite(lon)) wpts.push({ lat, lon, name: unesc(inner(m[2] ?? '', 'name') ?? 'Waypoint') })
  }
  return { tracks, wpts }
}

const R = 6371008.8
const rad = (d: number) => (d * Math.PI) / 180
export function haversine(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Cumulative distance (m) at each point. */
export function cumDist(p: TrkPt[]): number[] {
  const out = [0]
  for (let i = 1; i < p.length; i++) out.push(out[i - 1] + haversine(p[i - 1], p[i]))
  return out
}

export interface Stats {
  distance: number; duration: number; moving: number; avgMoving: number; maxSpeed: number
  gain: number; loss: number; minEle: number; maxEle: number; hasTime: boolean; hasEle: boolean
}

/** Track statistics. Elevation gain uses a hysteresis threshold to ignore GPS noise. */
export function trackStats(p: TrkPt[], threshold = 3, minSpeed = 0.5): Stats {
  const d = cumDist(p)
  const distance = d[d.length - 1] ?? 0
  const times = p.map((x) => x.time)
  const hasTime = p.length > 1 && times.every((t) => t !== undefined)
  let duration = 0, moving = 0, maxSpeed = 0
  if (hasTime) {
    duration = (times[times.length - 1]! - times[0]!) / 1000
    for (let i = 1; i < p.length; i++) {
      const dt = (times[i]! - times[i - 1]!) / 1000
      if (dt > 0 && (d[i] - d[i - 1]) / dt >= minSpeed) moving += dt
      // speed over a 3-point window damps single-fix spikes
      const j = Math.max(0, i - 2)
      const wdt = (times[i]! - times[j]!) / 1000
      if (wdt > 0) maxSpeed = Math.max(maxSpeed, (d[i] - d[j]) / wdt)
    }
  }
  const eles = p.map((x) => x.ele).filter((e): e is number => e !== undefined)
  const hasEle = eles.length > 1
  let gain = 0, loss = 0
  if (hasEle) {
    let ref = eles[0]
    for (const e of eles) {
      if (e - ref >= threshold) {
        gain += e - ref
        ref = e
      } else if (ref - e >= threshold) {
        loss += ref - e
        ref = e
      }
    }
  }
  return {
    distance, duration, moving, avgMoving: moving ? distance / moving : 0, maxSpeed, gain, loss,
    minEle: hasEle ? Math.min(...eles) : 0, maxEle: hasEle ? Math.max(...eles) : 0, hasTime, hasEle,
  }
}

/** Ramer–Douglas–Peucker simplification with tolerance in metres (local equirectangular projection). */
export function simplify(p: TrkPt[], tol: number): TrkPt[] {
  if (p.length < 3 || tol <= 0) return p
  const lat0 = rad(p[0].lat)
  const xy = p.map((q) => [rad(q.lon) * Math.cos(lat0) * R, rad(q.lat) * R])
  const keep = new Uint8Array(p.length)
  keep[0] = keep[p.length - 1] = 1
  const stack: [number, number][] = [[0, p.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()!
    const [ax, ay] = xy[a], [bx, by] = xy[b]
    const dx = bx - ax, dy = by - ay
    const len2 = dx * dx + dy * dy
    let best = -1, bd = 0
    for (let i = a + 1; i < b; i++) {
      const [px, py] = xy[i]
      const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0
      const dd = Math.hypot(px - ax - t * dx, py - ay - t * dy)
      if (dd > bd) {
        bd = dd
        best = i
      }
    }
    if (best > 0 && bd > tol) {
      keep[best] = 1
      stack.push([a, best], [best, b])
    }
  }
  return p.filter((_, i) => keep[i])
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
export function toGpx(name: string, p: TrkPt[], wpts: Wpt[] = []): string {
  const w = wpts.map((x) => `  <wpt lat="${x.lat.toFixed(7)}" lon="${x.lon.toFixed(7)}"><name>${esc(x.name)}</name></wpt>`).join('\n')
  const pts = p.map((q) => {
    const kids = (q.ele !== undefined ? `<ele>${q.ele.toFixed(1)}</ele>` : '') + (q.time !== undefined ? `<time>${new Date(q.time).toISOString()}</time>` : '')
    return `      <trkpt lat="${q.lat.toFixed(7)}" lon="${q.lon.toFixed(7)}">${kids}</trkpt>`
  }).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Browser Toolbox GPX Track Viewer" xmlns="http://www.topografix.com/GPX/1/1">
${w ? w + '\n' : ''}  <trk>
    <name>${esc(name)}</name>
    <trkseg>
${pts}
    </trkseg>
  </trk>
</gpx>
`
}

// Web Mercator (256-px tiles)
export const lon2x = (lon: number, z: number) => ((lon + 180) / 360) * 256 * 2 ** z
export const lat2y = (lat: number, z: number) => {
  const s = Math.sin(rad(Math.max(-85.0511, Math.min(85.0511, lat))))
  return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 256 * 2 ** z
}
export const x2lon = (x: number, z: number) => (x / (256 * 2 ** z)) * 360 - 180
export const y2lat = (y: number, z: number) => {
  const n = Math.PI - (2 * Math.PI * y) / (256 * 2 ** z)
  return (180 / Math.PI) * Math.atan(Math.sinh(n))
}

/** Largest integer zoom at which the bounding box fits in w×h pixels (with padding). */
export function fitZoom(p: { lat: number; lon: number }[], w: number, h: number, pad = 40): number {
  if (!p.length) return 2
  const lats = p.map((q) => q.lat), lons = p.map((q) => q.lon)
  for (let z = 18; z > 1; z--) {
    const dx = lon2x(Math.max(...lons), z) - lon2x(Math.min(...lons), z)
    const dy = lat2y(Math.min(...lats), z) - lat2y(Math.max(...lats), z)
    if (dx <= w - 2 * pad && dy <= h - 2 * pad) return z
  }
  return 1
}

/** A synthetic but realistic hiking loop with elevation and timestamps (used as the demo). */
export function demoTrack(): Track {
  const lat0 = 46.0207, lon0 = 7.7491 // Zermatt
  const pts: TrkPt[] = []
  const n = 320
  let t = Date.UTC(2025, 6, 12, 7, 30)
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2
    const r = 0.018 + 0.006 * Math.sin(3 * a) + 0.003 * Math.cos(7 * a)
    const lat = lat0 + r * Math.sin(a) * 0.9 + 0.012
    const lon = lon0 + r * Math.cos(a) * 1.3 - 0.022
    const ele = 1620 + 520 * Math.sin(a / 2) ** 2 + 35 * Math.sin(9 * a) + 8 * Math.sin(31 * a)
    const p: TrkPt = { lat, lon, ele: Math.round(ele * 10) / 10, time: t }
    if (pts.length) {
      const grade = (ele - (pts[pts.length - 1].ele ?? ele)) / Math.max(1, haversine(pts[pts.length - 1], p))
      const speed = Math.max(0.55, 1.35 - grade * 4) // slower uphill
      t += (haversine(pts[pts.length - 1], p) / speed) * 1000 + (i === 160 ? 25 * 60_000 : 0) // lunch stop
      t = Math.round(t / 1000) * 1000
      p.time = t
    }
    pts.push(p)
  }
  return { name: 'Zermatt loop (demo)', points: pts }
}
