// Modified nodal analysis (MNA) circuit solver: DC operating point (Newton for diodes) and
// transient analysis with backward-Euler or trapezoidal companion models.

export type Kind = 'W' | 'R' | 'C' | 'L' | 'V' | 'I' | 'D' | 'G'
export type Wave = 'dc' | 'step' | 'sine' | 'square'
export type Pt = [number, number]

export interface Comp {
  id: string
  kind: Kind
  a: Pt
  b: Pt
  value: number
  wave?: Wave
  freq?: number
}

export const VT = 0.025852 // thermal voltage at 300 K
export const DIODE_IS = 1e-14
export const DIODE_N = 1
const GMIN = 1e-12

const key = (p: Pt) => `${p[0]},${p[1]}`

/** Engineering-notation parser: 4.7k, 10u, 100n, 2.2meg, 1e-3, 5m. */
export function parseEng(s: string): number | null {
  const m = /^\s*([-+]?\d*\.?\d+(?:e[-+]?\d+)?)\s*(meg|[fpnuµmkKMGT])?\s*[a-zA-ZΩ]*\s*$/i.exec(s)
  if (!m) return null
  const mult: Record<string, number> = { f: 1e-15, p: 1e-12, n: 1e-9, u: 1e-6, µ: 1e-6, m: 1e-3, k: 1e3, K: 1e3, M: 1e6, meg: 1e6, G: 1e9, T: 1e12 }
  const suf = m[2] ? (m[2].toLowerCase() === 'meg' ? 'meg' : m[2]) : ''
  return Number(m[1]) * (suf ? mult[suf] : 1)
}

export function formatEng(x: number, unit = '', digits = 3): string {
  if (!Number.isFinite(x)) return '—'
  if (x === 0) return `0 ${unit}`.trim()
  const pre: [number, string][] = [[1e12, 'T'], [1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p'], [1e-15, 'f']]
  const a = Math.abs(x)
  const [f, p] = pre.find(([f]) => a >= f * 0.9995) ?? pre[pre.length - 1]
  return `${Number((x / f).toPrecision(digits))} ${p}${unit}`.trim()
}

export interface Netlist {
  /** node index per grid point key; 0 = ground */
  nodeOf: Map<string, number>
  n: number
  term: Map<string, [number, number]>
  grounded: boolean
}

export function netlist(comps: Comp[]): Netlist {
  const parent = new Map<string, string>()
  const find = (k: string): string => {
    let r = k
    while (parent.get(r) !== r) r = parent.get(r)!
    parent.set(k, r)
    return r
  }
  const add = (p: Pt) => {
    if (!parent.has(key(p))) parent.set(key(p), key(p))
  }
  const union = (p: Pt, q: Pt) => {
    add(p)
    add(q)
    const a = find(key(p)), b = find(key(q))
    if (a !== b) parent.set(a, b)
  }
  const pts: Pt[] = []
  for (const c of comps) {
    add(c.a)
    pts.push(c.a)
    if (c.kind !== 'G') {
      add(c.b)
      pts.push(c.b)
    }
  }
  for (const c of comps) if (c.kind === 'W') union(c.a, c.b)
  // T-junctions: a terminal lying on the interior of a wire joins it
  for (const w of comps) {
    if (w.kind !== 'W') continue
    for (const p of pts) {
      const cross = (w.b[0] - w.a[0]) * (p[1] - w.a[1]) - (w.b[1] - w.a[1]) * (p[0] - w.a[0])
      if (cross !== 0) continue
      const dot = (p[0] - w.a[0]) * (w.b[0] - w.a[0]) + (p[1] - w.a[1]) * (w.b[1] - w.a[1])
      const len2 = (w.b[0] - w.a[0]) ** 2 + (w.b[1] - w.a[1]) ** 2
      if (dot > 0 && dot < len2) union(p, w.a)
    }
  }
  const nodeOf = new Map<string, number>()
  const rootId = new Map<string, number>()
  let groundRoot = comps.find((c) => c.kind === 'G') ? find(key(comps.find((c) => c.kind === 'G')!.a)) : null
  for (const c of comps) if (c.kind === 'G') parent.set(find(key(c.a)), groundRoot!)
  const grounded = groundRoot !== null
  if (!groundRoot) {
    const v = comps.find((c) => c.kind === 'V') ?? comps.find((c) => c.kind !== 'W')
    if (v) groundRoot = find(key(v.b))
  }
  if (groundRoot) rootId.set(find(groundRoot), 0)
  let n = 1
  for (const k of parent.keys()) {
    const r = find(k)
    if (!rootId.has(r)) rootId.set(r, n++)
    nodeOf.set(k, rootId.get(r)!)
  }
  const term = new Map<string, [number, number]>()
  for (const c of comps) term.set(c.id, [nodeOf.get(key(c.a)) ?? 0, c.kind === 'G' ? 0 : (nodeOf.get(key(c.b)) ?? 0)])
  return { nodeOf, n, term, grounded }
}

/** Source value at time t; t = null means the DC (steady) value. */
export function srcValue(c: Comp, t: number | null): number {
  const w = c.wave ?? 'dc'
  if (w === 'dc') return c.value
  if (w === 'step') return t === null || t > 0 ? c.value : 0
  if (t === null) return 0
  const f = c.freq ?? 1000
  if (w === 'sine') return c.value * Math.sin(2 * Math.PI * f * t)
  return (t * f) % 1 < 0.5 ? c.value : 0
}

/** Dense Gaussian elimination with partial pivoting. Returns null if singular. */
export function solveLinear(A: number[][], b: number[]): number[] | null {
  const n = b.length
  const M = A.map((r, i) => [...r, b[i]])
  for (let c = 0; c < n; c++) {
    let p = c
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r
    if (Math.abs(M[p][c]) < 1e-18) return null
    ;[M[c], M[p]] = [M[p], M[c]]
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / M[c][c]
      if (f) for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]
    }
  }
  const x = new Array(n).fill(0)
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n]
    for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k]
    x[r] = s / M[r][r]
  }
  return x
}

