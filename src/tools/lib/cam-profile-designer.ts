// Disc cam synthesis: follower motion laws (SVAJ), roller/knife/flat-face profiles, pressure angle, curvature.
// Angles in degrees at the API, radians inside. Displacements in mm.

export type Law = 'cycloidal' | 'harmonic' | 'poly345' | 'poly4567' | 'parabolic' | 'linear'
export type Follower = 'roller' | 'knife' | 'flat'

export const LAWS: [Law, string][] = [
  ['cycloidal', 'Cycloidal'],
  ['harmonic', 'Simple harmonic'],
  ['poly345', '3-4-5 polynomial'],
  ['poly4567', '4-5-6-7 polynomial'],
  ['parabolic', 'Parabolic (const. accel.)'],
  ['linear', 'Constant velocity'],
]

/** Normalised rise f(u), u ∈ [0,1] → [f, f', f'', f'''] (derivatives w.r.t. u). */
export function lawF(law: Law, u: number): [number, number, number, number] {
  const P = Math.PI
  switch (law) {
    case 'cycloidal':
      return [u - Math.sin(2 * P * u) / (2 * P), 1 - Math.cos(2 * P * u), 2 * P * Math.sin(2 * P * u), 4 * P * P * Math.cos(2 * P * u)]
    case 'harmonic':
      return [(1 - Math.cos(P * u)) / 2, (P / 2) * Math.sin(P * u), ((P * P) / 2) * Math.cos(P * u), -((P * P * P) / 2) * Math.sin(P * u)]
    case 'poly345':
      return [10 * u ** 3 - 15 * u ** 4 + 6 * u ** 5, 30 * u ** 2 - 60 * u ** 3 + 30 * u ** 4, 60 * u - 180 * u ** 2 + 120 * u ** 3, 60 - 360 * u + 360 * u ** 2]
    case 'poly4567':
      return [
        35 * u ** 4 - 84 * u ** 5 + 70 * u ** 6 - 20 * u ** 7,
        140 * u ** 3 - 420 * u ** 4 + 420 * u ** 5 - 140 * u ** 6,
        420 * u ** 2 - 1680 * u ** 3 + 2100 * u ** 4 - 840 * u ** 5,
        840 * u - 5040 * u ** 2 + 8400 * u ** 3 - 4200 * u ** 4,
      ]
    case 'parabolic':
      return u < 0.5 ? [2 * u * u, 4 * u, 4, 0] : [1 - 2 * (1 - u) ** 2, 4 * (1 - u), -4, 0]
    case 'linear':
      return [u, 1, 0, 0]
  }
}

export interface Segment { deg: number; lift: number; law: Law }

export interface Sample {
  deg: number
  /** displacement mm, ds/dθ mm/rad, d²s/dθ² mm/rad², d³s/dθ³ mm/rad³ */
  s: number; v: number; a: number; j: number
}

/** Samples the displacement diagram at `n` points over 360°. Segment spans are scaled to 360° total. */
export function svaj(segs: Segment[], start: number, n = 720): Sample[] {
  const tot = segs.reduce((t, g) => t + Math.max(0, g.deg), 0) || 360
  const k = 360 / tot
  const out: Sample[] = []
  for (let i = 0; i < n; i++) {
    const deg = (i * 360) / n
    let acc = 0, from = start, done = false
    for (const g of segs) {
      const span = Math.max(0, g.deg) * k
      if (deg < acc + span || g === segs[segs.length - 1]) {
        const h = g.lift - from
        const beta = (span * Math.PI) / 180
        const u = span > 0 ? Math.min(1, (deg - acc) / span) : 1
        const [f, f1, f2, f3] = lawF(g.law, u)
        out.push(beta > 0 ? { deg, s: from + h * f, v: (h * f1) / beta, a: (h * f2) / beta ** 2, j: (h * f3) / beta ** 3 } : { deg, s: g.lift, v: 0, a: 0, j: 0 })
        done = true
        break
      }
      acc += span
      from = g.lift
    }
    if (!done) out.push({ deg, s: start, v: 0, a: 0, j: 0 })
  }
  return out
}

export interface Profile {
  /** cam surface in the cam frame (mm) */
  surface: [number, number][]
  /** pitch curve (roller centre path) in the cam frame */
  pitch: [number, number][]
  /** pressure angle per sample (deg) */
  pressure: number[]
  /** radius of curvature of the cam surface per sample (mm, + convex, − concave) */
  rho: number[]
  undercut: boolean
}

