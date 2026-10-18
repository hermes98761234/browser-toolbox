// Transfer-function maths for the Bode plot generator: polynomial parsing in s, complex evaluation,
// roots (Aberth–Ehrlich), continuous phase, gain/phase margins.

export type Poly = number[] // ascending powers: c0 + c1 s + c2 s² …
export type Cx = [number, number]

const cadd = (a: Cx, b: Cx): Cx => [a[0] + b[0], a[1] + b[1]]
const csub = (a: Cx, b: Cx): Cx => [a[0] - b[0], a[1] - b[1]]
const cmul = (a: Cx, b: Cx): Cx => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]]
const cdiv = (a: Cx, b: Cx): Cx => {
  const d = b[0] * b[0] + b[1] * b[1]
  return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]
}
export const cabs = (a: Cx) => Math.hypot(a[0], a[1])

export const padd = (a: Poly, b: Poly): Poly => Array.from({ length: Math.max(a.length, b.length) }, (_, i) => (a[i] ?? 0) + (b[i] ?? 0))
export const pmul = (a: Poly, b: Poly): Poly => {
  const r = new Array<number>(a.length + b.length - 1).fill(0)
  a.forEach((x, i) => b.forEach((y, j) => (r[i + j] += x * y)))
  return r
}
export const trim = (p: Poly): Poly => {
  const r = p.slice()
  while (r.length > 1 && Math.abs(r[r.length - 1]) < 1e-14) r.pop()
  return r
}

/** Parses a polynomial in s: numbers, s, + − * / (by constants), ^ (non-negative integer), parentheses, implicit products. */
export function parsePoly(src: string): Poly {
  const toks = src.replace(/\s+/g, '').replace(/·|×/g, '*').match(/\d*\.?\d+(?:e[+-]?\d+)?|[sS]|[-+*/^()]/g)
  if (!toks || toks.join('') !== src.replace(/\s+/g, '').replace(/·|×/g, '*')) throw new Error(`Unexpected character in “${src}”`)
  let i = 0
  const peek = () => toks[i]
  const expr = (): Poly => {
    let p = term()
    while (peek() === '+' || peek() === '-') {
      const op = toks[i++]
      const q = term()
      p = padd(p, op === '-' ? q.map((c) => -c) : q)
    }
    return p
  }
  const term = (): Poly => {
    let p = unary()
    for (;;) {
      const t = peek()
      if (t === '*') {
        i++
        p = pmul(p, unary())
      } else if (t === '/') {
        i++
        const q = trim(unary())
        if (q.length > 1) throw new Error('Division by a polynomial: put it in the denominator instead')
        if (q[0] === 0) throw new Error('Division by zero')
        p = p.map((c) => c / q[0])
      } else if (t !== undefined && (t === '(' || t === 's' || t === 'S' || /^[\d.]/.test(t))) p = pmul(p, power())
      else return p
    }
  }
  const unary = (): Poly => {
    if (peek() === '-') {
      i++
      return unary().map((c) => -c)
    }
    if (peek() === '+') i++
    return power()
  }
  const power = (): Poly => {
    const b = atom()
    if (peek() !== '^') return b
    i++
    if (peek() === '-') throw new Error('Negative powers of s are not polynomials')
    if (peek() === '+') i++
    const e = Number(toks[i++])
    if (!Number.isInteger(e) || e < 0 || e > 30) throw new Error('Exponent must be a whole number 0…30')
    let r: Poly = [1]
    for (let k = 0; k < e; k++) r = pmul(r, b)
    return r
  }
  const atom = (): Poly => {
    const t = toks[i++]
    if (t === undefined) throw new Error('Unexpected end of expression')
    if (t === 's' || t === 'S') return [0, 1]
    if (t === '(') {
      const p = expr()
      if (toks[i++] !== ')') throw new Error('Missing “)”')
      return p
    }
    const n = Number(t)
    if (!Number.isFinite(n)) throw new Error(`Unexpected “${t}”`)
    return [n]
  }
  const p = expr()
  if (i < toks.length) throw new Error(`Unexpected “${toks[i]}”`)
  return trim(p)
}