function diode(v: number) {
  const nvt = DIODE_N * VT
  const e = Math.exp(Math.min(v / nvt, 80))
  return { i: DIODE_IS * (e - 1), g: (DIODE_IS / nvt) * e + GMIN }
}

/** SPICE-style junction voltage limiting to keep Newton from overflowing. */
function limit(vnew: number, vold: number) {
  const nvt = DIODE_N * VT
  const vcrit = nvt * Math.log(nvt / (Math.SQRT2 * DIODE_IS))
  if (vnew > vcrit && Math.abs(vnew - vold) > 2 * nvt) {
    if (vold > 0) {
      const arg = 1 + (vnew - vold) / nvt
      return arg > 0 ? vold + nvt * Math.log(arg) : vcrit
    }
    return nvt * Math.log(vnew / nvt)
  }
  return vnew
}

interface Companion {
  /** capacitor/inductor: conductance and equivalent current (i = G·v + Ieq, a→b) */
  g: Map<string, [number, number]>
}

export interface SolveResult {
  v: number[]
  i: Map<string, number>
  ok: boolean
  error?: string
  iterations: number
}

/**
 * One MNA solve. `comp` gives companion models for C/L (transient); without it C is open and L is a
 * 0 V source (DC). Diodes are solved by Newton iteration starting from `vGuess`.
 */
function solve(comps: Comp[], nl: Netlist, t: number | null, comp: Companion | null, vGuess?: number[]): SolveResult {
  const N = nl.n - 1
  const vsrc = comps.filter((c) => c.kind === 'V' || (c.kind === 'L' && !comp))
  const size = N + vsrc.length
  const dState = new Map<string, number>()
  for (const c of comps) if (c.kind === 'D') {
    const [a, b] = nl.term.get(c.id)!
    dState.set(c.id, vGuess ? (vGuess[a] ?? 0) - (vGuess[b] ?? 0) : 0.6)
  }
  let x: number[] | null = null
  let v = new Array(nl.n).fill(0)
  let it = 0
  for (; it < 200; it++) {
    const A = Array.from({ length: size }, () => new Array(size).fill(0))
    const z = new Array(size).fill(0)
    const G = (a: number, b: number, g: number) => {
      if (a) A[a - 1][a - 1] += g
      if (b) A[b - 1][b - 1] += g
      if (a && b) {
        A[a - 1][b - 1] -= g
        A[b - 1][a - 1] -= g
      }
    }
    // current `I` leaving node a towards b through the element
    const I = (a: number, b: number, cur: number) => {
      if (a) z[a - 1] -= cur
      if (b) z[b - 1] += cur
    }
    for (let k = 1; k <= N; k++) A[k - 1][k - 1] += GMIN
    for (const c of comps) {
      const [a, b] = nl.term.get(c.id)!
      if (c.kind === 'R') G(a, b, 1 / Math.max(c.value, 1e-9))
      else if (c.kind === 'C' && comp) {
        const [g, ieq] = comp.g.get(c.id)!
        G(a, b, g)
        I(a, b, ieq)
      } else if (c.kind === 'L' && comp) {
        const [g, ieq] = comp.g.get(c.id)!
        G(a, b, g)
        I(a, b, ieq)
      } else if (c.kind === 'I') I(a, b, srcValue(c, t))
      else if (c.kind === 'D') {
        const vd = dState.get(c.id)!
        const { i, g } = diode(vd)
        G(a, b, g)
        I(a, b, i - g * vd)
      }
    }
    vsrc.forEach((c, j) => {
      const [a, b] = nl.term.get(c.id)!
      const k = N + j
      if (a) {
        A[a - 1][k] += 1
        A[k][a - 1] += 1
      }
      if (b) {
        A[b - 1][k] -= 1
        A[k][b - 1] -= 1
      }
      z[k] = c.kind === 'V' ? srcValue(c, t) : 0
    })
    x = solveLinear(A, z)
    if (!x) return { v, i: new Map(), ok: false, error: 'The circuit matrix is singular: check for a loop of voltage sources/inductors or a source shorted by a wire.', iterations: it }
    v = [0, ...x.slice(0, N)]
    let conv = true
    for (const c of comps) if (c.kind === 'D') {
      const [a, b] = nl.term.get(c.id)!
      const vn = v[a] - v[b]
      const old = dState.get(c.id)!
      const lim = limit(vn, old)
      if (Math.abs(lim - old) > 1e-9 + 1e-6 * Math.abs(old)) conv = false
      dState.set(c.id, lim)
    }
    if (conv) break
  }
  const i = new Map<string, number>()
  for (const c of comps) {
    const [a, b] = nl.term.get(c.id)!
    const vab = v[a] - v[b]
    if (c.kind === 'R') i.set(c.id, vab / Math.max(c.value, 1e-9))
    else if (c.kind === 'D') i.set(c.id, diode(vab).i)
    else if (c.kind === 'I') i.set(c.id, srcValue(c, t))
    else if ((c.kind === 'C' || c.kind === 'L') && comp) {
      const [g, ieq] = comp.g.get(c.id)!
      i.set(c.id, g * vab + ieq)
    } else if (c.kind === 'C') i.set(c.id, 0)
  }
  // V sources (and DC inductors): MNA current flows a→b inside the element
  vsrc.forEach((c, j) => i.set(c.id, c.kind === 'V' ? -x![N + j] : x![N + j]))
  return { v, i, ok: it < 200, error: it < 200 ? undefined : 'Newton iteration did not converge.', iterations: it + 1 }
}

