// Star map helpers: formatting, angular distance, constellation lookup and phone pointing direction.
// Star and constellation data and the astronomy come from ./night-sky-planner (derived from d3-celestial, BSD-3-Clause).
import { constellations, stars, type Eq, type Hz } from './night-sky-planner'

const RAD = Math.PI / 180
const pad = (n: number, w = 2) => String(n).padStart(w, '0')

export function formatRA(ra: number) {
  const h = (((ra % 360) + 360) % 360) / 15
  const hh = Math.floor(h), mm = Math.floor((h - hh) * 60), ss = Math.round(((h - hh) * 60 - mm) * 60)
  return ss === 60 ? `${hh}h ${pad(mm + 1)}m 00s` : `${hh}h ${pad(mm)}m ${pad(ss)}s`
}
export function formatDec(dec: number) {
  const a = Math.abs(dec), d = Math.floor(a), m = Math.round((a - d) * 60)
  return `${dec < 0 ? '−' : '+'}${m === 60 ? d + 1 : d}° ${pad(m === 60 ? 0 : m)}′`
}

/** Great-circle separation in degrees between two (lon, lat) style pairs, e.g. RA/Dec or Az/Alt. */
export function separation(lon1: number, lat1: number, lon2: number, lat2: number) {
  const p1 = lat1 * RAD, p2 = lat2 * RAD, dl = (lon2 - lon1) * RAD
  const a = Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2
  return (2 * Math.asin(Math.min(1, Math.sqrt(a)))) / RAD
}

/** Distance (deg) from point p to the great-circle arc a–b (short segments, so a planar approximation is fine). */
function segDist(p: Eq, a: Eq, b: Eq) {
  const cosd = Math.cos(p.dec * RAD)
  const wrap = (x: number) => ((x + 540) % 360) - 180
  const ax = wrap(a.ra - p.ra) * cosd, ay = a.dec - p.dec, bx = wrap(b.ra - p.ra) * cosd, by = b.dec - p.dec
  const dx = bx - ax, dy = by - ay
  const L = dx * dx + dy * dy
  const t = L > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / L)) : 0
  return Math.hypot(ax + t * dx, ay + t * dy)
}

/** Constellation whose stick figure passes closest to a sky position (a good proxy for "which constellation is this in"). */
export function nearestConstellation(p: Eq) {
  let best = { name: '', id: '', dist: Infinity }
  for (const c of constellations())
    for (const pl of c.lines)
      for (let i = 1; i < pl.length; i++) {
        const d = segDist(p, pl[i - 1], pl[i])
        if (d < best.dist) best = { name: c.name, id: c.id, dist: d }
      }
  return best
}

/**
 * Direction the back camera points, from W3C DeviceOrientation angles with an absolute (compass) alpha.
 * World frame: x east, y north, z up. Returns altitude and azimuth (north = 0, east = 90).
 */
export function lookDirection(alpha: number, beta: number, gamma: number): Hz {
  const a = alpha * RAD, b = beta * RAD, g = gamma * RAD
  const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cg = Math.cos(g), sg = Math.sin(g)
  const x = -ca * sg - sa * sb * cg, y = -sa * sg + ca * sb * cg, z = -cb * cg
  return { alt: Math.asin(Math.max(-1, Math.min(1, z))) / RAD, az: ((Math.atan2(x, y) / RAD) + 360) % 360 }
}

export interface SkyObject { key: string; name: string; kind: 'star' | 'planet' | 'moon' | 'sun' | 'constellation'; eq: Eq; mag: number }

/** Searchable catalogue: named stars and constellation centres (planets are added by the caller with live positions). */
export function catalogue(): SkyObject[] {
  const out: SkyObject[] = []
  stars().forEach((s, i) => { if (s.name) out.push({ key: `s${i}`, name: s.name, kind: 'star', eq: { ra: s.ra, dec: s.dec }, mag: s.mag }) })
  for (const c of constellations()) {
    let x = 0, y = 0, z = 0
    for (const pl of c.lines) for (const p of pl) {
      x += Math.cos(p.dec * RAD) * Math.cos(p.ra * RAD); y += Math.cos(p.dec * RAD) * Math.sin(p.ra * RAD); z += Math.sin(p.dec * RAD)
    }
    out.push({ key: `c${c.id}${c.name}`, name: c.name, kind: 'constellation', eq: { ra: ((Math.atan2(y, x) / RAD) + 360) % 360, dec: Math.atan2(z, Math.hypot(x, y)) / RAD }, mag: 99 })
  }
  return out
}

/** Fuzzy-ish search: prefix > word prefix > substring, brighter first. */
export function search(list: SkyObject[], q: string, max = 8) {
  const s = q.trim().toLowerCase()
  if (!s) return []
  const rank = (n: string) => { const l = n.toLowerCase(); return l.startsWith(s) ? 0 : l.split(/\s+/).some((w) => w.startsWith(s)) ? 1 : l.includes(s) ? 2 : 9 }
  return list.map((o) => ({ o, r: rank(o.name) })).filter((x) => x.r < 9).sort((a, b) => a.r - b.r || a.o.mag - b.o.mag).slice(0, max).map((x) => x.o)
}
