// Least-cost ration formulation: a small two-phase simplex LP solver plus the ration model.

export type Rel = '<=' | '>=' | '='
export interface Constraint {
  a: number[]
  rel: Rel
  b: number
  name?: string
}
export interface LPResult {
  status: 'optimal' | 'infeasible' | 'unbounded'
  x: number[]
  value: number
}

const EPS = 1e-9

/** Minimize c·x subject to constraints and x ≥ 0 (dense two-phase simplex, Bland's rule). */
export function simplex(c: number[], cons: Constraint[]): LPResult {
  const n = c.length, m = cons.length
  // Normalize so every b ≥ 0.
  const rows = cons.map((k) => (k.b < 0 ? { a: k.a.map((v) => -v), b: -k.b, rel: (k.rel === '<=' ? '>=' : k.rel === '>=' ? '<=' : '=') as Rel } : { a: [...k.a], b: k.b, rel: k.rel }))
  const nSlack = rows.filter((r) => r.rel !== '=').length
  const nArt = rows.filter((r) => r.rel !== '<=').length
  const W = n + nSlack + nArt + 1 // last column = rhs
  const T: number[][] = []
  const basis: number[] = []
  let si = n, ai = n + nSlack
  for (const r of rows) {
    const row = new Array(W).fill(0)
    r.a.forEach((v, j) => (row[j] = v))
    row[W - 1] = r.b
    if (r.rel === '<=') {
      row[si] = 1
      basis.push(si++)
    } else if (r.rel === '>=') {
      row[si++] = -1
      row[ai] = 1
      basis.push(ai++)
    } else {
      row[ai] = 1
      basis.push(ai++)
    }
    T.push(row)
  }
  const pivot = (r: number, col: number) => {
    const p = T[r][col]
    for (let j = 0; j < W; j++) T[r][j] /= p
    for (let i = 0; i < m; i++) {
      if (i === r) continue
      const f = T[i][col]
      if (Math.abs(f) > EPS) for (let j = 0; j < W; j++) T[i][j] -= f * T[r][j]
    }
    basis[r] = col
  }
  /** Runs simplex on objective `obj` (length W-1) over allowed columns. Returns false if unbounded. */
  const run = (obj: number[], allowed: (j: number) => boolean) => {
    for (let iter = 0; iter < 5000; iter++) {
      // reduced costs: obj_j - c_B · column_j
      let enter = -1
      for (let j = 0; j < W - 1; j++) {
        if (!allowed(j) || basis.includes(j)) continue
        let rc = obj[j]
        for (let i = 0; i < m; i++) rc -= obj[basis[i]] * T[i][j]
        if (rc < -1e-9) {
          enter = j
          break // Bland: first improving column
        }
      }
      if (enter < 0) return true
      let leave = -1, best = Infinity
      for (let i = 0; i < m; i++) {
        if (T[i][enter] > EPS) {
          const ratio = T[i][W - 1] / T[i][enter]
          if (ratio < best - 1e-12 || (Math.abs(ratio - best) <= 1e-12 && basis[i] < basis[leave])) {
            best = ratio
            leave = i
          }
        }
      }
      if (leave < 0) return false
      pivot(leave, enter)
    }
    return true
  }
  // Phase 1
  if (nArt) {
    const obj1 = new Array(W - 1).fill(0)
    for (let j = n + nSlack; j < W - 1; j++) obj1[j] = 1
    run(obj1, () => true)
    const infeas = basis.reduce((s, b, i) => s + (b >= n + nSlack ? T[i][W - 1] : 0), 0)
    if (infeas > 1e-7) return { status: 'infeasible', x: new Array(n).fill(0), value: NaN }
    // Drive remaining zero-level artificials out of the basis.
    for (let i = 0; i < m; i++) {
      if (basis[i] < n + nSlack) continue
      const j = T[i].findIndex((v, k) => k < n + nSlack && Math.abs(v) > 1e-9)
      if (j >= 0) pivot(i, j)
    }
  }
  const obj2 = new Array(W - 1).fill(0)
  c.forEach((v, j) => (obj2[j] = v))
  if (!run(obj2, (j) => j < n + nSlack)) return { status: 'unbounded', x: new Array(n).fill(0), value: -Infinity }
  const x = new Array(n).fill(0)
  basis.forEach((b, i) => {
    if (b < n) x[b] = Math.max(0, T[i][W - 1])
  })
  return { status: 'optimal', x, value: x.reduce((s, v, j) => s + v * c[j], 0) }
}

