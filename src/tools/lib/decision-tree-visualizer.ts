// CART classification trees: Gini/entropy, numeric thresholds + categorical subset splits,
// depth/min-sample limits, minimal cost-complexity (weakest-link) pruning, importances, layout.

export type Criterion = 'gini' | 'entropy'
export type Cell = number | string

export interface Dataset {
  features: string[]
  /** true when every non-empty value in the column is numeric */
  numeric: boolean[]
  X: Cell[][]
  y: string[]
  classes: string[]
}

export interface Node {
  id: number
  depth: number
  n: number
  counts: number[]
  impurity: number
  pred: number
  /** split (absent for leaves) */
  feature?: number
  threshold?: number
  /** categorical split: values that go left */
  left?: Node
  right?: Node
  cats?: string[]
}

export interface Params { criterion: Criterion; maxDepth: number; minSplit: number; minLeaf: number }

// ---------- CSV ----------

export function parseCsv(text: string): string[][] {
  const delim = (text.split('\n')[0].match(/;/g)?.length ?? 0) > (text.split('\n')[0].match(/,/g)?.length ?? 0) ? ';' : text.split('\n')[0].includes('\t') && !text.split('\n')[0].includes(',') ? '\t' : ','
  const rows: string[][] = []
  let row: string[] = [], cur = '', q = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++ }
      else if (ch === '"') q = false
      else cur += ch
    } else if (ch === '"') q = true
    else if (ch === delim) { row.push(cur); cur = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(cur); cur = ''
      if (row.some((c) => c.trim() !== '')) rows.push(row.map((c) => c.trim()))
      row = []
    } else cur += ch
  }
  row.push(cur)
  if (row.some((c) => c.trim() !== '')) rows.push(row.map((c) => c.trim()))
  return rows
}

/** Builds a dataset from CSV rows (first row = header). Rows with a missing target are skipped. */
export function toDataset(rows: string[][], target: number, drop: number[] = []): Dataset {
  const head = rows[0] ?? []
  const body = rows.slice(1).filter((r) => (r[target] ?? '') !== '')
  const cols = head.map((_, j) => j).filter((j) => j !== target && !drop.includes(j))
  const numeric = cols.map((j) => body.every((r) => (r[j] ?? '') === '' || Number.isFinite(Number(r[j]))) && body.some((r) => (r[j] ?? '') !== ''))
  const X = body.map((r) => cols.map((j, k) => (numeric[k] ? ((r[j] ?? '') === '' ? NaN : Number(r[j])) : (r[j] ?? '') || '?')))
  const y = body.map((r) => r[target])
  const classes = [...new Set(y)].sort()
  return { features: cols.map((j) => head[j] || `col${j + 1}`), numeric, X, y, classes }
}

// ---------- impurity ----------

export function impurity(counts: number[], n: number, c: Criterion): number {
  if (n <= 0) return 0
  let s = c === 'gini' ? 1 : 0
  for (const k of counts) {
    if (!k) continue
    const p = k / n
    if (c === 'gini') s -= p * p
    else s -= p * Math.log2(p)
  }
  return Math.max(0, s)
}

const argmax = (a: number[]) => a.reduce((b, v, i) => (v > a[b] ? i : b), 0)

interface Split { feature: number; threshold?: number; cats?: string[]; score: number }

