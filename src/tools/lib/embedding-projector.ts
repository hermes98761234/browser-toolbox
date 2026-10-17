// Embedding projector math: parsing vectors, PCA (power iteration), exact t-SNE, cosine neighbours.
// Everything here is self-contained so the t-SNE worker can import it.

export interface Dataset {
  labels: string[]
  cats: string[] | null
  X: number[][]
  dim: number
  skipped: number
}

/** Seeded PRNG (mulberry32). */
export function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function gauss(r: () => number) {
  return Math.sqrt(-2 * Math.log(r() || 1e-12)) * Math.cos(2 * Math.PI * r())
}

/**
 * Parses CSV / TSV / space-separated vectors. Non-numeric cells become the label (first) and
 * category (second). A header row (mostly non-numeric) is skipped. word2vec text format works too.
 */
export function parseVectors(text: string): Dataset {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
  const rows = lines.map((l) => (l.includes(',') ? l.split(',') : l.includes('\t') ? l.split('\t') : l.split(/\s+/)).map((c) => c.trim().replace(/^"(.*)"$/, '$1')))
  const isNum = (c: string) => c !== '' && Number.isFinite(Number(c))
  // most common count of numeric cells = the dimension
  const counts = new Map<number, number>()
  for (const r of rows) {
    const k = r.filter(isNum).length
    if (k > 1) counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  const dim = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0
  const labels: string[] = []
  const catsRaw: string[] = []
  const X: number[][] = []
  let skipped = 0
  for (const r of rows) {
    const nums = r.filter(isNum).map(Number)
    if (!nums.length) continue // header or comment-like row
    if (nums.length !== dim || !dim) {
      skipped++
      continue
    }
    const words = r.filter((c) => !isNum(c) && c !== '')
    labels.push(words[0] ?? `#${X.length + 1}`)
    catsRaw.push(words[1] ?? '')
    X.push(nums)
  }
  const cats = catsRaw.some((c) => c) ? catsRaw.map((c) => c || '(none)') : null
  return { labels, cats, X, dim, skipped }
}

export function l2normalize(X: number[][]): number[][] {
  return X.map((v) => {
    const n = Math.hypot(...v) || 1
    return v.map((x) => x / n)
  })
}

export interface PcaResult {
  Y: number[][]
  variance: number[]
  ratio: number[]
}

/** PCA to k components via power iteration with Gram–Schmidt deflation (no d×d matrix). */
export function pca(X: number[][], k = 3, seed = 7): PcaResult {
  const n = X.length
  const d = X[0]?.length ?? 0
  const mean = new Array(d).fill(0)
  for (const v of X) for (let j = 0; j < d; j++) mean[j] += v[j] / n
  const C = X.map((v) => v.map((x, j) => x - mean[j]))
  let total = 0
  for (const v of C) for (const x of v) total += x * x
  total /= Math.max(1, n - 1)
  const r = rng(seed)
  const comps: number[][] = []
  const variance: number[] = []
  const kk = Math.min(k, d, Math.max(1, n - 1))
  for (let c = 0; c < kk; c++) {
    let v = Array.from({ length: d }, () => r() - 0.5)
    let lambda = 0
    for (let it = 0; it < 300; it++) {
      // w = Cᵀ (C v)
      const s = C.map((row) => row.reduce((a, x, j) => a + x * v[j], 0))
      const w = new Array(d).fill(0)
      for (let i = 0; i < n; i++) for (let j = 0; j < d; j++) w[j] += C[i][j] * s[i]
      for (const p of comps) {
        const dot = w.reduce((a, x, j) => a + x * p[j], 0)
        for (let j = 0; j < d; j++) w[j] -= dot * p[j]
      }
      const norm = Math.hypot(...w)
      if (norm < 1e-300) break
      const nv = w.map((x) => x / norm)
      const diff = nv.reduce((a, x, j) => a + Math.abs(x - v[j]), 0)
      v = nv
      lambda = norm / Math.max(1, n - 1)
      if (diff < 1e-10) break
    }
    comps.push(v)
    variance.push(lambda)
  }
  const Y = C.map((row) => {
    const out = comps.map((p) => row.reduce((a, x, j) => a + x * p[j], 0))
    while (out.length < k) out.push(0)
    return out
  })
  while (variance.length < k) variance.push(0)
  return { Y, variance, ratio: variance.map((v) => (total ? v / total : 0)) }
}

export interface TsneOpts {
  dims: number
  perplexity: number
  iterations: number
  learningRate?: number
  exaggeration?: number
  exaggerationIters?: number
  seed?: number
  /** Called every `every` iterations with the current layout; return false to stop. */
  onStep?: (iter: number, Y: Float64Array, kl: number) => boolean | void
  every?: number
}

/** Conditional probabilities with per-point bandwidth matched to the perplexity, symmetrised. */
export function affinities(X: number[][], perplexity: number): Float64Array {
  const n = X.length
  const D = new Float64Array(n * n)
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      let s = 0
      const a = X[i], b = X[j]
      for (let k = 0; k < a.length; k++) s += (a[k] - b[k]) ** 2
      D[i * n + j] = D[j * n + i] = s
    }
  const P = new Float64Array(n * n)
  const target = Math.log(Math.max(1.5, Math.min(perplexity, (n - 1) / 3)))
  const row = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    let beta = 1, lo = -Infinity, hi = Infinity
    // scale initial beta to the data so the search converges fast
    let mean = 0
    for (let j = 0; j < n; j++) if (j !== i) mean += D[i * n + j] / (n - 1)
    beta = mean > 0 ? 1 / mean : 1
    for (let t = 0; t < 64; t++) {
      let sum = 0
      let dsum = 0
      for (let j = 0; j < n; j++) {
        const p = j === i ? 0 : Math.exp(-D[i * n + j] * beta)
        row[j] = p
        sum += p
        dsum += D[i * n + j] * p
      }
      if (sum === 0) sum = 1e-300
      const H = Math.log(sum) + (beta * dsum) / sum
      for (let j = 0; j < n; j++) row[j] /= sum
      const diff = H - target
      if (Math.abs(diff) < 1e-5) break
      if (diff > 0) {
        lo = beta
        beta = hi === Infinity ? beta * 2 : (beta + hi) / 2
      } else {
        hi = beta
        beta = lo === -Infinity ? beta / 2 : (beta + lo) / 2
      }
    }
    for (let j = 0; j < n; j++) P[i * n + j] = row[j]
  }
  const S = new Float64Array(n * n)
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) S[i * n + j] = Math.max((P[i * n + j] + P[j * n + i]) / (2 * n), 1e-12)
  return S
}

