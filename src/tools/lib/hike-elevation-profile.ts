// GPX / CSV route parsing, distance-elevation profile, climb statistics and hiking-time estimates.

export interface TrackPt {
  lat: number
  lon: number
  ele: number
  time?: number
}
export interface Route {
  name: string
  pts: TrackPt[]
}
export interface ProfilePt {
  /** Cumulative distance in metres. */
  d: number
  /** Elevation in metres (smoothed). */
  e: number
  lat: number
  lon: number
}

const attr = (tag: string, name: string) => {
  const m = new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`).exec(tag)
  return m ? Number(m[1]) : NaN
}

/** Parses track points (or route points) from GPX text without needing a DOM. */
export function parseGpx(text: string): Route {
  const name = /<name>\s*(?:<!\[CDATA\[)?([^<\]]*)/.exec(text)?.[1]?.trim() || 'Route'
  const pts: TrackPt[] = []
  const re = /<(trkpt|rtept)\b([^>]*?)(\/>|>([\s\S]*?)<\/\1>)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    const lat = attr(m[2], 'lat'), lon = attr(m[2], 'lon')
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
    const body = m[4] ?? ''
    const ele = Number(/<ele>\s*([-\d.eE+]+)\s*<\/ele>/.exec(body)?.[1])
    const t = /<time>\s*([^<]+)<\/time>/.exec(body)?.[1]
    pts.push({ lat, lon, ele: Number.isFinite(ele) ? ele : NaN, time: t ? Date.parse(t) : undefined })
  }
  // fill missing elevations from neighbours
  let last = pts.find((p) => Number.isFinite(p.ele))?.ele ?? 0
  for (const p of pts) {
    if (Number.isFinite(p.ele)) last = p.ele
    else p.ele = last
  }
  return { name, pts }
}

/** CSV with lat,lon,ele columns, or distance_km,elevation_m columns. */
export function parseCsv(text: string): Route {
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim())
  const head = lines[0].toLowerCase()
  const hasHead = /[a-z]/.test(head)
  const rows = (hasHead ? lines.slice(1) : lines).map((l) => l.split(/[,;\t]/).map((x) => Number(x.trim())))
  const pts: TrackPt[] = []
  if (rows[0]?.length >= 3 || /lat/.test(head)) {
    for (const r of rows) if (r.slice(0, 3).every(Number.isFinite)) pts.push({ lat: r[0], lon: r[1], ele: r[2] })
  } else {
    // distance (km), elevation: synthesise a straight north-bound line of that length
    for (const r of rows) if (Number.isFinite(r[0]) && Number.isFinite(r[1])) pts.push({ lat: 46 + (r[0] * 1000) / 111195, lon: 8, ele: r[1] })
  }
  return { name: 'CSV route', pts }
}

const R = 6371008.8
export function haversine(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const toR = Math.PI / 180
  const dLat = (b.lat - a.lat) * toR, dLon = (b.lon - a.lon) * toR
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toR) * Math.cos(b.lat * toR) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Distance-weighted moving average of elevation over ±`win` metres. */
export function profile(pts: TrackPt[], win = 50): ProfilePt[] {
  const d: number[] = [0]
  for (let i = 1; i < pts.length; i++) d.push(d[i - 1] + haversine(pts[i - 1], pts[i]))
  const out: ProfilePt[] = []
  let lo = 0, hi = 0, sum = 0
  for (let i = 0; i < pts.length; i++) {
    while (hi < pts.length && d[hi] <= d[i] + win) sum += pts[hi++].ele
    while (d[lo] < d[i] - win) sum -= pts[lo++].ele
    out.push({ d: d[i], e: win > 0 ? sum / (hi - lo) : pts[i].ele, lat: pts[i].lat, lon: pts[i].lon })
  }
  return out
}

/** Ascent and descent with a hysteresis threshold to ignore GPS noise. */
export function climb(e: number[], threshold = 3): { gain: number; loss: number } {
  let gain = 0, loss = 0
  if (!e.length) return { gain, loss }
  let ref = e[0]
  for (const v of e) {
    if (v - ref >= threshold) {
      gain += v - ref
      ref = v
    } else if (ref - v >= threshold) {
      loss += ref - v
      ref = v
    }
  }
  return { gain, loss }
}

/**
 * Naismith's rule (1 h per 5 km + 1 h per 600 m ascent) with Langmuir's descent corrections:
 * −10 min per 300 m on gentle descents (5°–12°), +10 min per 300 m on steep descents (> 12°). Hours.
 */
export function naismith(p: ProfilePt[], kmh = 5, climbRate = 600): { hours: number; base: number; ascent: number; descentAdj: number } {
  if (p.length < 2) return { hours: 0, base: 0, ascent: 0, descentAdj: 0 }
  const dist = p[p.length - 1].d - p[0].d
  const { gain } = climb(p.map((x) => x.e))
  let gentle = 0, steep = 0
  const step = 100
  let j = 0
  for (let i = 1; i < p.length; i++) {
    if (p[i].d - p[j].d < step && i < p.length - 1) continue
    const dh = p[j].e - p[i].e, dx = p[i].d - p[j].d
    if (dh > 0 && dx > 0) {
      const deg = (Math.atan2(dh, dx) * 180) / Math.PI
      if (deg > 12) steep += dh
      else if (deg >= 5) gentle += dh
    }
    j = i
  }
  const base = dist / 1000 / kmh
  const ascent = gain / climbRate
  const descentAdj = ((steep - gentle) / 300) * (10 / 60)
  return { hours: Math.max(0, base + ascent + descentAdj), base, ascent, descentAdj }
}

/** Tobler's hiking function: walking speed (km/h) on a slope dh/dx. */
export const tobler = (slope: number) => 6 * Math.exp(-3.5 * Math.abs(slope + 0.05))

export function toblerHours(p: ProfilePt[]): number {
  let h = 0
  for (let i = 1; i < p.length; i++) {
    const dx = p[i].d - p[i - 1].d
    if (dx <= 0) continue
    h += dx / 1000 / tobler((p[i].e - p[i - 1].e) / dx)
  }
  return h
}

/** Synthetic sample: a ~15 km loop with a ~800 m climb (as GPX text). */
export function sampleGpx(): string {
  const pts: string[] = []
  const N = 400
  for (let i = 0; i <= N; i++) {
    const t = i / N
    const ang = t * Math.PI * 2
    const r = 0.02 * (1 + 0.12 * Math.sin(ang * 3))
    const lat = 46.55 + r * Math.sin(ang)
    const lon = 7.98 + 1.45 * r * (1 - Math.cos(ang))
    const bump = t < 0.5 ? Math.sin((Math.PI / 2) * (t / 0.5)) ** 2 : Math.cos((Math.PI / 2) * ((t - 0.5) / 0.5)) ** 2
    const ele = 1050 + 760 * bump + 25 * Math.sin(ang * 7) * Math.sin(Math.PI * t)
    pts.push(`<trkpt lat="${lat.toFixed(6)}" lon="${lon.toFixed(6)}"><ele>${ele.toFixed(1)}</ele></trkpt>`)
  }
  return `<?xml version="1.0"?><gpx version="1.1" creator="Browser Toolbox"><trk><name>Alpine ridge loop (sample)</name><trkseg>${pts.join('')}</trkseg></trk></gpx>`
}
