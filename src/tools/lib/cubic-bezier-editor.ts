// Cubic Bézier easing maths (same model as CSS cubic-bezier(): P0 = (0,0), P3 = (1,1)).

export type Curve = [number, number, number, number]

const coord = (t: number, a: number, b: number) => 3 * (1 - t) * (1 - t) * t * a + 3 * (1 - t) * t * t * b + t * t * t
const deriv = (t: number, a: number, b: number) => 3 * (1 - t) * (1 - t) * a + 6 * (1 - t) * t * (b - a) + 3 * t * t * (1 - b)

/** Parameter t at which the curve reaches x (Newton steps with bisection fallback). */
export function solveT(x: number, x1: number, x2: number): number {
  if (x <= 0) return 0
  if (x >= 1) return 1
  let t = x
  for (let i = 0; i < 8; i++) {
    const err = coord(t, x1, x2) - x
    if (Math.abs(err) < 1e-7) return t
    const d = deriv(t, x1, x2)
    if (Math.abs(d) < 1e-6) break
    t -= err / d
  }
  let lo = 0, hi = 1
  t = x
  for (let i = 0; i < 60; i++) {
    const v = coord(t, x1, x2)
    if (Math.abs(v - x) < 1e-7) break
    if (v < x) lo = t
    else hi = t
    t = (lo + hi) / 2
  }
  return t
}

/** Eased progress y for time fraction x, like the browser does. */
export function ease(c: Curve, x: number): number {
  return coord(solveT(x, c[0], c[2]), c[1], c[3])
}

export const point = (c: Curve, t: number): [number, number] => [coord(t, c[0], c[2]), coord(t, c[1], c[3])]

/** Parses "cubic-bezier(.17,.67,.83,.67)", "0.4, 0, 0.2, 1" or a CSS keyword. */
export function parseCurve(s: string): Curve | null {
  const k = s.trim().toLowerCase().replace(/;$/, '')
  const kw = PRESETS.find((p) => p.name === k && p.group === 'CSS')
  if (kw) return kw.c
  const nums = k.replace(/^cubic-bezier\(|\)$/g, '').split(/[\s,]+/).filter(Boolean).map(Number)
  if (nums.length !== 4 || nums.some((n) => !Number.isFinite(n))) return null
  if (nums[0] < 0 || nums[0] > 1 || nums[2] < 0 || nums[2] > 1) return null
  return nums as Curve
}

const r = (n: number) => String(Math.round(n * 1000) / 1000).replace(/^(-?)0\./, '$1.')
export const css = (c: Curve) => `cubic-bezier(${c.map(r).join(', ')})`

/** Overshoot/undershoot in output (fraction beyond 0..1), useful to flag "back" style curves. */
export function overshoot(c: Curve): { min: number; max: number } {
  let min = 0, max = 1
  for (let i = 0; i <= 200; i++) {
    const y = point(c, i / 200)[1]
    min = Math.min(min, y)
    max = Math.max(max, y)
  }
  return { min, max }
}

export const PRESETS: { name: string; group: string; c: Curve }[] = [
  { name: 'ease', group: 'CSS', c: [0.25, 0.1, 0.25, 1] },
  { name: 'linear', group: 'CSS', c: [0, 0, 1, 1] },
  { name: 'ease-in', group: 'CSS', c: [0.42, 0, 1, 1] },
  { name: 'ease-out', group: 'CSS', c: [0, 0, 0.58, 1] },
  { name: 'ease-in-out', group: 'CSS', c: [0.42, 0, 0.58, 1] },
  { name: 'easeInSine', group: 'In', c: [0.12, 0, 0.39, 0] },
  { name: 'easeInQuad', group: 'In', c: [0.11, 0, 0.5, 0] },
  { name: 'easeInCubic', group: 'In', c: [0.32, 0, 0.67, 0] },
  { name: 'easeInQuart', group: 'In', c: [0.5, 0, 0.75, 0] },
  { name: 'easeInExpo', group: 'In', c: [0.7, 0, 0.84, 0] },
  { name: 'easeInCirc', group: 'In', c: [0.55, 0, 1, 0.45] },
  { name: 'easeInBack', group: 'In', c: [0.36, 0, 0.66, -0.56] },
  { name: 'easeOutSine', group: 'Out', c: [0.61, 1, 0.88, 1] },
  { name: 'easeOutQuad', group: 'Out', c: [0.5, 1, 0.89, 1] },
  { name: 'easeOutCubic', group: 'Out', c: [0.33, 1, 0.68, 1] },
  { name: 'easeOutQuart', group: 'Out', c: [0.25, 1, 0.5, 1] },
  { name: 'easeOutExpo', group: 'Out', c: [0.16, 1, 0.3, 1] },
  { name: 'easeOutCirc', group: 'Out', c: [0, 0.55, 0.45, 1] },
  { name: 'easeOutBack', group: 'Out', c: [0.34, 1.56, 0.64, 1] },
  { name: 'easeInOutSine', group: 'In-out', c: [0.37, 0, 0.63, 1] },
  { name: 'easeInOutQuad', group: 'In-out', c: [0.45, 0, 0.55, 1] },
  { name: 'easeInOutCubic', group: 'In-out', c: [0.65, 0, 0.35, 1] },
  { name: 'easeInOutQuart', group: 'In-out', c: [0.76, 0, 0.24, 1] },
  { name: 'easeInOutExpo', group: 'In-out', c: [0.87, 0, 0.13, 1] },
  { name: 'easeInOutCirc', group: 'In-out', c: [0.85, 0, 0.15, 1] },
  { name: 'easeInOutBack', group: 'In-out', c: [0.68, -0.6, 0.32, 1.6] },
  { name: 'Material standard', group: 'Design systems', c: [0.2, 0, 0, 1] },
  { name: 'Material emphasized decel.', group: 'Design systems', c: [0.05, 0.7, 0.1, 1] },
  { name: 'Material emphasized accel.', group: 'Design systems', c: [0.3, 0, 0.8, 0.15] },
  { name: 'Apple-ish spring', group: 'Design systems', c: [0.32, 0.72, 0, 1] },
]
