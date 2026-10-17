// 3×3 matrix helpers for the linear transformation visualizer (row-major arrays of 9 numbers).

export type M3 = number[]
export type V3 = [number, number, number]
export interface Cx { re: number; im: number }

export const I3: M3 = [1, 0, 0, 0, 1, 0, 0, 0, 1]

export const apply = (m: M3, v: V3): V3 => [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]]

export const det3 = (m: M3) => m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6])
export const trace = (m: M3) => m[0] + m[4] + m[8]

export function mul(a: M3, b: M3): M3 {
  const r: M3 = []
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r.push(a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j])
  return r
}

export function inverse(m: M3): M3 | null {
  const d = det3(m)
  if (Math.abs(d) < 1e-12) return null
  const c = [
    m[4] * m[8] - m[5] * m[7], m[2] * m[7] - m[1] * m[8], m[1] * m[5] - m[2] * m[4],
    m[5] * m[6] - m[3] * m[8], m[0] * m[8] - m[2] * m[6], m[2] * m[3] - m[0] * m[5],
    m[3] * m[7] - m[4] * m[6], m[1] * m[6] - m[0] * m[7], m[0] * m[4] - m[1] * m[3],
  ]
  return c.map((x) => x / d)
}

export const lerp = (a: M3, b: M3, t: number): M3 => a.map((x, i) => x + (b[i] - x) * t)

export function rank(m: M3, tol = 1e-9): number {
  const a = [m.slice(0, 3), m.slice(3, 6), m.slice(6, 9)]
  const scale = Math.max(1e-300, ...m.map(Math.abs))
  let r = 0
  for (let c = 0; c < 3 && r < 3; c++) {
    let p = r
    for (let i = r + 1; i < 3; i++) if (Math.abs(a[i][c]) > Math.abs(a[p][c])) p = i
    if (Math.abs(a[p][c]) <= tol * scale) continue
    ;[a[r], a[p]] = [a[p], a[r]]
    for (let i = r + 1; i < 3; i++) {
      const f = a[i][c] / a[r][c]
      for (let k = c; k < 3; k++) a[i][k] -= f * a[r][k]
    }
    r++
  }
  return r
}

/** Real roots/complex pairs of x² + b x + c. */
export function quadRoots(b: number, c: number): Cx[] {
  const disc = b * b - 4 * c
  if (disc >= 0) {
    const s = Math.sqrt(disc)
    return [{ re: (-b + s) / 2, im: 0 }, { re: (-b - s) / 2, im: 0 }]
  }
  const s = Math.sqrt(-disc) / 2
  return [{ re: -b / 2, im: s }, { re: -b / 2, im: -s }]
}

/** Roots of x³ + a x² + b x + c (Cardano / trigonometric form). */
export function cubicRoots(a: number, b: number, c: number): Cx[] {
  const p = b - (a * a) / 3
  const q = (2 * a * a * a) / 27 - (a * b) / 3 + c
  const sh = -a / 3
  const disc = (q * q) / 4 + (p * p * p) / 27
  const eps = 1e-12 * Math.max(1, Math.abs(p) ** 1.5, Math.abs(q))
  if (Math.abs(disc) <= eps) {
    const u = Math.cbrt(-q / 2)
    return [{ re: 2 * u + sh, im: 0 }, { re: -u + sh, im: 0 }, { re: -u + sh, im: 0 }]
  }
  if (disc < 0) {
    const r = 2 * Math.sqrt(-p / 3)
    const phi = Math.acos(Math.max(-1, Math.min(1, (3 * q) / (p * r))))
    return [0, 1, 2].map((k) => ({ re: r * Math.cos(phi / 3 - (2 * Math.PI * k) / 3) + sh, im: 0 }))
  }
  const sd = Math.sqrt(disc)
  const u = Math.cbrt(-q / 2 + sd), v = Math.cbrt(-q / 2 - sd)
  const re = -(u + v) / 2 + sh, im = ((u - v) * Math.sqrt(3)) / 2
  return [{ re: u + v + sh, im: 0 }, { re, im }, { re, im: -im }]
}

/** Eigenvalues; in 2-D mode only the upper-left 2×2 block is used. */
export function eigenvalues(m: M3, twoD = false): Cx[] {
  if (twoD) return quadRoots(-(m[0] + m[4]), m[0] * m[4] - m[1] * m[3])
  const c2 = m[0] * m[4] - m[1] * m[3] + m[0] * m[8] - m[2] * m[6] + m[4] * m[8] - m[5] * m[7]
  return cubicRoots(-trace(m), c2, -det3(m))
}

