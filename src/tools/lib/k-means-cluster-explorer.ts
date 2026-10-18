// K-means with k-means++ seeding, multiple restarts, elbow and silhouette analysis.

export function rng(seed: number) {
  let a = seed >>> 0 || 1
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const dist2 = (a: number[], b: number[]) => {
  let s = 0
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i]
    s += d * d
  }
  return s
}

/** Z-score each column; returns the scaled data plus mean/sd to map centroids back. */
export function standardize(X: number[][]): { Z: number[][]; mean: number[]; sd: number[] } {
  const d = X[0]?.length ?? 0
  const mean = Array.from({ length: d }, (_, j) => X.reduce((a, r) => a + r[j], 0) / X.length)
  const sd = mean.map((m, j) => Math.sqrt(X.reduce((a, r) => a + (r[j] - m) ** 2, 0) / Math.max(1, X.length - 1)) || 1)
  return { Z: X.map((r) => r.map((v, j) => (v - mean[j]) / sd[j])), mean, sd }
}

/** k-means++: each next centre is drawn with probability proportional to D(x)². */
export function kppInit(X: number[][], k: number, rand: () => number): number[][] {
  const C = [X[Math.floor(rand() * X.length)].slice()]
  const D = X.map((x) => dist2(x, C[0]))
  while (C.length < k) {
    const total = D.reduce((a, b) => a + b, 0)
    let r = rand() * total
    let idx = 0
    if (total === 0) idx = Math.floor(rand() * X.length)
    else
      for (; idx < X.length - 1; idx++) {
        r -= D[idx]
        if (r <= 0) break
      }
    C.push(X[idx].slice())
    for (let i = 0; i < X.length; i++) D[i] = Math.min(D[i], dist2(X[i], C[C.length - 1]))
  }
  return C
}

export interface KMeans { labels: number[]; centroids: number[][]; inertia: number; iterations: number; sizes: number[] }

function lloyd(X: number[][], C: number[][], maxIter: number): KMeans {
  const n = X.length, k = C.length, d = X[0].length
  const labels = new Array<number>(n).fill(-1)
  let it = 0
  for (; it < maxIter; it++) {
    let moved = 0
    for (let i = 0; i < n; i++) {
      let best = 0, bd = Infinity
      for (let c = 0; c < k; c++) {
        const dd = dist2(X[i], C[c])
        if (dd < bd) {
          bd = dd
          best = c
        }
      }
      if (labels[i] !== best) {
        labels[i] = best
        moved++
      }
    }
    const sum = Array.from({ length: k }, () => new Array<number>(d).fill(0))
    const cnt = new Array<number>(k).fill(0)
    for (let i = 0; i < n; i++) {
      cnt[labels[i]]++
      for (let j = 0; j < d; j++) sum[labels[i]][j] += X[i][j]
    }
    for (let c = 0; c < k; c++) {
      if (cnt[c]) C[c] = sum[c].map((v) => v / cnt[c])
      else {
        // empty cluster: re-seed at the point farthest from its centre
        let far = 0, fd = -1
        for (let i = 0; i < n; i++) {
          const dd = dist2(X[i], C[labels[i]])
          if (dd > fd) {
            fd = dd
            far = i
          }
        }
        C[c] = X[far].slice()
      }
    }
    if (moved === 0) break
  }
  let inertia = 0
  const sizes = new Array<number>(k).fill(0)
  for (let i = 0; i < n; i++) {
    inertia += dist2(X[i], C[labels[i]])
    sizes[labels[i]]++
  }
  return { labels, centroids: C, inertia, iterations: it + 1, sizes }
}

/** Best of `restarts` runs (lowest inertia). Deterministic for a given seed. */
export function kmeans(X: number[][], k: number, opts: { seed?: number; restarts?: number; maxIter?: number } = {}): KMeans {
  const rand = rng(opts.seed ?? 42)
  k = Math.max(1, Math.min(k, X.length))
  let best: KMeans | null = null
  for (let r = 0; r < (opts.restarts ?? 8); r++) {
    const res = lloyd(X, kppInit(X, k, rand), opts.maxIter ?? 300)
    if (!best || res.inertia < best.inertia - 1e-12) best = res
  }
  return best!
}

