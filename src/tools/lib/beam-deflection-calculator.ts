// Euler–Bernoulli beam analysis by superposition.
// Determinate beams: reactions from equilibrium; indeterminate (propped, fixed–fixed):
// cantilever base + redundant reactions solved from compatibility (zero deflection/slope).
// Sign convention: downward loads positive, sagging moment positive, deflection positive up.

export type Support = 'simple' | 'cantilever' | 'overhang' | 'propped' | 'fixed'

export interface Load {
  id: string
  kind: 'point' | 'udl' | 'moment'
  /** position (point/moment) or start (udl), m */
  x: number
  /** end of udl, m */
  x2: number
  /** kN (point), kN/m (udl), kN·m clockwise (moment) */
  v: number
}

interface Force { x: number; F: number } // upward force, N
interface Couple { x: number; C: number } // clockwise couple, N·m

export interface BeamInput {
  L: number
  support: Support
  /** support positions for 'overhang' (m) */
  a: number
  b: number
  EI: number // N·m²
  loads: Load[]
}

export interface BeamResult {
  xs: number[]
  V: number[] // N
  M: number[] // N·m
  theta: number[] // rad
  y: number[] // m (positive up)
  reactions: { x: number; F: number; M?: number; label: string }[]
  maxV: { x: number; v: number }
  maxM: { x: number; v: number }
  minM: { x: number; v: number }
  maxDefl: { x: number; v: number }
}

/** Loads → equivalent internal forces (downward → negative upward force). */
function toForces(loads: Load[], L: number): { forces: Force[]; udl: { a: number; b: number; w: number }[]; couples: Couple[] } {
  const forces: Force[] = [], couples: Couple[] = [], udl: { a: number; b: number; w: number }[] = []
  for (const l of loads) {
    if (!Number.isFinite(l.v) || l.v === 0) continue
    if (l.kind === 'point') forces.push({ x: clampX(l.x, L), F: -l.v * 1e3 })
    else if (l.kind === 'moment') couples.push({ x: clampX(l.x, L), C: l.v * 1e3 })
    else {
      const a = clampX(Math.min(l.x, l.x2), L), b = clampX(Math.max(l.x, l.x2), L)
      if (b > a) udl.push({ a, b, w: l.v * 1e3 })
    }
  }
  return { forces, udl, couples }
}
const clampX = (x: number, L: number) => Math.min(L, Math.max(0, x))

/** Shear and moment at x from everything to the right of the cut (sagging +). */
function internal(x: number, f: ReturnType<typeof toForces>): [number, number] {
  let V = 0, M = 0
  for (const p of f.forces) if (p.x > x) { V -= p.F; M += p.F * (p.x - x) }
  for (const c of f.couples) if (c.x > x) M -= c.C
  for (const u of f.udl) {
    const a = Math.max(u.a, x)
    if (u.b <= a) continue
    const W = u.w * (u.b - a)
    V += W
    M -= W * ((a + u.b) / 2 - x)
  }
  return [V, M]
}

/** Totals of the applied loads: vertical (up) and moment about x=0 (counter-clockwise). */
function totals(f: ReturnType<typeof toForces>): [number, number] {
  let Fy = 0, Mz = 0
  for (const p of f.forces) { Fy += p.F; Mz += p.F * p.x }
  for (const c of f.couples) Mz -= c.C
  for (const u of f.udl) { const W = u.w * (u.b - u.a); Fy -= W; Mz -= W * (u.a + u.b) / 2 }
  return [Fy, Mz]
}

const N = 1200

/** Integrates M/EI twice with given initial slope/deflection at x=0. */
function integrate(Ms: number[], xs: number[], EI: number, th0: number, y0: number): [number[], number[]] {
  const th = [th0], y = [y0]
  for (let i = 1; i < xs.length; i++) {
    const h = xs[i] - xs[i - 1]
    th.push(th[i - 1] + ((Ms[i - 1] + Ms[i]) / 2) * h / EI)
    // exact for linear M within the step
    y.push(y[i - 1] + th[i - 1] * h + ((2 * Ms[i - 1] + Ms[i]) / 6) * h * h / EI)
  }
  return [th, y]
}

function grid(L: number, f: ReturnType<typeof toForces>, extra: number[]): number[] {
  const pts = new Set<number>()
  for (let i = 0; i <= N; i++) pts.add((L * i) / N)
  // add points just around discontinuities so diagrams show sharp jumps
  for (const x of [...f.forces.map((p) => p.x), ...f.couples.map((c) => c.x), ...f.udl.flatMap((u) => [u.a, u.b]), ...extra, L]) {
    pts.add(x)
    if (x - 1e-9 * L > 0) pts.add(x - 1e-9 * L)
  }
  return [...pts].filter((x) => x >= 0 && x <= L).sort((a, b) => a - b)
}

