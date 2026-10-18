// CSS transform functions as 4×4 matrices (CSS Transforms 1 & 2 definitions), composition, transform-origin,
// matrix3d() output and conversion to a y-up three.js object matrix.

export type Fn = 'translate3d' | 'translateX' | 'translateY' | 'translateZ' | 'rotateX' | 'rotateY' | 'rotateZ' | 'rotate3d' | 'scale3d' | 'scale' | 'skewX' | 'skewY' | 'perspective'
export interface TF { id: string; fn: Fn; v: number[] }
/** Row-major 4×4: m[r * 4 + c]; points are column vectors (p' = M · p). */
export type M4 = number[]

/** Parameter labels/units and defaults for the editor. */
export const SPEC: Record<Fn, { args: [string, string, number, number, number][] }> = {
  translate3d: { args: [['x', 'px', -300, 300, 0], ['y', 'px', -300, 300, 0], ['z', 'px', -300, 300, 0]] },
  translateX: { args: [['x', 'px', -300, 300, 0]] },
  translateY: { args: [['y', 'px', -300, 300, 0]] },
  translateZ: { args: [['z', 'px', -400, 400, 0]] },
  rotateX: { args: [['angle', 'deg', -180, 180, 0]] },
  rotateY: { args: [['angle', 'deg', -180, 180, 0]] },
  rotateZ: { args: [['angle', 'deg', -180, 180, 0]] },
  rotate3d: { args: [['x', '', -1, 1, 1], ['y', '', -1, 1, 1], ['z', '', -1, 1, 0], ['angle', 'deg', -180, 180, 45]] },
  scale3d: { args: [['x', '', -2, 3, 1], ['y', '', -2, 3, 1], ['z', '', -2, 3, 1]] },
  scale: { args: [['s', '', 0, 3, 1]] },
  skewX: { args: [['angle', 'deg', -80, 80, 0]] },
  skewY: { args: [['angle', 'deg', -80, 80, 0]] },
  perspective: { args: [['d', 'px', 50, 2000, 600]] },
}

export const I = (): M4 => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
const rad = (d: number) => (d * Math.PI) / 180
const r6 = (x: number) => { const v = Math.round(x * 1e6) / 1e6; return Object.is(v, -0) ? 0 : v }

export function mul(a: M4, b: M4): M4 {
  const o = new Array(16).fill(0)
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) for (let k = 0; k < 4; k++) o[r * 4 + c] += a[r * 4 + k] * b[k * 4 + c]
  return o
}

const T = (x: number, y: number, z: number): M4 => [1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z, 0, 0, 0, 1]
const S = (x: number, y: number, z: number): M4 => [x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1]

/** rotate3d per the CSS Transforms 2 matrix (normalised axis; a zero axis is the identity). */
export function rotate3d(x: number, y: number, z: number, deg: number): M4 {
  const n = Math.hypot(x, y, z)
  if (!n) return I()
  x /= n; y /= n; z /= n
  const a = rad(deg), sc = Math.sin(a / 2) * Math.cos(a / 2), sq = Math.sin(a / 2) ** 2
  return [
    1 - 2 * (y * y + z * z) * sq, 2 * (x * y * sq - z * sc), 2 * (x * z * sq + y * sc), 0,
    2 * (x * y * sq + z * sc), 1 - 2 * (x * x + z * z) * sq, 2 * (y * z * sq - x * sc), 0,
    2 * (x * z * sq - y * sc), 2 * (y * z * sq + x * sc), 1 - 2 * (x * x + y * y) * sq, 0,
    0, 0, 0, 1,
  ]
}

export function matrixOf(t: TF): M4 {
  const v = t.v
  switch (t.fn) {
    case 'translate3d': return T(v[0], v[1], v[2])
    case 'translateX': return T(v[0], 0, 0)
    case 'translateY': return T(0, v[0], 0)
    case 'translateZ': return T(0, 0, v[0])
    case 'rotateX': return rotate3d(1, 0, 0, v[0])
    case 'rotateY': return rotate3d(0, 1, 0, v[0])
    case 'rotateZ': return rotate3d(0, 0, 1, v[0])
    case 'rotate3d': return rotate3d(v[0], v[1], v[2], v[3])
    case 'scale3d': return S(v[0], v[1], v[2])
    case 'scale': return S(v[0], v[0], 1)
    case 'skewX': return [1, Math.tan(rad(v[0])), 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
    case 'skewY': return [1, 0, 0, 0, Math.tan(rad(v[0])), 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
    case 'perspective': { const m = I(); if (v[0] > 0) m[14] = -1 / Math.max(1, v[0]); return m }
  }
}

export function cssOf(t: TF): string {
  const n = (x: number) => r6(x)
  const u = SPEC[t.fn].args.map((a, i) => `${n(t.v[i])}${a[1]}`)
  return `${t.fn}(${u.join(', ')})`
}

/** Transform list → one matrix. "f1 f2 f3" means M = M1 · M2 · M3 (f3 is applied to the element first). */
export const compose = (list: TF[]): M4 => list.reduce((m, t) => mul(m, matrixOf(t)), I())

/** Effective matrix around a transform-origin (ox, oy, oz) given relative to the element's reference point. */
export const withOrigin = (m: M4, ox: number, oy: number, oz: number): M4 => mul(mul(T(ox, oy, oz), m), T(-ox, -oy, -oz))

/** CSS matrix3d() takes the 16 values column by column. */
export function toMatrix3d(m: M4): string {
  const out: number[] = []
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) out.push(r6(m[r * 4 + c]))
  return `matrix3d(${out.join(', ')})`
}

/** Applies M to a point with homogeneous division. */
export function apply(m: M4, p: [number, number, number]): [number, number, number] {
  const [x, y, z] = p
  const w = m[12] * x + m[13] * y + m[14] * z + m[15]
  return [0, 1, 2].map((r) => (m[r * 4] * x + m[r * 4 + 1] * y + m[r * 4 + 2] * z + m[r * 4 + 3]) / w) as [number, number, number]
}

/**
 * CSS space (px, y down, z toward the viewer) → three.js space (units, y up, z toward the camera):
 * conjugate by C = diag(1/k, −1/k, 1/k, 1).
 */
export function toThree(m: M4, k: number): M4 {
  const c = [1 / k, -1 / k, 1 / k, 1]
  return m.map((v, i) => (v * c[Math.floor(i / 4)]) / c[i % 4])
}

/** True when the transformed element's front faces away from the viewer (backface-visibility: hidden would hide it). */
export function facesAway(m: M4): boolean {
  // Normal of the element plane (0,0,1) transformed by the upper-left 3×3; in CSS z points to the viewer.
  const p0 = apply(m, [0, 0, 0]), px = apply(m, [1, 0, 0]), py = apply(m, [0, 1, 0])
  const ax = [px[0] - p0[0], px[1] - p0[1]], ay = [py[0] - p0[0], py[1] - p0[1]]
  return ax[0] * ay[1] - ax[1] * ay[0] < 0
}
