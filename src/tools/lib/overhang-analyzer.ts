// Overhang analysis for 3D printing: orientation, per-face overhang angle, support estimate, auto-orientation.
// Model space is Z-up, millimetres; triangles as flat xyz triplets (non-indexed).

const D = Math.PI / 180

/** Rotates by Euler X→Y→Z (degrees), then drops onto z = 0 and centres X/Y on the origin. */
export function transform(pos: Float32Array, rx: number, ry: number, rz: number): Float32Array {
  const [a, b, c] = [rx * D, ry * D, rz * D]
  const [ca, sa, cb, sb, cc, s] = [Math.cos(a), Math.sin(a), Math.cos(b), Math.sin(b), Math.cos(c), Math.sin(c)]
  // R = Rz · Ry · Rx
  const m = [
    cc * cb, cc * sb * sa - s * ca, cc * sb * ca + s * sa,
    s * cb, s * sb * sa + cc * ca, s * sb * ca - cc * sa,
    -sb, cb * sa, cb * ca,
  ]
  const out = new Float32Array(pos.length)
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < pos.length; i += 3) {
    const x = pos[i], y = pos[i + 1], z = pos[i + 2]
    for (let k = 0; k < 3; k++) {
      const v = m[3 * k] * x + m[3 * k + 1] * y + m[3 * k + 2] * z
      out[i + k] = v
      if (v < lo[k]) lo[k] = v
      if (v > hi[k]) hi[k] = v
    }
  }
  const off = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, lo[2]]
  for (let i = 0; i < out.length; i += 3) for (let k = 0; k < 3; k++) out[i + k] -= off[k]
  return out
}

export interface Analysis {
  /** Per face: 0 fine, 1 close to the limit, 2 needs support, 3 on the bed. */
  cls: Uint8Array
  /** Per face overhang angle from vertical in degrees (90 = flat ceiling, negative = facing up). */
  alpha: Float32Array
  area: number
  overhangArea: number
  /** Overhang area projected onto the bed. */
  shadow: number
  /** Rough support volume: Σ projected area × height above the bed (mm³). */
  supportVolume: number
  bedArea: number
  size: [number, number, number]
}

export function analyze(pos: Float32Array, threshold: number, bedTol = 0.05, warnBand = 10): Analysis {
  const n = pos.length / 9
  const cls = new Uint8Array(n)
  const alpha = new Float32Array(n)
  let area = 0, oh = 0, shadow = 0, vol = 0, bed = 0
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < pos.length; i += 3)
    for (let k = 0; k < 3; k++) {
      lo[k] = Math.min(lo[k], pos[i + k])
      hi[k] = Math.max(hi[k], pos[i + k])
    }
  const z0 = lo[2]
  for (let f = 0; f < n; f++) {
    const o = f * 9
    const ux = pos[o + 3] - pos[o], uy = pos[o + 4] - pos[o + 1], uz = pos[o + 5] - pos[o + 2]
    const vx = pos[o + 6] - pos[o], vy = pos[o + 7] - pos[o + 1], vz = pos[o + 8] - pos[o + 2]
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
    const len = Math.hypot(nx, ny, nz)
    if (len === 0) continue
    const A = len / 2
    area += A
    const a = Math.asin(Math.max(-1, Math.min(1, -nz / len))) / D
    alpha[f] = a
    const zmax = Math.max(pos[o + 2], pos[o + 5], pos[o + 8]) - z0
    const zc = (pos[o + 2] + pos[o + 5] + pos[o + 8]) / 3 - z0
    if (a > 89 && zmax <= bedTol) {
      cls[f] = 3
      bed += A
    } else if (a > threshold) {
      cls[f] = 2
      oh += A
      const p = (A * -nz) / len
      shadow += p
      vol += p * zc
    } else if (a > threshold - warnBand) cls[f] = 1
  }
  return { cls, alpha, area, overhangArea: oh, shadow, supportVolume: vol, bedArea: bed, size: [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]] }
}

/**
 * Searches X/Y rotations (Z does not change overhangs) for the lowest support volume, lightly penalising height.
 * Returns [rx, ry, supportVolume].
 */
