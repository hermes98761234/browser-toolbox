// Filter design: Butterworth / Chebyshev-I prototypes, Sallen-Key and RC stages, LC ladders, E-series rounding,
// and frequency response of the realised circuit.

export type Family = 'butterworth' | 'chebyshev'
export type Kind = 'lowpass' | 'highpass'
export type Topology = 'rc' | 'sk' | 'lc'
export type ESeries = 'E6' | 'E12' | 'E24' | 'E96' | 'exact'

const E6 = [10, 15, 22, 33, 47, 68]
const E12 = [10, 12, 15, 18, 22, 27, 33, 39, 47, 56, 68, 82]
const E24 = [10, 11, 12, 13, 15, 16, 18, 20, 22, 24, 27, 30, 33, 36, 39, 43, 47, 51, 56, 62, 68, 75, 82, 91]
const E96 = Array.from({ length: 96 }, (_, i) => Math.round(100 * 10 ** (i / 96)) / 10)

export const SERIES: Record<Exclude<ESeries, 'exact'>, number[]> = { E6, E12, E24, E96 }

/** Nearest preferred value (log distance). */
export function eRound(x: number, s: ESeries): number {
  if (s === 'exact' || !(x > 0) || !Number.isFinite(x)) return x
  const dec = Math.floor(Math.log10(x)) - 1
  const base = 10 ** dec
  let best = x, bd = Infinity
  for (const m of [...SERIES[s].map((v) => v / 10), ...SERIES[s], ...SERIES[s].map((v) => v * 10)]) {
    const v = m * base
    const d = Math.abs(Math.log(v / x))
    if (d < bd) { bd = d; best = v }
  }
  return Number(best.toPrecision(3))
}

export interface Section { w: number; Q: number; order: 1 | 2 }

/** Normalised (ωc = 1) low-pass sections. */
export function sections(fam: Family, n: number, rippleDb: number): Section[] {
  const out: Section[] = []
  const eps = Math.sqrt(10 ** (rippleDb / 10) - 1)
  const a = Math.asinh(1 / eps) / n
  for (let k = 1; k <= Math.floor(n / 2); k++) {
    const th = ((2 * k - 1) * Math.PI) / (2 * n)
    if (fam === 'butterworth') out.push({ w: 1, Q: 1 / (2 * Math.sin(th)), order: 2 })
    else {
      const s = Math.sinh(a) * Math.sin(th), o = Math.cosh(a) * Math.cos(th)
      const w = Math.hypot(s, o)
      out.push({ w, Q: w / (2 * s), order: 2 })
    }
  }
  if (n % 2) out.push({ w: fam === 'butterworth' ? 1 : Math.sinh(a), Q: 0.5, order: 1 })
  return out.sort((x, y) => x.Q - y.Q)
}

/** Low-pass prototype element values g1..g(n+1). */
export function gValues(fam: Family, n: number, rippleDb: number): number[] {
  if (fam === 'butterworth') return [...Array.from({ length: n }, (_, k) => 2 * Math.sin(((2 * k + 1) * Math.PI) / (2 * n))), 1]
  const beta = Math.log(1 / Math.tanh(rippleDb / 17.37))
  const gam = Math.sinh(beta / (2 * n))
  const a = (k: number) => Math.sin(((2 * k - 1) * Math.PI) / (2 * n))
  const b = (k: number) => gam * gam + Math.sin((k * Math.PI) / n) ** 2
  const g = [(2 * a(1)) / gam]
  for (let k = 2; k <= n; k++) g.push((4 * a(k - 1) * a(k)) / (b(k - 1) * g[k - 2]))
  g.push(n % 2 ? 1 : 1 / Math.tanh(beta / 4) ** 2)
  return g
}

export interface Part { ref: string; kind: 'R' | 'C' | 'L'; ideal: number; value: number; role?: 'series' | 'shunt' | 'feedback' | 'ground' }
export interface Stage { type: 'sk' | 'rc'; f0: number; Q: number; parts: Part[] }
export interface Design {
  topology: Topology
  kind: Kind
  stages: Stage[] // active / RC
  ladder: Part[] // LC
  r0: number
  rl: number
}

