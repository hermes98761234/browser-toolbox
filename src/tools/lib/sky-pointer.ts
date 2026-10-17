// "What's that bright light?": bright objects above the horizon, tangent-plane projection around where the phone points,
// nearest-object identification and turn/tilt guidance. Astronomy and the catalogue come from ./night-sky-planner.
import { bodies, moonHz, refraction, stars, toHorizontal, type Eq } from './night-sky-planner'
import { separation } from './star-map-viewer'

const RAD = Math.PI / 180
export interface Look { az: number; alt: number }
export interface Thing { key: string; name: string; kind: 'star' | 'planet' | 'moon' | 'sun'; mag: number; alt: number; az: number; eq: Eq; color: string }

/** Everything brighter than `magLimit` (named stars, planets, Moon, Sun), with current altitude/azimuth. */
export function skyNow(ms: number, lat: number, lon: number, magLimit = 2.5): Thing[] {
  const out: Thing[] = []
  stars().forEach((s, i) => {
    if (s.mag > magLimit) return
    const h = toHorizontal(s, ms, lat, lon)
    out.push({ key: `s${i}`, name: s.name ?? `Star (mag ${s.mag.toFixed(1)})`, kind: 'star', mag: s.mag, alt: h.alt + refraction(h.alt), az: h.az, eq: { ra: s.ra, dec: s.dec }, color: '#f8fafc' })
  })
  for (const b of bodies(ms)) {
    if (b.mag > magLimit + 1 && b.name !== 'Moon') continue
    const h = b.name === 'Moon' ? moonHz(ms, lat, lon) : toHorizontal(b.eq, ms, lat, lon)
    const alt = b.name === 'Moon' ? h.alt : h.alt + refraction(h.alt)
    out.push({ key: b.name, name: b.name, kind: b.name === 'Moon' ? 'moon' : b.name === 'Sun' ? 'sun' : 'planet', mag: b.mag, alt, az: h.az, eq: b.eq, color: b.color })
  }
  return out
}

const vec = (az: number, alt: number): [number, number, number] => [Math.cos(alt * RAD) * Math.sin(az * RAD), Math.cos(alt * RAD) * Math.cos(az * RAD), Math.sin(alt * RAD)]
const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

/** Gnomonic projection centred on `look`: returns screen (x, y) in units of tan(angle), y up; null if behind. */
export function projector(look: Look) {
  const f = vec(look.az, look.alt)
  // right = east-ish horizontal perpendicular to the azimuth, up = f × right (works at the zenith too)
  const r = [Math.cos(look.az * RAD), -Math.sin(look.az * RAD), 0]
  const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]]
  return (az: number, alt: number): [number, number] | null => {
    const v = vec(az, alt)
    const z = dot(v, f)
    if (z <= 0.05) return null
    return [dot(v, r) / z, dot(v, u) / z]
  }
}

export const angleTo = (look: Look, t: { az: number; alt: number }) => separation(look.az, look.alt, t.az, t.alt)

/** Brightness-weighted nearest object to the pointing direction within `maxDeg`. */
export function identify(list: Thing[], look: Look, maxDeg = 8): Thing | null {
  let best: Thing | null = null, score = Infinity
  for (const t of list) {
    if (t.alt < -1 || t.kind === 'sun') continue
    const d = angleTo(look, t)
    if (d > maxDeg) continue
    const sc = d + 0.8 * t.mag // a brighter object slightly further away still wins
    if (sc < score) { score = sc; best = t }
  }
  return best
}

/** How to move the phone from `look` to `t`: signed azimuth turn (+ = right/clockwise) and tilt (+ = up). */
export function guidance(look: Look, t: { az: number; alt: number }) {
  const dAz = ((t.az - look.az + 540) % 360) - 180
  const dAlt = t.alt - look.alt
  const parts: string[] = []
  if (Math.abs(dAz) >= 2) parts.push(`turn ${dAz > 0 ? 'right' : 'left'} ${Math.round(Math.abs(dAz))}°`)
  if (Math.abs(dAlt) >= 2) parts.push(`tilt ${dAlt > 0 ? 'up' : 'down'} ${Math.round(Math.abs(dAlt))}°`)
  return { dAz, dAlt, text: parts.length ? parts.join(' and ') : 'you are on it' }
}

/** Screen-space arrow angle (radians, 0 = right, counter-clockwise, y up) from the reticle towards the target. */
export const arrowAngle = (look: Look, t: { az: number; alt: number }) => {
  const g = guidance(look, t)
  return Math.atan2(g.dAlt, g.dAz * Math.cos(((look.alt + t.alt) / 2) * RAD))
}
