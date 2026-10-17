// Scene math for the sun path simulator: sun direction vectors, ray–box shadow tests, sun-hours grid.
import { sunPosition } from './golden-hour-planner'

const RAD = Math.PI / 180

/** Unit vector toward the sun. Scene axes: x = east, y = up, z = south (north is −z). */
export function sunDir(alt: number, az: number): [number, number, number] {
  const a = alt * RAD, z = az * RAD
  return [Math.cos(a) * Math.sin(z), Math.sin(a), -Math.cos(a) * Math.cos(z)]
}

/** Shadow length of a vertical object of height h (Infinity when the sun is down). */
export const shadowLength = (h: number, alt: number) => (alt > 0 ? h / Math.tan(alt * RAD) : Infinity)

export interface Box {
  x: number // center east (m)
  z: number // center south (m)
  w: number // width along local x
  d: number // depth along local z
  h: number // height
  rot: number // degrees, counter-clockwise seen from above
}

/** Does the ray origin + t·dir (t > 0) hit the box? Slab test in the box frame. */
export function rayHitsBox(o: [number, number, number], dir: [number, number, number], b: Box): boolean {
  const r = -b.rot * RAD
  const c = Math.cos(r), s = Math.sin(r)
  const ox = o[0] - b.x, oz = o[2] - b.z
  // world → box frame: rotate by −rot about +y (three.js rotation.y convention)
  const lo = [c * ox + s * oz, o[1], -s * ox + c * oz]
  const ld = [c * dir[0] + s * dir[2], dir[1], -s * dir[0] + c * dir[2]]
  const min = [-b.w / 2, 0, -b.d / 2], max = [b.w / 2, b.h, b.d / 2]
  let t0 = 1e-6, t1 = Infinity
  for (let k = 0; k < 3; k++) {
    if (Math.abs(ld[k]) < 1e-12) {
      if (lo[k] < min[k] || lo[k] > max[k]) return false
      continue
    }
    let ta = (min[k] - lo[k]) / ld[k], tb = (max[k] - lo[k]) / ld[k]
    if (ta > tb) [ta, tb] = [tb, ta]
    t0 = Math.max(t0, ta)
    t1 = Math.min(t1, tb)
    if (t0 > t1) return false
  }
  return true
}

/** Sun directions sampled over one day (only when above the horizon), each worth `stepMin` minutes. */
export function daySamples(start: number, lat: number, lng: number, stepMin = 15) {
  const out: { t: number; alt: number; az: number; dir: [number, number, number] }[] = []
  for (let m = stepMin / 2; m < 1440; m += stepMin) {
    const t = start + m * 60000
    const p = sunPosition(t, lat, lng)
    if (p.alt > 0) out.push({ t, alt: p.alt, az: p.az, dir: sunDir(p.alt, p.az) })
  }
  return out
}

/** Hours of direct sun on an n×n ground grid covering [−ext, ext]², at height y0. Row-major, row 0 = north (−z). */
export function sunHoursGrid(boxes: Box[], dirs: [number, number, number][], stepMin: number, ext: number, n: number, y0 = 0.05): Float32Array {
  const out = new Float32Array(n * n)
  const cell = (2 * ext) / n
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const o: [number, number, number] = [-ext + (i + 0.5) * cell, y0, -ext + (j + 0.5) * cell]
      // points inside a footprint are under a roof: no ground sun
      if (boxes.some((b) => rayHitsBox([o[0], -1, o[2]], [0, 1, 0], b) && b.h > 0)) {
        out[j * n + i] = -1
        continue
      }
      let lit = 0
      for (const d of dirs) if (!boxes.some((b) => rayHitsBox(o, d, b))) lit++
      out[j * n + i] = (lit * stepMin) / 60
    }
  return out
}