export interface Spec { fam: Family; kind: Kind; topology: Topology; order: number; fc: number; ripple: number; rTarget: number; rSeries: ESeries; cSeries: ESeries }

export function design(sp: Spec): Design {
  const n = sp.topology === 'rc' ? 1 : sp.order
  const wc = 2 * Math.PI * sp.fc
  const R = sp.rTarget
  const rr = (x: number) => eRound(x, sp.rSeries), rc = (x: number) => eRound(x, sp.cSeries)
  if (sp.topology === 'lc') {
    const g = gValues(sp.fam, n, sp.ripple)
    const ladder: Part[] = []
    for (let k = 1; k <= n; k++) {
      const shunt = k % 2 === 1
      const gk = g[k - 1]
      let p: Part
      if (sp.kind === 'lowpass') p = shunt ? { ref: `C${k}`, kind: 'C', ideal: gk / (R * wc), value: 0, role: 'shunt' } : { ref: `L${k}`, kind: 'L', ideal: (gk * R) / wc, value: 0, role: 'series' }
      else p = shunt ? { ref: `L${k}`, kind: 'L', ideal: R / (gk * wc), value: 0, role: 'shunt' } : { ref: `C${k}`, kind: 'C', ideal: 1 / (gk * R * wc), value: 0, role: 'series' }
      p.value = p.kind === 'C' ? rc(p.ideal) : eRound(p.ideal, sp.cSeries)
      ladder.push(p)
    }
    const gl = g[n]
    return { topology: 'lc', kind: sp.kind, stages: [], ladder, r0: R, rl: n % 2 ? R * gl : R / gl }
  }
  const secs = sections(sp.fam, n, sp.ripple)
  const stages: Stage[] = secs.map((s, i) => {
    const w0 = sp.kind === 'lowpass' ? wc * s.w : wc / s.w
    const f0 = w0 / (2 * Math.PI)
    const id = i + 1
    if (s.order === 1) {
      const C = rc(1 / (w0 * R))
      const Ri = 1 / (w0 * C)
      return { type: 'rc', f0, Q: 0.5, parts: [{ ref: `R${id}`, kind: 'R', ideal: Ri, value: rr(Ri) }, { ref: `C${id}`, kind: 'C', ideal: C, value: C }] }
    }
    if (sp.kind === 'lowpass') {
      const C2 = rc(1 / (2 * s.Q * w0 * R))
      const C1i = 4 * s.Q * s.Q * C2
      const C1 = rc(C1i)
      const Ri = 1 / (w0 * Math.sqrt(C1i * C2))
      const Rr = rr(1 / (w0 * Math.sqrt(C1 * C2)))
      return {
        type: 'sk', f0, Q: s.Q, parts: [
          { ref: `R${id}a`, kind: 'R', ideal: Ri, value: Rr, role: 'series' },
          { ref: `R${id}b`, kind: 'R', ideal: Ri, value: Rr, role: 'series' },
          { ref: `C${id}a`, kind: 'C', ideal: C1i, value: C1, role: 'feedback' },
          { ref: `C${id}b`, kind: 'C', ideal: C2, value: C2, role: 'ground' },
        ],
      }
    }
    const C = rc(1 / (w0 * R))
    const R1 = 1 / (2 * s.Q * w0 * C), R2 = (2 * s.Q) / (w0 * C)
    return {
      type: 'sk', f0, Q: s.Q, parts: [
        { ref: `C${id}a`, kind: 'C', ideal: C, value: C, role: 'series' },
        { ref: `C${id}b`, kind: 'C', ideal: C, value: C, role: 'series' },
        { ref: `R${id}a`, kind: 'R', ideal: R1, value: rr(R1), role: 'feedback' },
        { ref: `R${id}b`, kind: 'R', ideal: R2, value: rr(R2), role: 'ground' },
      ],
    }
  })
  return { topology: sp.topology, kind: sp.kind, stages, ladder: [], r0: R, rl: R }
}