export function solveDC(comps: Comp[], t: number | null = null): SolveResult & { nl: Netlist } {
  const nl = netlist(comps)
  return { ...solve(comps, nl, t, null), nl }
}

export interface TranResult {
  t: number[]
  v: number[][]
  i: Map<string, number[]>
  nl: Netlist
  error?: string
}

/** Transient analysis from t=0 to tStop with fixed step dt. */
export function transient(comps: Comp[], o: { tStop: number; dt: number; method: 'be' | 'trap'; fromOp: boolean }): TranResult {
  const nl = netlist(comps)
  const steps = Math.min(20000, Math.max(1, Math.ceil(o.tStop / o.dt)))
  const h = o.tStop / steps
  const vc = new Map<string, number>()
  const ic = new Map<string, number>()
  let v0 = new Array(nl.n).fill(0)
  if (o.fromOp) {
    const op = solve(comps, nl, 0, null)
    if (op.ok) v0 = op.v
    for (const c of comps) {
      const [a, b] = nl.term.get(c.id)!
      if (c.kind === 'C') {
        vc.set(c.id, op.v[a] - op.v[b])
        ic.set(c.id, 0)
      }
      if (c.kind === 'L') {
        vc.set(c.id, 0)
        ic.set(c.id, op.i.get(c.id) ?? 0)
      }
    }
  } else for (const c of comps) if (c.kind === 'C' || c.kind === 'L') {
    vc.set(c.id, 0)
    ic.set(c.id, 0)
  }
  const out: TranResult = { t: [0], v: [v0], i: new Map(), nl }
  const rec = (m: Map<string, number>) => {
    for (const c of comps) {
      if (c.kind === 'W' || c.kind === 'G') continue
      if (!out.i.has(c.id)) out.i.set(c.id, [])
      out.i.get(c.id)!.push(m.get(c.id) ?? 0)
    }
  }
  const first = new Map<string, number>()
  for (const c of comps) if (c.kind === 'C' || c.kind === 'L') first.set(c.id, ic.get(c.id)!)
  const op0 = solve(comps, nl, 0, null)
  for (const c of comps) if (!first.has(c.id)) first.set(c.id, o.fromOp ? (op0.i.get(c.id) ?? 0) : 0)
  rec(first)
  let prev = v0
  for (let s = 1; s <= steps; s++) {
    const t = s * h
    const g = new Map<string, [number, number]>()
    for (const c of comps) {
      if (c.kind === 'C') {
        const C = Math.max(c.value, 1e-18)
        if (o.method === 'trap') {
          const G = (2 * C) / h
          g.set(c.id, [G, -(G * vc.get(c.id)! + ic.get(c.id)!)])
        } else {
          const G = C / h
          g.set(c.id, [G, -G * vc.get(c.id)!])
        }
      } else if (c.kind === 'L') {
        const L = Math.max(c.value, 1e-15)
        if (o.method === 'trap') {
          const G = h / (2 * L)
          g.set(c.id, [G, ic.get(c.id)! + G * vc.get(c.id)!])
        } else g.set(c.id, [h / L, ic.get(c.id)!])
      }
    }
    const r = solve(comps, nl, t, { g }, prev)
    if (!r.ok) {
      out.error = `${r.error} (at t = ${formatEng(t, 's')})`
      break
    }
    for (const c of comps) if (c.kind === 'C' || c.kind === 'L') {
      const [a, b] = nl.term.get(c.id)!
      vc.set(c.id, r.v[a] - r.v[b])
      ic.set(c.id, r.i.get(c.id)!)
    }
    prev = r.v
    out.t.push(t)
    out.v.push(r.v)
    rec(r.i)
  }
  return out
}