function bestSplit(d: Dataset, idx: number[], yi: number[], p: Params): Split | null {
  const K = d.classes.length
  const n = idx.length
  let best: Split | null = null
  const consider = (feature: number, lc: number[], nl: number, rc: number[], nr: number, extra: Partial<Split>) => {
    if (nl < p.minLeaf || nr < p.minLeaf) return
    const score = (nl * impurity(lc, nl, p.criterion) + nr * impurity(rc, nr, p.criterion)) / n
    if (!best || score < best.score - 1e-12) best = { feature, score, ...extra }
  }
  for (let f = 0; f < d.features.length; f++) {
    if (d.numeric[f]) {
      const ord = idx.filter((i) => Number.isFinite(d.X[i][f] as number)).sort((a, b) => (d.X[a][f] as number) - (d.X[b][f] as number))
      if (ord.length < n) continue // rows with missing values: skip feature at this node
      const lc = new Array(K).fill(0), rc = new Array(K).fill(0)
      for (const i of ord) rc[yi[i]]++
      for (let k = 0; k < ord.length - 1; k++) {
        const i = ord[k]
        lc[yi[i]]++
        rc[yi[i]]--
        const v = d.X[i][f] as number, w = d.X[ord[k + 1]][f] as number
        if (w === v) continue
        consider(f, lc, k + 1, rc, n - k - 1, { threshold: (v + w) / 2 })
      }
    } else {
      // per-category class counts; try prefix splits of categories ordered by each class's share
      const m = new Map<string, number[]>()
      for (const i of idx) {
        const v = String(d.X[i][f])
        if (!m.has(v)) m.set(v, new Array(K).fill(0))
        m.get(v)![yi[i]]++
      }
      const cats = [...m.keys()]
      if (cats.length < 2) continue
      const tried = new Set<string>()
      for (let cls = 0; cls < (K === 2 ? 1 : K); cls++) {
        const ord = [...cats].sort((a, b) => {
          const ca = m.get(a)!, cb = m.get(b)!
          const pa = ca[cls] / ca.reduce((s, x) => s + x, 0), pb = cb[cls] / cb.reduce((s, x) => s + x, 0)
          return pa - pb || (a < b ? -1 : 1)
        })
        const lc = new Array(K).fill(0)
        let nl = 0
        for (let k = 0; k < ord.length - 1; k++) {
          const cc = m.get(ord[k])!
          cc.forEach((v, j) => (lc[j] += v))
          nl += cc.reduce((s, x) => s + x, 0)
          const left = ord.slice(0, k + 1).sort()
          const key = left.join('\u0001')
          if (tried.has(key)) continue
          tried.add(key)
          const tot = new Array(K).fill(0)
          for (const i of idx) tot[yi[i]]++
          consider(f, lc, nl, tot.map((v, j) => v - lc[j]), n - nl, { cats: left })
        }
      }
    }
  }
  return best
}

/** Grows a CART tree on the rows in `idx`. */
export function train(d: Dataset, idx: number[], p: Params): Node {
  const yi = d.y.map((v) => d.classes.indexOf(v))
  let id = 0
  const grow = (rows: number[], depth: number): Node => {
    const counts = new Array(d.classes.length).fill(0)
    for (const i of rows) counts[yi[i]]++
    const node: Node = { id: id++, depth, n: rows.length, counts, impurity: impurity(counts, rows.length, p.criterion), pred: argmax(counts) }
    if (depth >= p.maxDepth || rows.length < p.minSplit || node.impurity <= 1e-12) return node
    const sp = bestSplit(d, rows, yi, p)
    if (!sp || sp.score >= node.impurity - 1e-12) return node
    node.feature = sp.feature
    node.threshold = sp.threshold
    node.cats = sp.cats
    const L: number[] = [], R: number[] = []
    for (const i of rows) (goesLeft(node, d.X[i]) ? L : R).push(i)
    node.left = grow(L, depth + 1)
    node.right = grow(R, depth + 1)
    return node
  }
  return grow(idx, 0)
}

export function goesLeft(n: Node, x: Cell[]): boolean {
  const v = x[n.feature!]
  if (n.cats) return n.cats.includes(String(v))
  return (v as number) <= n.threshold!
}

export function predictPath(root: Node, x: Cell[]): Node[] {
  const path = [root]
  let n = root
  while (n.left && n.right) {
    n = goesLeft(n, x) ? n.left : n.right
    path.push(n)
  }
  return path
}

export const predict = (root: Node, x: Cell[]) => predictPath(root, x).at(-1)!.pred

export function leaves(n: Node): Node[] {
  return n.left && n.right ? [...leaves(n.left), ...leaves(n.right)] : [n]
}

export function nodes(n: Node): Node[] {
  return n.left && n.right ? [n, ...nodes(n.left), ...nodes(n.right)] : [n]
}

// ---------- cost-complexity pruning (Breiman et al., weakest link) ----------

const errLeaf = (n: Node, N: number) => (n.n - n.counts[n.pred]) / N

function clone(n: Node): Node {
  return { ...n, left: n.left && clone(n.left), right: n.right && clone(n.right) }
}

/** g(t) = (R(t) − R(T_t)) / (|leaves(T_t)| − 1) for each internal node. */
function weakest(root: Node, N: number): { node: Node; g: number } | null {
  let best: { node: Node; g: number } | null = null
  for (const t of nodes(root)) {
    if (!t.left) continue
    const lv = leaves(t)
    const g = (errLeaf(t, N) - lv.reduce((s, l) => s + errLeaf(l, N), 0)) / (lv.length - 1)
    if (!best || g < best.g - 1e-15) best = { node: t, g }
  }
  return best
}