const rot = (x: number, y: number, t: number): [number, number] => [x * Math.cos(t) - y * Math.sin(t), x * Math.sin(t) + y * Math.cos(t)]

/**
 * Cam rotating counter-clockwise by θ; translating follower along +y with offset e (x = e).
 * Profile is expressed in the cam's own frame (the follower point rotated back by −θ).
 */
export function profile(samples: Sample[], fol: Follower, rb: number, rr: number, e: number): Profile {
  const N = samples.length
  const pitch: [number, number][] = []
  const surface: [number, number][] = []
  const pressure: number[] = []
  const rho: number[] = []
  if (fol === 'flat') {
    for (const p of samples) {
      const t = (p.deg * Math.PI) / 180
      // contact point in follower frame: x = ds/dθ, y = rb + s (face perpendicular to motion)
      surface.push(rot(p.v, rb + p.s, -t))
      pitch.push(rot(0, rb + p.s, -t))
      pressure.push(0)
      rho.push(rb + p.s + p.a)
    }
    return { surface, pitch, pressure, rho, undercut: rho.some((r) => r <= 0) }
  }
  const R = fol === 'roller' ? rr : 0
  const s0 = Math.sqrt(Math.max(0, (rb + R) ** 2 - e * e))
  for (const p of samples) {
    const t = (p.deg * Math.PI) / 180
    pitch.push(rot(e, s0 + p.s, -t))
    pressure.push((Math.atan2(p.v - e, s0 + p.s) * 180) / Math.PI)
  }
  // surface: offset pitch curve inward by R along its normal; curvature numerically
  const h = (2 * Math.PI) / N
  for (let i = 0; i < N; i++) {
    const a = pitch[(i - 1 + N) % N], b = pitch[i], c = pitch[(i + 1) % N]
    const dx = (c[0] - a[0]) / (2 * h), dy = (c[1] - a[1]) / (2 * h)
    const ddx = (c[0] - 2 * b[0] + a[0]) / (h * h), ddy = (c[1] - 2 * b[1] + a[1]) / (h * h)
    const sp = Math.hypot(dx, dy) || 1e-12
    const cross = dx * ddy - dy * ddx
    const rp = sp ** 3 / (cross || 1e-12) // pitch-curve radius of curvature (sign by orientation)
    // inward normal: curve goes clockwise in cam frame (θ increasing, point rotated by −θ)
    const nx = dy / sp, ny = -dx / sp
    const inwardSign = b[0] * nx + b[1] * ny < 0 ? 1 : -1
    surface.push([b[0] + inwardSign * nx * R, b[1] + inwardSign * ny * R])
    rho.push(-rp - R) // −rp: pitch radius, positive where convex (clockwise traversal)
  }
  // undercutting: a convex pitch curve sharper than the roller (0 < ρ_pitch < R_roller)
  const undercut = rho.some((r) => r + R > 0 && r < 0) || (R === 0 && rho.some((r) => Math.abs(r) < 1e-3))
  return { surface, pitch, pressure, rho, undercut }
}

export interface Summary { maxS: number; maxV: number; maxA: number; minA: number; maxJ: number; maxPA: number; minRho: number }

export function summarize(samples: Sample[], prof: Profile): Summary {
  const ab = (k: 's' | 'v' | 'a' | 'j') => Math.max(...samples.map((p) => Math.abs(p[k])))
  const convex = prof.rho.filter((r) => r > 0)
  return {
    maxS: Math.max(...samples.map((p) => p.s)), maxV: ab('v'), maxA: Math.max(...samples.map((p) => p.a)), minA: Math.min(...samples.map((p) => p.a)), maxJ: ab('j'),
    maxPA: Math.max(...prof.pressure.map(Math.abs)), minRho: convex.length ? Math.min(...convex) : NaN,
  }
}

/** Jerk is infinite where a law's acceleration jumps (at segment ends or inside). */
export function accelJumps(samples: Sample[]): number {
  let mx = 0
  for (let i = 0; i < samples.length; i++) {
    const a = samples[i].a, b = samples[(i + 1) % samples.length].a
    mx = Math.max(mx, Math.abs(b - a))
  }
  return mx
}