/** Parses either an expression in s or a coefficient list in descending powers: “[1 3 2]” or “1, 3, 2”. */
export function parseTf(src: string): Poly {
  const t = src.trim()
  if (/^\[?\s*-?[\d.e+-]+(\s*[ ,;]\s*-?[\d.e+-]+)+\s*\]?$/.test(t)) {
    const c = t.replace(/[[\]]/g, '').split(/[\s,;]+/).filter(Boolean).map(Number)
    if (c.some((x) => !Number.isFinite(x))) throw new Error('Bad coefficient list')
    return trim(c.reverse())
  }
  return parsePoly(t)
}

export function peval(p: Poly, z: Cx): Cx {
  let r: Cx = [0, 0]
  for (let k = p.length - 1; k >= 0; k--) r = cadd(cmul(r, z), [p[k], 0])
  return r
}

/** All complex roots (Aberth–Ehrlich iteration). */
export function roots(p0: Poly): Cx[] {
  const p = trim(p0)
  const out: Cx[] = []
  let q = p.slice()
  while (q.length > 1 && q[0] === 0) {
    out.push([0, 0])
    q = q.slice(1)
  }
  const n = q.length - 1
  if (n < 1) return out
  const a = q.map((c) => c / q[n])
  const dp: Poly = a.slice(1).map((c, k) => c * (k + 1))
  const R = 1 + Math.max(...a.slice(0, n).map(Math.abs))
  let z: Cx[] = Array.from({ length: n }, (_, k) => [R * 0.5 * Math.cos((2 * Math.PI * k) / n + 0.4), R * 0.5 * Math.sin((2 * Math.PI * k) / n + 0.4)])
  for (let it = 0; it < 500; it++) {
    let maxStep = 0
    z = z.map((zi, i) => {
      const ratio = cdiv(peval(a, zi), peval(dp, zi))
      let sum: Cx = [0, 0]
      z.forEach((zj, j) => {
        if (j !== i) sum = cadd(sum, cdiv([1, 0], csub(zi, zj)))
      })
      const w = cdiv(ratio, csub([1, 0], cmul(ratio, sum)))
      if (!Number.isFinite(w[0]) || !Number.isFinite(w[1])) return zi
      maxStep = Math.max(maxStep, cabs(w) / (1 + cabs(zi)))
      return csub(zi, w)
    })
    if (maxStep < 1e-14) break
  }
  return out.concat(z.map(([re, im]) => [Math.abs(re) < 1e-10 ? 0 : re, Math.abs(im) < 1e-9 * (1 + Math.abs(re)) ? 0 : im] as Cx))
}

export interface Tf { num: Poly; den: Poly; delay: number }
export interface Point { w: number; mag: number; db: number; phase: number }

export function evalTf(tf: Tf, w: number): Cx {
  const s: Cx = [0, w]
  const g = cdiv(peval(tf.num, s), peval(tf.den, s))
  return tf.delay ? cmul(g, [Math.cos(-w * tf.delay), Math.sin(-w * tf.delay)]) : g
}

/** Continuous phase (degrees) from root factors: Σ arg(jω − zᵢ) − Σ arg(jω − pᵢ) + sign(gain) − ωT. */
export function phaseFn(tf: Tf): (w: number) => number {
  const zs = roots(tf.num), ps = roots(tf.den)
  const k = trim(tf.num)[trim(tf.num).length - 1] / trim(tf.den)[trim(tf.den).length - 1]
  const base = k < 0 ? -180 : 0
  const arg = (w: number, r: Cx) => (Math.atan2(w - r[1], -r[0]) * 180) / Math.PI
  return (w) => base + zs.reduce((a, r) => a + arg(w, r), 0) - ps.reduce((a, r) => a + arg(w, r), 0) - (w * tf.delay * 180) / Math.PI
}

export function sweep(tf: Tf, w0: number, w1: number, n = 400): Point[] {
  const ph = phaseFn(tf)
  const out: Point[] = []
  for (let i = 0; i < n; i++) {
    const w = w0 * Math.pow(w1 / w0, i / (n - 1))
    const mag = cabs(evalTf(tf, w))
    out.push({ w, mag, db: 20 * Math.log10(mag), phase: ph(w) })
  }
  return out
}

