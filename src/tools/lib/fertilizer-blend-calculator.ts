// Least-cost fertilizer blend via a small two-phase simplex LP solver.

export interface Constraint { a: number[]; op: '>=' | '<=' | '='; b: number }
export type LPResult = { status: 'optimal'; x: number[]; value: number } | { status: 'infeasible' | 'unbounded' }

const EPS = 1e-9

/** Minimise c·x subject to constraints and x ≥ 0. */
export function solveLP(c: number[], cons: Constraint[]): LPResult {
  const n = c.length
  const m = cons.length
  const rows = cons.map((k) => (k.b < 0 ? { a: k.a.map((v) => -v), op: k.op === '>=' ? '<=' : k.op === '<=' ? '>=' : '=', b: -k.b } : { ...k }))
  const nSlack = rows.filter((r) => r.op !== '=').length
  const nArt = rows.filter((r) => r.op !== '<=').length
  const N = n + nSlack + nArt
  const A: number[][] = []
  const b: number[] = []
  const basis: number[] = []
  const isArt = new Array(N).fill(false)
  let si = n, ai = n + nSlack
  rows.forEach((r) => {
    const row = new Array(N).fill(0)
    for (let j = 0; j < n; j++) row[j] = r.a[j] ?? 0
    if (r.op === '<=') {
      row[si] = 1
      basis.push(si++)
    } else {
      if (r.op === '>=') row[si++] = -1
      row[ai] = 1
      isArt[ai] = true
      basis.push(ai++)
    }
    A.push(row)
    b.push(r.b)
  })

  const pivot = (pr: number, pc: number) => {
    const p = A[pr][pc]
    for (let j = 0; j < N; j++) A[pr][j] /= p
    b[pr] /= p
    for (let i = 0; i < m; i++) {
      if (i === pr) continue
      const f = A[i][pc]
      if (Math.abs(f) < EPS) continue
      for (let j = 0; j < N; j++) A[i][j] -= f * A[pr][j]
      b[i] -= f * b[pr]
    }
    basis[pr] = pc
  }
  const run = (cost: number[], allowed: (j: number) => boolean): 'optimal' | 'unbounded' => {
    for (let iter = 0; iter < 500; iter++) {
      let enter = -1
      for (let j = 0; j < N; j++) {
        if (!allowed(j) || basis.includes(j)) continue
        let r = cost[j]
        for (let i = 0; i < m; i++) r -= cost[basis[i]] * A[i][j]
        if (r < -1e-10) { enter = j; break } // Bland's rule: first improving column
      }
      if (enter < 0) return 'optimal'
      let leave = -1, best = Infinity
      for (let i = 0; i < m; i++) {
        if (A[i][enter] > EPS) {
          const ratio = b[i] / A[i][enter]
          if (ratio < best - 1e-12 || (Math.abs(ratio - best) <= 1e-12 && basis[i] < basis[leave])) { best = ratio; leave = i }
        }
      }
      if (leave < 0) return 'unbounded'
      pivot(leave, enter)
    }
    return 'optimal'
  }

  if (nArt) {
    const c1 = isArt.map((x) => (x ? 1 : 0))
    run(c1, () => true)
    const infeas = basis.reduce((s, j, i) => s + (isArt[j] ? b[i] : 0), 0)
    if (infeas > 1e-7) return { status: 'infeasible' }
    basis.forEach((j, i) => {
      if (!isArt[j]) return
      const k = A[i].findIndex((v, col) => !isArt[col] && Math.abs(v) > EPS)
      if (k >= 0) pivot(i, k)
    })
  }
  const c2 = new Array(N).fill(0)
  c.forEach((v, j) => (c2[j] = v))
  if (run(c2, (j) => !isArt[j]) === 'unbounded') return { status: 'unbounded' }
  const x = new Array(n).fill(0)
  basis.forEach((j, i) => { if (j < n) x[j] = Math.max(0, b[i]) })
  return { status: 'optimal', x, value: x.reduce((s, v, j) => s + v * c[j], 0) }
}

export interface Product { id: string; name: string; n: number; p: number; k: number; s: number; price: number; on: boolean }

export const PRODUCTS: Product[] = [
  { id: 'urea', name: 'Urea', n: 46, p: 0, k: 0, s: 0, price: 420, on: true },
  { id: 'an', name: 'Ammonium nitrate', n: 34, p: 0, k: 0, s: 0, price: 380, on: true },
  { id: 'can', name: 'CAN', n: 27, p: 0, k: 0, s: 0, price: 330, on: true },
  { id: 'as', name: 'Ammonium sulfate', n: 21, p: 0, k: 0, s: 24, price: 260, on: true },
  { id: 'map', name: 'MAP', n: 11, p: 52, k: 0, s: 0, price: 640, on: true },
  { id: 'dap', name: 'DAP', n: 18, p: 46, k: 0, s: 0, price: 610, on: true },
  { id: 'tsp', name: 'Triple superphosphate', n: 0, p: 46, k: 0, s: 0, price: 520, on: true },
  { id: 'ssp', name: 'Single superphosphate', n: 0, p: 20, k: 0, s: 12, price: 240, on: true },
  { id: 'mop', name: 'Muriate of potash (KCl)', n: 0, p: 0, k: 60, s: 0, price: 380, on: true },
  { id: 'sop', name: 'Sulfate of potash', n: 0, p: 0, k: 50, s: 18, price: 600, on: true },
  { id: 'npk15', name: 'NPK 15-15-15', n: 15, p: 15, k: 15, s: 0, price: 450, on: true },
  { id: 'npk10', name: 'NPK 10-26-26', n: 10, p: 26, k: 26, s: 0, price: 530, on: true },
  { id: 'kn', name: 'Potassium nitrate', n: 13, p: 0, k: 46, s: 0, price: 1100, on: false },
]

export const NUTRIENTS = ['n', 'p', 'k', 's'] as const
export type Nutrient = (typeof NUTRIENTS)[number]

/**
 * Least-cost kg/ha of each product meeting targets (kg/ha of N, P2O5, K2O, S).
 * maxOver: optional cap, e.g. 0.2 = no more than 20 % above each non-zero target.
 * Prices are per tonne.
 */
export function bestBlend(products: Product[], target: Record<Nutrient, number>, maxOver?: number) {
  const use = products.filter((p) => p.on)
  const cons: Constraint[] = []
  for (const nu of NUTRIENTS) {
    const a = use.map((p) => p[nu] / 100)
    if (target[nu] > 0) {
      cons.push({ a, op: '>=', b: target[nu] })
      if (maxOver !== undefined) cons.push({ a, op: '<=', b: target[nu] * (1 + maxOver) })
    }
  }
  if (!cons.length) return { status: 'optimal' as const, rates: use.map((p) => ({ p, kg: 0 })), cost: 0 }
  const r = solveLP(use.map((p) => p.price / 1000), cons)
  if (r.status !== 'optimal') return { status: r.status, rates: [], cost: NaN }
  return { status: 'optimal' as const, rates: use.map((p, i) => ({ p, kg: r.x[i] })), cost: r.value }
}

export function supplied(rates: { p: Product; kg: number }[]): Record<Nutrient, number> {
  const o = { n: 0, p: 0, k: 0, s: 0 }
  for (const { p, kg } of rates) for (const nu of NUTRIENTS) o[nu] += (kg * p[nu]) / 100
  return o
}