const collapse = (t: Node) => {
  delete t.left
  delete t.right
  delete t.feature
  delete t.threshold
  delete t.cats
}

/** Returns the smallest optimally-pruned subtree for complexity parameter alpha. */
export function prune(root: Node, alpha: number): Node {
  const t = clone(root)
  const N = root.n
  for (;;) {
    const w = weakest(t, N)
    if (!w || w.g > alpha + 1e-12) return t
    collapse(w.node)
  }
}

/** The pruning sequence: effective alphas and the leaf count after pruning at each. */
export function pruningPath(root: Node): { alpha: number; leaves: number; tree: Node }[] {
  const t = clone(root)
  const N = root.n
  const out = [{ alpha: 0, leaves: leaves(t).length, tree: clone(t) }]
  for (;;) {
    const w = weakest(t, N)
    if (!w) return out
    const a = Math.max(0, w.g)
    // collapse every node tied at this alpha
    for (;;) {
      const v = weakest(t, N)
      if (!v || v.g > a + 1e-12) break
      collapse(v.node)
    }
    out.push({ alpha: a, leaves: leaves(t).length, tree: clone(t) })
  }
}

// ---------- evaluation ----------

/** Mean decrease in impurity, normalised to sum 1. */
export function importance(root: Node, nFeat: number): number[] {
  const imp = new Array(nFeat).fill(0)
  for (const t of nodes(root)) {
    if (!t.left || !t.right) continue
    imp[t.feature!] += t.n * t.impurity - t.left.n * t.left.impurity - t.right.n * t.right.impurity
  }
  const s = imp.reduce((a, b) => a + b, 0)
  return imp.map((v) => (s > 0 ? v / s : 0))
}

export function confusion(root: Node, d: Dataset, idx: number[]): { m: number[][]; acc: number } {
  const K = d.classes.length
  const m = Array.from({ length: K }, () => new Array(K).fill(0))
  let ok = 0
  for (const i of idx) {
    const t = d.classes.indexOf(d.y[i]), p = predict(root, d.X[i])
    m[t][p]++
    if (t === p) ok++
  }
  return { m, acc: idx.length ? ok / idx.length : NaN }
}

/** Seeded stratified train/test split. */
export function holdout(d: Dataset, testFrac: number, seed: number): { train: number[]; test: number[] } {
  let s = seed >>> 0 || 1
  const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296)
  const train: number[] = [], test: number[] = []
  for (const c of d.classes) {
    const g = d.y.map((v, i) => (v === c ? i : -1)).filter((i) => i >= 0)
    for (let i = g.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1))
      ;[g[i], g[j]] = [g[j], g[i]]
    }
    const k = Math.round(g.length * testFrac)
    test.push(...g.slice(0, k))
    train.push(...g.slice(k))
  }
  return { train: train.sort((a, b) => a - b), test: test.sort((a, b) => a - b) }
}

// ---------- layout ----------

export interface Placed { node: Node; x: number; y: number; parent?: Placed }

/** Tidy layered layout: leaves are spaced evenly left-to-right, parents centred over children. */
export function layout(root: Node, dx = 1, dy = 1): { placed: Placed[]; width: number; height: number } {
  const placed: Placed[] = []
  let next = 0, maxD = 0
  const walk = (n: Node, parent?: Placed): Placed => {
    const p: Placed = { node: n, x: 0, y: n.depth * dy, parent }
    placed.push(p)
    maxD = Math.max(maxD, n.depth)
    if (n.left && n.right) {
      const a = walk(n.left, p), b = walk(n.right, p)
      p.x = (a.x + b.x) / 2
    } else p.x = next++ * dx
    return p
  }
  walk(root)
  return { placed, width: Math.max(1, next) * dx, height: (maxD + 1) * dy }
}

export function describeSplit(d: Dataset, n: Node, fmtNum: (v: number) => string = (v) => String(+v.toFixed(4))): string {
  if (n.feature === undefined) return ''
  const f = d.features[n.feature]
  if (n.cats) return n.cats.length <= 3 ? `${f} ∈ {${n.cats.join(', ')}}` : `${f} ∈ {${n.cats.slice(0, 2).join(', ')}, +${n.cats.length - 2}}`
  return `${f} ≤ ${fmtNum(n.threshold!)}`
}
