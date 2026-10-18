// Exact trigonometric values at multiples of 15°, radian formatting and quiz question generation.

export type Fn = 'sin' | 'cos' | 'tan' | 'csc' | 'sec' | 'cot'
export interface Exact { tex: string; value: number }

const S6 = Math.sqrt(6), S2 = Math.SQRT2, S3 = Math.sqrt(3)
const UNDEF: Exact = { tex: '\\text{undefined}', value: NaN }

// first-quadrant tables for reference angles 0, 15, …, 90
const SIN: Exact[] = [
  { tex: '0', value: 0 },
  { tex: '\\frac{\\sqrt{6}-\\sqrt{2}}{4}', value: (S6 - S2) / 4 },
  { tex: '\\frac{1}{2}', value: 0.5 },
  { tex: '\\frac{\\sqrt{2}}{2}', value: S2 / 2 },
  { tex: '\\frac{\\sqrt{3}}{2}', value: S3 / 2 },
  { tex: '\\frac{\\sqrt{6}+\\sqrt{2}}{4}', value: (S6 + S2) / 4 },
  { tex: '1', value: 1 },
]
const TAN: Exact[] = [
  { tex: '0', value: 0 },
  { tex: '2-\\sqrt{3}', value: 2 - S3 },
  { tex: '\\frac{\\sqrt{3}}{3}', value: S3 / 3 },
  { tex: '1', value: 1 },
  { tex: '\\sqrt{3}', value: S3 },
  { tex: '2+\\sqrt{3}', value: 2 + S3 },
  UNDEF,
]
const SEC: Exact[] = [
  { tex: '1', value: 1 },
  { tex: '\\sqrt{6}-\\sqrt{2}', value: S6 - S2 },
  { tex: '\\frac{2\\sqrt{3}}{3}', value: (2 * S3) / 3 },
  { tex: '\\sqrt{2}', value: S2 },
  { tex: '2', value: 2 },
  { tex: '\\sqrt{6}+\\sqrt{2}', value: S6 + S2 },
  UNDEF,
]

export const norm360 = (deg: number) => ((deg % 360) + 360) % 360

/** Quadrant 1–4, or 0 when the terminal side lies on an axis. */
export function quadrant(deg: number): number {
  const a = norm360(deg)
  if (a % 90 === 0) return 0
  return Math.floor(a / 90) + 1
}

/** Reference angle in degrees (0..90). */
export function refAngle(deg: number): number {
  const a = norm360(deg)
  return a <= 90 ? a : a <= 180 ? 180 - a : a <= 270 ? a - 180 : 360 - a
}

const neg = (e: Exact): Exact => (e === UNDEF || e.value === 0 ? e : { tex: `-${e.tex}`, value: -e.value })

/** Exact value of fn(deg) for deg a multiple of 15°; null otherwise. */
export function exact(fn: Fn, deg: number): Exact | null {
  if (!Number.isInteger(deg) || deg % 15 !== 0) return null
  const a = norm360(deg)
  const r = refAngle(a) / 15
  const cx = a < 90 || a > 270 ? 1 : a === 90 || a === 270 ? 0 : -1 // sign of cos
  const sy = a > 0 && a < 180 ? 1 : a === 0 || a === 180 ? 0 : -1 // sign of sin
  const sign = (e: Exact, s: number) => (s < 0 ? neg(e) : e)
  switch (fn) {
    case 'sin': return sign(SIN[r], sy)
    case 'cos': return sign(SIN[6 - r], cx)
    case 'tan': return TAN[r] === UNDEF ? UNDEF : sign(TAN[r], sy * cx || 1)
    case 'cot': return TAN[6 - r] === UNDEF ? UNDEF : sign(TAN[6 - r], sy * cx || 1)
    case 'sec': return SEC[r] === UNDEF ? UNDEF : sign(SEC[r], cx || 1)
    case 'csc': return SEC[6 - r] === UNDEF ? UNDEF : sign(SEC[6 - r], sy || 1)
  }
}

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : Math.abs(a))

/** Degrees (multiple of 15) → LaTeX multiple of π, e.g. 150 → \frac{5\pi}{6}. */
export function radTex(deg: number): string {
  if (deg === 0) return '0'
  const g = gcd(Math.round(deg), 180)
  const n = Math.round(deg) / g, d = 180 / g
  const sgn = n < 0 ? '-' : ''
  const an = Math.abs(n)
  const top = an === 1 ? '\\pi' : `${an}\\pi`
  return d === 1 ? `${sgn}${top}` : `${sgn}\\frac{${top}}{${d}}`
}

/** Plain-text radians for labels, e.g. "5π/6". */
export function radText(deg: number): string {
  if (deg === 0) return '0'
  const g = gcd(Math.round(deg), 180)
  const n = Math.round(deg) / g, d = 180 / g
  const top = `${n < 0 ? '−' : ''}${Math.abs(n) === 1 ? '' : Math.abs(n)}π`
  return d === 1 ? top : `${top}/${d}`
}

export const SPECIAL = [0, 30, 45, 60, 90, 120, 135, 150, 180, 210, 225, 240, 270, 300, 315, 330]

/** Snap an angle to the nearest multiple of `step` degrees. */
export const snap = (deg: number, step: number) => norm360(Math.round(deg / step) * step)

export interface Question { kind: 'value'; fn: Fn; deg: number; answer: string; options: string[] }
export interface AngleQuestion { kind: 'angle'; x: string; y: string; deg: number; answer: string; options: string[] }

/** Seeded PRNG so quizzes are reproducible in tests. */
export function rng(seed: number) {
  let s = seed >>> 0 || 1
  return () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return (s >>> 0) / 4294967296
  }
}

function shuffle<T>(a: T[], r: () => number): T[] {
  const b = [...a]
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1))
    ;[b[i], b[j]] = [b[j], b[i]]
  }
  return b
}

/** Multiple-choice question: four distinct options, one correct. */
export function makeQuestion(r: () => number, fns: Fn[], angles: number[], radians: boolean): Question | AngleQuestion {
  const deg = angles[Math.floor(r() * angles.length)]
  if (r() < 0.2) {
    const answer = radians ? radTex(deg) : `${deg}^\\circ`
    const pool = [...new Set(angles.filter((a) => a !== deg).map((a) => (radians ? radTex(a) : `${a}^\\circ`)))]
    return { kind: 'angle', deg, x: exact('cos', deg)!.tex, y: exact('sin', deg)!.tex, answer, options: shuffle([answer, ...shuffle(pool, r).slice(0, 3)], r) }
  }
  const fn = fns[Math.floor(r() * fns.length)]
  const answer = exact(fn, deg)!.tex
  const pool = new Set<string>()
  for (const a of [...angles, ...SPECIAL]) {
    const e = exact(fn, a)!
    pool.add(e.tex)
    pool.add(neg(e).tex)
  }
  pool.delete(answer)
  // prefer distractors with the same magnitude but the wrong sign, then random ones
  const flip = neg(exact(fn, deg)!).tex
  const rest = shuffle([...pool].filter((t) => t !== flip), r)
  const picks = (flip !== answer && pool.has(flip) ? [flip] : []).concat(rest).slice(0, 3)
  return { kind: 'value', fn, deg, answer, options: shuffle([answer, ...picks], r) }
}