// ---------- ration model ----------

export const NUTS = ['tdn', 'cp', 'ca', 'p', 'ndf'] as const
export type Nut = (typeof NUTS)[number]

export interface Feed {
  id: string
  name: string
  dm: number // % as fed
  tdn: number // % of DM
  cp: number
  ca: number
  p: number
  ndf: number
  cost: number // per tonne as fed
  use: boolean
  min: number // % of ration DM
  max: number
}

export interface Req {
  dmi: number // kg DM / head / day
  tdn: number // minimum % of DM
  cp: number
  ca: number
  p: number
  ndfMin: number
  ndfMax: number
  caPMin: number
  caPMax: number
}

export const costPerKgDM = (f: Feed) => f.cost / 1000 / (f.dm / 100)

export interface Ration {
  status: LPResult['status']
  feeds: Feed[]
  dm: number[] // kg DM per head per day
  asFed: number[]
  cost: number // per head per day
  supply: Record<Nut, number> // % of DM
  caP: number
}

/** Least-cost ration meeting `req` using the feeds marked `use`. */
export function formulate(all: Feed[], req: Req): Ration {
  const feeds = all.filter((f) => f.use)
  const n = feeds.length
  const D = req.dmi
  const col = (k: keyof Feed) => feeds.map((f) => Number(f[k]))
  const cons: Constraint[] = [
    { a: new Array(n).fill(1), rel: '=', b: D, name: 'Dry-matter intake' },
    { a: col('tdn'), rel: '>=', b: req.tdn * D, name: 'TDN (energy)' },
    { a: col('cp'), rel: '>=', b: req.cp * D, name: 'Crude protein' },
    { a: col('ca'), rel: '>=', b: req.ca * D, name: 'Calcium' },
    { a: col('p'), rel: '>=', b: req.p * D, name: 'Phosphorus' },
    { a: col('ndf'), rel: '>=', b: req.ndfMin * D, name: 'Fibre (NDF) minimum' },
    { a: col('ndf'), rel: '<=', b: req.ndfMax * D, name: 'Fibre (NDF) maximum' },
    { a: feeds.map((f) => f.ca - req.caPMin * f.p), rel: '>=', b: 0, name: 'Ca:P minimum' },
    { a: feeds.map((f) => f.ca - req.caPMax * f.p), rel: '<=', b: 0, name: 'Ca:P maximum' },
  ]
  feeds.forEach((f, i) => {
    const e = (v: number) => feeds.map((_, j) => (j === i ? 1 : 0) * v)
    if (f.min > 0) cons.push({ a: e(1), rel: '>=', b: (f.min / 100) * D })
    if (f.max < 100) cons.push({ a: e(1), rel: '<=', b: (f.max / 100) * D })
  })
  const r = n ? simplex(feeds.map(costPerKgDM), cons) : { status: 'infeasible' as const, x: [], value: NaN }
  const dm = r.x
  const tot = dm.reduce((a, b) => a + b, 0) || 1
  const supply = Object.fromEntries(NUTS.map((k) => [k, dm.reduce((s, x, i) => s + x * feeds[i][k], 0) / tot])) as Record<Nut, number>
  return {
    status: r.status,
    feeds,
    dm,
    asFed: dm.map((x, i) => x / (feeds[i].dm / 100)),
    cost: r.status === 'optimal' ? r.value : NaN,
    supply,
    caP: supply.p ? supply.ca / supply.p : 0,
  }
}