/** Exact O(n²) t-SNE (van der Maaten 2008) with early exaggeration, momentum and gains. */
export function tsne(X: number[][], o: TsneOpts): Float64Array {
  const n = X.length
  const dims = o.dims
  const P = affinities(X, o.perplexity)
  const exag = o.exaggeration ?? 12
  const exIters = o.exaggerationIters ?? Math.min(250, Math.floor(o.iterations / 3))
  const lr = o.learningRate ?? Math.max(10, n / exag) // auto rate (Belkina et al. 2019)
  // PCA initialisation, scaled to a tiny spread (std 1e-4 on PC1) — deterministic and stable
  const init = pca(X, dims, o.seed ?? 7).Y
  let sd = 0
  for (const v of init) sd += v[0] * v[0]
  sd = Math.sqrt(sd / Math.max(1, n)) || 1
  const Y = new Float64Array(n * dims)
  const r = rng(o.seed ?? 7)
  for (let i = 0; i < n; i++) for (let d = 0; d < dims; d++) Y[i * dims + d] = (init[i][d] / sd) * 1e-4 + (r() - 0.5) * 1e-6
  const U = new Float64Array(n * dims)
  const G = new Float64Array(n * dims).fill(1)
  const grad = new Float64Array(n * dims)
  const num = new Float64Array(n * n)
  const every = o.every ?? 10
  for (let it = 0; it < o.iterations; it++) {
    const ex = it < exIters ? exag : 1
    let Z = 0
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) {
        let s = 0
        for (let d = 0; d < dims; d++) s += (Y[i * dims + d] - Y[j * dims + d]) ** 2
        const q = 1 / (1 + s)
        num[i * n + j] = num[j * n + i] = q
        Z += 2 * q
      }
    grad.fill(0)
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        if (i === j) continue
        const q = num[i * n + j]
        const m = 4 * (ex * P[i * n + j] - q / Z) * q
        for (let d = 0; d < dims; d++) grad[i * dims + d] += m * (Y[i * dims + d] - Y[j * dims + d])
      }
    const mom = it < exIters ? 0.5 : 0.8
    const mean = new Float64Array(dims)
    for (let k = 0; k < n * dims; k++) {
      const g = grad[k]
      G[k] = Math.sign(g) !== Math.sign(U[k]) ? G[k] + 0.2 : Math.max(0.01, G[k] * 0.8)
      U[k] = mom * U[k] - lr * G[k] * g
      Y[k] += U[k]
      mean[k % dims] += Y[k] / n
    }
    for (let k = 0; k < n * dims; k++) Y[k] -= mean[k % dims]
    if (o.onStep && (it % every === every - 1 || it === o.iterations - 1)) {
      let kl = 0
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (i !== j) kl += P[i * n + j] * Math.log(P[i * n + j] / Math.max(num[i * n + j] / Z, 1e-12))
      if (o.onStep(it + 1, Y, kl) === false) break
    }
  }
  return Y
}

