// Camera path timing: keyframes on a timeline, easing curves and the mapping from playback time
// to a Catmull-Rom curve parameter (three.js CatmullRomCurve3.getPoint(u) puts key i at u = i/(n-1)).

export type V3 = [number, number, number]
export interface Key { id: string; t: number; pos: V3; target: V3; fov: number }
export type Easing = 'linear' | 'inOut' | 'in' | 'out' | 'perKey'

export const EASINGS: [Easing, string][] = [
  ['linear', 'Linear (constant pace)'],
  ['inOut', 'Ease in-out (whole shot)'],
  ['in', 'Ease in (slow start)'],
  ['out', 'Ease out (slow finish)'],
  ['perKey', 'Ease at every key (pauses)'],
]

const smooth = (x: number) => x * x * (3 - 2 * x)
export function ease(kind: Easing, x: number): number {
  const v = Math.min(1, Math.max(0, x))
  if (kind === 'in') return v * v * v
  if (kind === 'out') return 1 - (1 - v) ** 3
  if (kind === 'inOut') return v < 0.5 ? 4 * v * v * v : 1 - (-2 * v + 2) ** 3 / 2
  return v
}

export const sortKeys = (keys: Key[]) => [...keys].sort((a, b) => a.t - b.t)
export const duration = (keys: Key[]) => (keys.length ? Math.max(...keys.map((k) => k.t)) : 0)

/** Segment index and fraction for time t (keys sorted by time). */
export function locate(keys: Key[], t: number, easing: Easing): { i: number; f: number; u: number } {
  const n = keys.length
  if (n < 2) return { i: 0, f: 0, u: 0 }
  const t0 = keys[0].t, t1 = keys[n - 1].t
  const span = t1 - t0 || 1
  // Whole-shot easings remap time first; per-key easing remaps inside each segment.
  const tt = easing === 'linear' || easing === 'perKey' ? t : t0 + span * ease(easing, (t - t0) / span)
  if (tt <= t0) return { i: 0, f: 0, u: 0 }
  if (tt >= t1) return { i: n - 2, f: 1, u: 1 }
  let i = 0
  while (i < n - 2 && tt >= keys[i + 1].t) i++
  const segLen = keys[i + 1].t - keys[i].t
  let f = segLen > 0 ? (tt - keys[i].t) / segLen : 1
  if (easing === 'perKey') f = smooth(f)
  return { i, f, u: (i + f) / (n - 1) }
}

export const lerp = (a: number, b: number, f: number) => a + (b - a) * f

/** Field of view at time t (linear between neighbouring keys, same timing as the path). */
export function fovAt(keys: Key[], t: number, easing: Easing): number {
  if (!keys.length) return 50
  if (keys.length === 1) return keys[0].fov
  const { i, f } = locate(keys, t, easing)
  return lerp(keys[i].fov, keys[i + 1].fov, f)
}

/** Spread keys evenly over `total` seconds, keeping their order. */
export function retime(keys: Key[], total: number): Key[] {
  const s = sortKeys(keys)
  if (s.length < 2) return s.map((k) => ({ ...k, t: 0 }))
  return s.map((k, i) => ({ ...k, t: Math.round(((total * i) / (s.length - 1)) * 100) / 100 }))
}

/** Orbit preset: n keys on a circle of radius r at height h looking at the centre. */
export function orbitKeys(n: number, r: number, h: number, total: number, centre: V3 = [0, 0.8, 0]): Key[] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = (i / n) * Math.PI * 2
    return { id: `o${i}`, t: Math.round(((total * i) / n) * 100) / 100, pos: [centre[0] + r * Math.sin(a), h, centre[2] + r * Math.cos(a)] as V3, target: centre, fov: 45 }
  })
}

export const fmtTime = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`