/** Mean silhouette coefficient (−1…1). Uses a deterministic subsample above `maxN` points. */
export function silhouette(X: number[][], labels: number[], k: number, maxN = 800): number {
  if (k < 2) return NaN
  const n = X.length
  const step = Math.max(1, Math.ceil(n / maxN))
  const idx: number[] = []
  for (let i = 0; i < n; i += step) idx.push(i)
  let total = 0, m = 0
  for (const i of idx) {
    const sum = new Array<number>(k).fill(0)
    const cnt = new Array<number>(k).fill(0)
    for (const j of idx) {
      if (j === i) continue
      sum[labels[j]] += Math.sqrt(dist2(X[i], X[j]))
      cnt[labels[j]]++
    }
    const own = labels[i]
    if (cnt[own] === 0) {
      m++ // singleton: s = 0
      continue
    }
    const a = sum[own] / cnt[own]
    let b = Infinity
    for (let c = 0; c < k; c++) if (c !== own && cnt[c]) b = Math.min(b, sum[c] / cnt[c])
    total += Number.isFinite(b) ? (b - a) / Math.max(a, b) : 0
    m++
  }
  return m ? total / m : NaN
}

export interface Sweep { k: number; inertia: number; silhouette: number }

export function sweep(X: number[][], kMax: number, seed = 42): Sweep[] {
  const out: Sweep[] = []
  for (let k = 1; k <= Math.min(kMax, X.length); k++) {
    const r = kmeans(X, k, { seed, restarts: 4 })
    out.push({ k, inertia: r.inertia, silhouette: silhouette(X, r.labels, k) })
  }
  return out
}

/** Elbow = point of the inertia curve farthest from the chord between its ends (Kneedle-like). */
export function elbow(s: Sweep[]): number {
  if (s.length < 3) return s[s.length - 1]?.k ?? 1
  const x0 = s[0].k, y0 = s[0].inertia, x1 = s[s.length - 1].k, y1 = s[s.length - 1].inertia
  const nx = (x: number) => (x - x0) / (x1 - x0 || 1), ny = (y: number) => (y - y1) / (y0 - y1 || 1)
  let best = s[0].k, bd = -1
  for (const p of s) {
    const d = 1 - nx(p.k) - ny(p.inertia) // distance below the straight line in normalised space
    if (d > bd) {
      bd = d
      best = p.k
    }
  }
  return best
}

/** Adjusted Rand index between two labelings (1 = identical partitions). */
export function adjustedRand(a: (string | number)[], b: (string | number)[]): number {
  const n = a.length
  const ka = [...new Set(a)], kb = [...new Set(b)]
  const M = ka.map(() => new Array<number>(kb.length).fill(0))
  for (let i = 0; i < n; i++) M[ka.indexOf(a[i])][kb.indexOf(b[i])]++
  const c2 = (x: number) => (x * (x - 1)) / 2
  const sumIJ = M.flat().reduce((s, x) => s + c2(x), 0)
  const sa = M.map((r) => r.reduce((s, x) => s + x, 0)).reduce((s, x) => s + c2(x), 0)
  const sb = kb.map((_, j) => M.reduce((s, r) => s + r[j], 0)).reduce((s, x) => s + c2(x), 0)
  const exp = (sa * sb) / c2(n)
  const max = (sa + sb) / 2
  return max === exp ? 1 : (sumIJ - exp) / (max - exp)
}

/** Three Gaussian blobs in 3-D plus one elongated cluster (seeded). */
export function sampleBlobs(seed = 3): string {
  const r = rng(seed)
  const g = () => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r())
  const lines = ['x,y,z,group']
  const C: [number, number, number, number, string][] = [[2, 2, 2, 0.6, 'A'], [-2, 1, -1, 0.7, 'B'], [1, -2, -2, 0.5, 'C'], [-1.5, -1.5, 2.5, 0.45, 'D']]
  for (const [x, y, z, s, n] of C) for (let i = 0; i < 70; i++) lines.push(`${(x + g() * s).toFixed(3)},${(y + g() * s).toFixed(3)},${(z + g() * s).toFixed(3)},${n}`)
  return lines.join('\n')
}