export function cosine(a: number[], b: number[]) {
  let d = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) {
    d += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  return d / (Math.sqrt(na * nb) || 1)
}

export function neighbours(X: number[][], i: number, k = 8): { j: number; sim: number }[] {
  return X.map((v, j) => ({ j, sim: j === i ? -Infinity : cosine(X[i], v) }))
    .sort((a, b) => b.sim - a.sim)
    .slice(0, k)
}

/** Synthetic word-embedding sample: 6 topics with sub-groups, 48 dimensions. */
export function sampleCsv(): string {
  const topics: [string, string[][]][] = [
    ['animal', [['cat', 'dog', 'rabbit', 'hamster', 'parrot', 'goldfish'], ['lion', 'tiger', 'wolf', 'fox', 'bear', 'eagle', 'shark']]],
    ['fruit', [['apple', 'pear', 'plum', 'cherry', 'peach'], ['banana', 'mango', 'pineapple', 'papaya', 'coconut', 'kiwi']]],
    ['country', [['France', 'Germany', 'Italy', 'Spain', 'Poland', 'Ukraine'], ['Japan', 'China', 'India', 'Vietnam'], ['Brazil', 'Mexico', 'Peru', 'Chile']]],
    ['color', [['red', 'orange', 'yellow', 'pink'], ['blue', 'green', 'teal', 'purple'], ['black', 'white', 'gray']]],
    ['vehicle', [['car', 'bus', 'truck', 'taxi', 'van'], ['train', 'tram', 'subway'], ['airplane', 'helicopter', 'boat', 'ship']]],
    ['emotion', [['happy', 'joyful', 'proud', 'excited', 'calm'], ['sad', 'angry', 'afraid', 'nervous', 'bored']]],
  ]
  const D = 48
  const r = rng(2024)
  const vec = (s: number) => Array.from({ length: D }, () => gauss(r) * s)
  const lines = ['label,topic,' + Array.from({ length: D }, (_, i) => `d${i}`).join(',')]
  for (const [topic, groups] of topics) {
    const c = vec(1)
    for (const g of groups) {
      const gc = vec(0.45)
      for (const w of g) {
        const n = vec(0.22)
        lines.push(`${w},${topic},` + c.map((x, i) => (x + gc[i] + n[i]).toFixed(4)).join(','))
      }
    }
  }
  return lines.join('\n')
}

/** Three Gaussian blobs in 5-D with labels — a quick sanity dataset. */
export function blobsCsv(perBlob = 40, seed = 3): string {
  const r = rng(seed)
  const lines: string[] = []
  const centers = [[6, 0, 0, 0, 0], [0, 6, 0, 0, 0], [0, 0, 6, 0, 0]]
  centers.forEach((c, k) => {
    for (let i = 0; i < perBlob; i++) lines.push([`p${k}-${i}`, `blob ${k + 1}`, ...c.map((x) => (x + gauss(r)).toFixed(3))].join(','))
  })
  return lines.join('\n')
}

/** Swiss-roll-ish spiral in 3-D (labels = position along the roll). */
export function spiralCsv(n = 300, seed = 5): string {
  const r = rng(seed)
  const lines: string[] = []
  for (let i = 0; i < n; i++) {
    const t = 1.5 * Math.PI * (1 + 2 * (i / n))
    const h = r() * 10
    lines.push([`s${i}`, `segment ${Math.min(5, Math.floor((i / n) * 5) + 1)}`, (t * Math.cos(t)).toFixed(3), h.toFixed(3), (t * Math.sin(t)).toFixed(3)].join(','))
  }
  return lines.join('\n')
}
