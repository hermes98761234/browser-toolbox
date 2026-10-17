// Sun-hours over a yard: sun vectors from the SunCalc formulas, ray casting against
// box obstacles and trees (trunk box + spherical canopy), integrated over a day.
import { sunPosition } from './golden-hour-planner'

export interface Obstacle {
  id: string
  kind: 'box' | 'tree'
  name: string
  /** centre, metres; x = east, z = south (−z is the yard's "up" edge) */
  x: number
  z: number
  /** footprint (tree: canopy diameter in w) */
  w: number
  d: number
  /** height (tree: total height) */
  h: number
}

export type V3 = [number, number, number]
const RAD = Math.PI / 180

/** Unit vector pointing at the sun. `rot` = compass bearing of the yard's −z edge (0 = north). */
export function sunVec(alt: number, az: number, rot = 0): V3 {
  const a = (az - rot) * RAD, h = alt * RAD
  return [Math.sin(a) * Math.cos(h), Math.sin(h), -Math.cos(a) * Math.cos(h)]
}

export function hitBox(p: V3, d: V3, min: V3, max: V3): boolean {
  let t0 = 1e-6, t1 = Infinity
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-12) {
      if (p[i] < min[i] || p[i] > max[i]) return false
      continue
    }
    let a = (min[i] - p[i]) / d[i], b = (max[i] - p[i]) / d[i]
    if (a > b) [a, b] = [b, a]
    t0 = Math.max(t0, a)
    t1 = Math.min(t1, b)
    if (t0 > t1) return false
  }
  return true
}

export function hitSphere(p: V3, d: V3, c: V3, r: number): boolean {
  const o = [p[0] - c[0], p[1] - c[1], p[2] - c[2]]
  const b = o[0] * d[0] + o[1] * d[1] + o[2] * d[2]
  const cc = o[0] * o[0] + o[1] * o[1] + o[2] * o[2] - r * r
  const disc = b * b - cc
  if (disc < 0) return false
  return -b + Math.sqrt(disc) > 0
}

/** Canopy geometry of a tree obstacle. */
export function treeParts(o: Obstacle) {
  const r = Math.max(0.2, Math.min(o.w / 2, o.h / 2))
  return { r, cy: o.h - r, trunkH: o.h - r, trunkR: Math.max(0.1, r * 0.12) }
}

export function shaded(p: V3, d: V3, obs: Obstacle[]): boolean {
  for (const o of obs) {
    if (o.kind === 'box') {
      if (hitBox(p, d, [o.x - o.w / 2, 0, o.z - o.d / 2], [o.x + o.w / 2, o.h, o.z + o.d / 2])) return true
    } else {
      const t = treeParts(o)
      if (hitSphere(p, d, [o.x, t.cy, o.z], t.r)) return true
      if (hitBox(p, d, [o.x - t.trunkR, 0, o.z - t.trunkR], [o.x + t.trunkR, t.trunkH, o.z + t.trunkR])) return true
    }
  }
  return false
}

/** UTC ms of local solar midnight for a YYYY-MM-DD date at longitude `lng`. */
export function solarMidnight(date: string, lng: number): number {
  const [y, m, d] = date.split('-').map(Number)
  return Date.UTC(y, m - 1, d) - (lng / 360) * 86400000
}

export interface Exposure {
  nx: number
  nz: number
  cell: number
  /** sun hours per cell, row-major (z rows, x columns) */
  hours: Float32Array
  dayLength: number
  /** [solar hour, fraction of yard in sun] */
  hourly: [number, number][]
}

export function exposure(o: { width: number; depth: number; cell: number; obstacles: Obstacle[]; lat: number; lng: number; date: string; rot: number; stepMin?: number }): Exposure {
  const step = o.stepMin ?? 10
  const nx = Math.max(1, Math.round(o.width / o.cell)), nz = Math.max(1, Math.round(o.depth / o.cell))
  const cw = o.width / nx, cd = o.depth / nz
  const hours = new Float32Array(nx * nz)
  const t0 = solarMidnight(o.date, o.lng)
  const hourly: [number, number][] = []
  let dayLength = 0
  // only obstacles above ground and with size
  const obs = o.obstacles.filter((b) => b.h > 0 && b.w > 0 && (b.kind === 'tree' || b.d > 0))
  for (let m = step / 2; m < 1440; m += step) {
    const sp = sunPosition(t0 + m * 60000, o.lat, o.lng)
    if (sp.alt <= 0) {
      if (m % 60 < step) hourly.push([m / 60, 0])
      continue
    }
    dayLength += step / 60
    const d = sunVec(sp.alt, sp.az, o.rot)
    let lit = 0
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const p: V3 = [-o.width / 2 + (i + 0.5) * cw, 0.05, -o.depth / 2 + (j + 0.5) * cd]
        if (!shaded(p, d, obs)) {
          hours[j * nx + i] += step / 60
          lit++
        }
      }
    }
    if (m % 60 < step) hourly.push([m / 60, lit / (nx * nz)])
  }
  return { nx, nz, cell: cw, hours, dayLength, hourly }
}

/** Gardening light categories by daily direct sun hours. */
export function category(h: number): 'Full sun' | 'Part sun' | 'Part shade' | 'Full shade' {
  return h >= 6 ? 'Full sun' : h >= 4 ? 'Part sun' : h >= 2 ? 'Part shade' : 'Full shade'
}