// ---- complex helpers ----
type Cx = [number, number]
const add = (a: Cx, b: Cx): Cx => [a[0] + b[0], a[1] + b[1]]
const mul = (a: Cx, b: Cx): Cx => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]]
const div = (a: Cx, b: Cx): Cx => {
  const d = b[0] * b[0] + b[1] * b[1]
  return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]
}
const sc = (a: Cx, k: number): Cx => [a[0] * k, a[1] * k]

/** Complex response at f (Hz), using ideal or rounded part values. */
export function response(d: Design, f: number, useIdeal = false): Cx {
  const s: Cx = [0, 2 * Math.PI * f]
  const v = (p: Part) => (useIdeal ? p.ideal : p.value)
  const one: Cx = [1, 0]
  if (d.topology === 'lc') {
    let A: Cx = [1, 0], B: Cx = [0, 0], C: Cx = [0, 0], D: Cx = [1, 0]
    for (const p of d.ladder) {
      const z: Cx = p.kind === 'L' ? sc(s, v(p)) : div(one, sc(s, v(p)))
      if (p.role === 'series') {
        B = add(mul(A, z), B)
        D = add(mul(C, z), D)
      } else {
        const y = div(one, z)
        A = add(A, mul(B, y))
        C = add(C, mul(D, y))
      }
    }
    const den = add(add(sc(A, d.rl), B), add(sc(C, d.r0 * d.rl), sc(D, d.r0)))
    return sc(div([d.rl, 0], den), 2 * Math.sqrt(d.r0 / d.rl))
  }
  let H: Cx = [1, 0]
  for (const st of d.stages) {
    const P = st.parts.map(v)
    let h: Cx
    if (st.type === 'rc') {
      const st1 = sc(s, P[0] * P[1])
      h = d.kind === 'lowpass' ? div(one, add(one, st1)) : div(st1, add(one, st1))
    } else {
      const s2 = mul(s, s)
      if (d.kind === 'lowpass') {
        const [R1, R2, C1, C2] = P
        h = div(one, add(add(one, sc(s, C2 * (R1 + R2))), sc(s2, R1 * R2 * C1 * C2)))
      } else {
        const [C1, C2, R1, R2] = P
        const num = sc(s2, R1 * R2 * C1 * C2)
        h = div(num, add(add(one, sc(s, R1 * (C1 + C2))), num))
      }
    }
    H = mul(H, h)
  }
  return H
}

export interface Pt { f: number; db: number; phase: number }

/** Log-spaced sweep with unwrapped phase in degrees. */
export function sweep(d: Design, f0: number, f1: number, n = 300, useIdeal = false): Pt[] {
  const out: Pt[] = []
  let prev = 0, off = 0
  for (let i = 0; i < n; i++) {
    const f = f0 * (f1 / f0) ** (i / (n - 1))
    const h = response(d, f, useIdeal)
    const ph = (Math.atan2(h[1], h[0]) * 180) / Math.PI
    if (i) {
      while (ph + off - prev > 180) off -= 360
      while (ph + off - prev < -180) off += 360
    }
    prev = ph + off
    out.push({ f, db: 20 * Math.log10(Math.hypot(h[0], h[1]) || 1e-12), phase: prev })
  }
  return out
}

/** Frequency where the magnitude crosses `level` dB, searched by bisection between fa and fb. */
export function crossing(d: Design, level: number, fa: number, fb: number): number | null {
  const g = (f: number) => {
    const h = response(d, f)
    return 20 * Math.log10(Math.hypot(h[0], h[1])) - level
  }
  let a = fa, b = fb, ga = g(a)
  if (ga * g(b) > 0) return null
  for (let i = 0; i < 80; i++) {
    const m = Math.sqrt(a * b)
    const gm = g(m)
    if (ga * gm <= 0) b = m
    else { a = m; ga = gm }
  }
  return Math.sqrt(a * b)
}

/** Engineering notation: 4.7k, 100n, 2.2µ. */
export function eng(x: number, unit = ''): string {
  if (!Number.isFinite(x) || x === 0) return `0${unit}`
  const P = [[1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p'], [1e-15, 'f']] as const
  const [m, p] = P.find(([m]) => Math.abs(x) >= m * 0.9995) ?? P[P.length - 1]
  return `${Number((x / m).toPrecision(3))}${p}${unit}`
}