const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const norm = (a: V3) => Math.hypot(...a)
/** Unit vector with its first non-zero component made positive (stable display). */
export const unit = (a: V3): V3 => {
  const n = norm(a)
  if (!n) return [0, 0, 0]
  const first = a.find((x) => Math.abs(x) > 1e-12 * n) ?? 1
  const s = first < 0 ? -n : n
  return [a[0] / s + 0, a[1] / s + 0, a[2] / s + 0]
}

/** Basis of the eigenspace for a real eigenvalue (1–3 unit vectors). */
export function eigenvectors(m: M3, lambda: number, twoD = false): V3[] {
  if (twoD) {
    const a = m[0] - lambda, b = m[1], c = m[3], d = m[4] - lambda
    const sc = Math.max(1, Math.abs(lambda), ...[m[0], m[1], m[3], m[4]].map(Math.abs))
    if (Math.max(Math.abs(a), Math.abs(b), Math.abs(c), Math.abs(d)) < 1e-9 * sc) return [[1, 0, 0], [0, 1, 0]]
    const v: V3 = Math.hypot(a, b) > Math.hypot(c, d) ? [-b, a, 0] : [-d, c, 0]
    return [unit(v)]
  }
  const A = m.map((x, i) => (i % 4 === 0 ? x - lambda : x))
  const r: V3[] = [[A[0], A[1], A[2]], [A[3], A[4], A[5]], [A[6], A[7], A[8]]]
  const sc = Math.max(1, Math.abs(lambda), ...m.map(Math.abs))
  const tol = 1e-7 * sc
  const cands = [cross(r[0], r[1]), cross(r[0], r[2]), cross(r[1], r[2])]
  const best = cands.reduce((x, y) => (norm(y) > norm(x) ? y : x))
  const rowMax = r.reduce((x, y) => (norm(y) > norm(x) ? y : x))
  if (norm(best) > tol * sc) return [unit(best)]
  if (norm(rowMax) < tol) return [[1, 0, 0], [0, 1, 0], [0, 0, 1]]
  // rank 1: eigenspace is the plane orthogonal to the non-zero row
  const n = unit(rowMax)
  const e: V3 = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]
  const v1 = unit(cross(n, e))
  return [v1, unit(cross(n, v1))]
}

export function classify(m: M3, twoD: boolean): string {
  const d = twoD ? m[0] * m[4] - m[1] * m[3] : det3(m)
  const sub = twoD ? [m[0], m[1], 0, m[3], m[4], 0, 0, 0, 1] : m
  const rk = rank(sub)
  const isI = sub.every((x, i) => Math.abs(x - I3[i]) < 1e-9)
  if (isI) return 'Identity: nothing moves.'
  const mt = [sub[0], sub[3], sub[6], sub[1], sub[4], sub[7], sub[2], sub[5], sub[8]]
  const orth = mul(mt, sub).every((x, i) => Math.abs(x - I3[i]) < 1e-6)
  if (orth) return d > 0 ? 'Rotation: lengths and angles are preserved, orientation kept (orthogonal, det = +1).' : 'Reflection (possibly with rotation): lengths preserved, orientation flipped (det = −1).'
  const sym = Math.abs(sub[1] - sub[3]) < 1e-9 && Math.abs(sub[2] - sub[6]) < 1e-9 && Math.abs(sub[5] - sub[7]) < 1e-9
  if (rk < 3) return `Singular (rank ${twoD ? rk - 1 : rk}): space is squashed onto a ${['point', 'line', 'plane'][twoD ? rk - 1 : rk] ?? 'lower dimension'}; not invertible.`
  if (sym) return 'Symmetric: stretches along perpendicular eigenvector directions (real eigenvalues).'
  if (Math.abs(Math.abs(d) - 1) < 1e-9) return d > 0 ? 'Volume-preserving (det = 1), e.g. a shear.' : 'Volume-preserving with flipped orientation.'
  return d < 0 ? 'General transformation that flips orientation (det < 0).' : 'General invertible transformation.'
}

export const fmtCx = (z: Cx, d = 3) => {
  const r = Number(z.re.toFixed(d))
  if (Math.abs(z.im) < 1e-9) return String(r === 0 ? 0 : r)
  const i = Number(Math.abs(z.im).toFixed(d))
  return `${r} ${z.im < 0 ? '−' : '+'} ${i}i`
}