export function analyze(inp: BeamInput): BeamResult {
  const { L, EI } = inp
  const base = toForces(inp.loads, L)
  const reactions: BeamResult['reactions'] = []
  let f = base
  const [Fy, Mz] = totals(base)

  if (inp.support === 'simple' || inp.support === 'overhang') {
    const a = inp.support === 'simple' ? 0 : clampX(Math.min(inp.a, inp.b), L)
    const b = inp.support === 'simple' ? L : clampX(Math.max(inp.a, inp.b), L)
    if (b - a < 1e-9) throw new Error('Supports must be at different positions')
    // ΣF: Ra + Rb + Fy = 0;  ΣM about x=0: Ra·a + Rb·b + Mz = 0
    const Rb = (Fy * a - Mz) / (b - a)
    const Ra = -Fy - Rb
    reactions.push({ x: a, F: Ra, label: 'Pin A' }, { x: b, F: Rb, label: 'Roller B' })
    f = { ...base, forces: [...base.forces, { x: a, F: Ra }, { x: b, F: Rb }] }
  } else if (inp.support === 'cantilever') {
    // reactions at x = 0 are never "to the right", internal() needs nothing extra
    reactions.push({ x: 0, F: -Fy, M: internal(0, base)[1], label: 'Fixed end' })
  } else {
    // redundants at x = L on a cantilever base
    const xs0 = grid(L, base, [])
    const run = (ff: ReturnType<typeof toForces>) => {
      const Ms = xs0.map((x) => internal(x, ff)[1])
      const [th, y] = integrate(Ms, xs0, EI, 0, 0)
      return [y[y.length - 1], th[th.length - 1]]
    }
    // For a force at x = L (exactly at the end), internal() never counts it (p.x > x fails at x = L only).
    const unitF = run({ forces: [{ x: L, F: 1 }], couples: [], udl: [] })
    const unitC = run({ forces: [], couples: [{ x: L, C: 1 }], udl: [] })
    const load = run(base)
    let R = 0, C = 0
    if (inp.support === 'propped') R = -load[0] / unitF[0]
    else {
      // [uF0 uC0; uF1 uC1] [R C] = −[y θ]
      const det = unitF[0] * unitC[1] - unitC[0] * unitF[1]
      R = (-load[0] * unitC[1] + unitC[0] * load[1]) / det
      C = (-unitF[0] * load[1] + load[0] * unitF[1]) / det
    }
    f = { ...base, forces: [...base.forces, { x: L, F: R }], couples: [...base.couples, { x: L, C }] }
    const [Fy2] = totals(f)
    reactions.push({ x: 0, F: -Fy2, M: internal(0, f)[1], label: 'Fixed end A' })
    reactions.push(inp.support === 'propped' ? { x: L, F: R, label: 'Roller B' } : { x: L, F: R, M: -C, label: 'Fixed end B' })
  }

  const xs = grid(L, f, inp.support === 'overhang' ? [inp.a, inp.b] : [])
  const VM = xs.map((x) => internal(x, f))
  const V = VM.map((p) => p[0]), M = VM.map((p) => p[1])
  let [theta, y] = integrate(M, xs, EI, 0, 0)
  if (inp.support === 'simple' || inp.support === 'overhang') {
    const a = reactions[0].x, b = reactions[1].x
    const at = (x: number) => {
      let i = xs.findIndex((v) => v >= x)
      if (i < 0) i = xs.length - 1
      return y[i]
    }
    // add rigid-body rotation th0·x + y0 so that y(a) = y(b) = 0
    const ya = at(a), yb = at(b)
    const th0 = -(yb - ya) / (b - a)
    const y0 = -ya - th0 * a
    y = y.map((v, i) => v + th0 * xs[i] + y0)
    theta = theta.map((v) => v + th0)
  }
  const ext = (arr: number[], sel: (v: number) => number) => {
    let bi = 0
    for (let i = 1; i < arr.length; i++) if (sel(arr[i]) > sel(arr[bi])) bi = i
    return { x: xs[bi], v: arr[bi] }
  }
  return {
    xs, V, M, theta, y, reactions,
    maxV: ext(V, Math.abs), maxM: ext(M, (v) => v), minM: ext(M, (v) => -v), maxDefl: ext(y, Math.abs),
  }
}