export function autoOrient(pos: Float32Array, threshold: number, step = 15, maxFaces = 20000): [number, number, number] {
  const n = pos.length / 9
  const stride = Math.max(1, Math.ceil(n / maxFaces))
  const F: number[] = [] // nx ny nz area cx cy cz, then 9 vertex coords
  for (let f = 0; f < n; f += stride) {
    const o = f * 9
    const ux = pos[o + 3] - pos[o], uy = pos[o + 4] - pos[o + 1], uz = pos[o + 5] - pos[o + 2]
    const vx = pos[o + 6] - pos[o], vy = pos[o + 7] - pos[o + 1], vz = pos[o + 8] - pos[o + 2]
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
    const len = Math.hypot(nx, ny, nz)
    if (!len) continue
    F.push(nx / len, ny / len, nz / len, (len / 2) * stride, (pos[o] + pos[o + 3] + pos[o + 6]) / 3, (pos[o + 1] + pos[o + 4] + pos[o + 7]) / 3, (pos[o + 2] + pos[o + 5] + pos[o + 8]) / 3)
  }
  const sinT = Math.sin(threshold * D)
  let best: [number, number, number] = [0, 0, Infinity]
  for (let rx = 0; rx < 360; rx += step)
    for (let ry = 0; ry < 360; ry += step) {
      const sa = Math.sin(rx * D), ca = Math.cos(rx * D), sb = Math.sin(ry * D), cb = Math.cos(ry * D)
      const r0 = -sb, r1 = cb * sa, r2 = cb * ca
      let zmin = Infinity, zmax = -Infinity
      for (let i = 0; i < pos.length; i += 3 * stride) {
        const z = r0 * pos[i] + r1 * pos[i + 1] + r2 * pos[i + 2]
        if (z < zmin) zmin = z
        if (z > zmax) zmax = z
      }
      let vol = 0
      for (let k = 0; k < F.length; k += 7) {
        const nz = r0 * F[k] + r1 * F[k + 1] + r2 * F[k + 2]
        if (-nz > sinT) {
          const zc = r0 * F[k + 4] + r1 * F[k + 5] + r2 * F[k + 6] - zmin
          if (zc > 0.5) vol += F[k + 3] * -nz * zc
        }
      }
      const score = vol * (1 + 0.002 * (zmax - zmin))
      if (score < best[2] - 1e-6) best = [rx, ry, score]
    }
  return best
}

/** Surface of revolution from a (r, z) profile running bottom-centre → top-centre; outward winding. */
export function lathe(profile: [number, number][], seg = 64): Float32Array {
  const out: number[] = []
  const P = (i: number, j: number) => {
    const [r, z] = profile[i]
    const u = (j / seg) * Math.PI * 2
    return [r * Math.cos(u), r * Math.sin(u), z]
  }
  for (let i = 0; i + 1 < profile.length; i++)
    for (let j = 0; j < seg; j++) {
      const a = P(i, j), b = P(i, j + 1), c = P(i + 1, j + 1), d = P(i + 1, j)
      if (profile[i][0] > 0) out.push(...a, ...b, ...c)
      if (profile[i + 1][0] > 0) out.push(...a, ...c, ...d)
    }
  return new Float32Array(out)
}

/** Chess-pawn-like sample with a sharp collar overhang and a domed head. */
export function samplePawn(): Float32Array {
  const prof: [number, number][] = [[0, 0], [14, 0], [14, 3], [11, 5], [7, 9], [5.5, 24], [13, 26], [13, 28.5], [6, 30]]
  for (let k = 0; k < 12; k++) {
    const t = -0.6 + (k / 12) * (Math.PI / 2 + 0.6)
    prof.push([9 * Math.cos(t), 38 + 9 * Math.sin(t)])
  }
  prof.push([0, 47])
  return lathe(prof, 72)
}

/** Arch / bridge: a box with a tunnel (good for showing flat bridges). */
export function sampleBridge(L = 60, W = 20, H = 30, span = 30, clear = 18): Float32Array {
  const out: number[] = []
  const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => {
    const v = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]
    const f = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]]
    for (const t of f) for (const i of t) out.push(...v[i])
  }
  const leg = (L - span) / 2
  box(0, 0, 0, leg, W, H)
  box(L - leg, 0, 0, L, W, H)
  box(leg, 0, clear, L - leg, W, H)
  return new Float32Array(out)
}