function bisect(f: (lw: number) => number, a: number, b: number): number {
  let fa = f(a)
  for (let i = 0; i < 80; i++) {
    const m = (a + b) / 2
    const fm = f(m)
    if (fa * fm <= 0) b = m
    else {
      a = m
      fa = fm
    }
  }
  return (a + b) / 2
}

export interface Margins {
  gainCross: number[] // ω where |G| = 1
  phaseCross: number[] // ω where phase = −180° (mod 360)
  pm: number | null // phase margin, degrees (smallest |PM|)
  wpm: number | null
  gm: number | null // gain margin, dB (smallest |GM|)
  wgm: number | null
  bandwidth: number | null // first ω where |G| drops 3 dB below its low-frequency value
}

export function margins(tf: Tf, w0 = 1e-4, w1 = 1e5, n = 3000): Margins {
  const ph = phaseFn(tf)
  const lg = (lw: number) => 20 * Math.log10(cabs(evalTf(tf, 10 ** lw)))
  const l0 = Math.log10(w0), l1 = Math.log10(w1)
  const gainCross: number[] = [], phaseCross: number[] = []
  // phase crossings of −180 − 360k
  const pf = (lw: number) => ph(10 ** lw)
  let prevL = l0, prevG = lg(l0), prevP = pf(l0)
  for (let i = 1; i <= n; i++) {
    const l = l0 + ((l1 - l0) * i) / n
    const g = lg(l), p = pf(l)
    if (Number.isFinite(g) && Number.isFinite(prevG) && (prevG > 0) !== (g > 0)) gainCross.push(10 ** bisect(lg, prevL, l))
    // crossing of any level −180 + 360k between prevP and p
    const kLo = Math.ceil((Math.min(prevP, p) + 180) / 360), kHi = Math.floor((Math.max(prevP, p) + 180) / 360)
    for (let k = kLo; k <= kHi && Math.abs(p - prevP) < 170; k++) {
      const lvl = -180 + 360 * k
      if (lvl === prevP) continue
      phaseCross.push(10 ** bisect((x) => pf(x) - lvl, prevL, l))
    }
    prevL = l
    prevG = g
    prevP = p
  }
  const wrap = (p: number) => ((((p + 180) % 360) + 360) % 360) - 180 // to (−180, 180]
  let pm: number | null = null, wpm: number | null = null
  for (const w of gainCross) {
    const m = wrap(ph(w)) + 180
    const mm = m > 180 ? m - 360 : m
    if (pm === null || Math.abs(mm) < Math.abs(pm)) {
      pm = mm
      wpm = w
    }
  }
  let gm: number | null = null, wgm: number | null = null
  for (const w of phaseCross) {
    const m = -lg(Math.log10(w))
    if (gm === null || Math.abs(m) < Math.abs(gm)) {
      gm = m
      wgm = w
    }
  }
  const dc = lg(l0)
  let bandwidth: number | null = null
  for (let i = 1; i <= n; i++) {
    const l = l0 + ((l1 - l0) * i) / n
    if (lg(l) < dc - 3) {
      bandwidth = 10 ** bisect((x) => lg(x) - (dc - 3), l0 + ((l1 - l0) * (i - 1)) / n, l)
      break
    }
  }
  return { gainCross, phaseCross, pm, wpm, gm, wgm, bandwidth }
}

/** Closed-loop poles of the unity-feedback loop: roots of D(s) + N(s) (delay ignored). */
export const closedLoopPoles = (tf: Tf) => roots(padd(tf.den, tf.num))

export function polyToString(p: Poly, v = 's'): string {
  const parts: string[] = []
  for (let k = p.length - 1; k >= 0; k--) {
    const c = p[k]
    if (Math.abs(c) < 1e-12) continue
    const a = Math.abs(c)
    const cs = a === 1 && k > 0 ? '' : +a.toPrecision(6) + ''
    const term = k === 0 ? cs : `${cs}${v}${k > 1 ? '^' + k : ''}`
    parts.push((c < 0 ? (parts.length ? ' − ' : '−') : parts.length ? ' + ' : '') + term)
  }
  return parts.join('') || '0'
}
