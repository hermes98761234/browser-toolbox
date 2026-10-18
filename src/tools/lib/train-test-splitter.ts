// Dataset splitting: seeded shuffles, random / stratified / group-aware train-validation-test splits, k-fold.

/** mulberry32 — small seeded PRNG returning floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Fisher–Yates shuffle (returns a new array). */
export function shuffle<T>(xs: readonly T[], rnd: () => number): T[] {
  const a = xs.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export type Part = 'train' | 'val' | 'test'
export const PARTS: Part[] = ['train', 'val', 'test']

/**
 * Splits n items into parts with largest-remainder rounding so counts sum to n
 * and each requested non-zero share gets at least one item when n allows.
 */
export function allocate(n: number, fr: [number, number, number]): [number, number, number] {
  const tot = fr[0] + fr[1] + fr[2] || 1
  const exact = fr.map((f) => (f / tot) * n)
  const c = exact.map(Math.floor) as [number, number, number]
  let left = n - c[0] - c[1] - c[2]
  const order = [0, 1, 2].sort((a, b) => exact[b] - c[b] - (exact[a] - c[a]) || a - b)
  for (const i of order) if (left > 0) { c[i]++; left-- }
  return c
}

/** Plain random split: returns the part of every row index. */
export function randomSplit(n: number, fr: [number, number, number], seed: number): Part[] {
  const idx = shuffle([...Array(n).keys()], mulberry32(seed))
  const [a, b] = allocate(n, fr)
  const out: Part[] = new Array(n)
  idx.forEach((r, k) => (out[r] = k < a ? 'train' : k < a + b ? 'val' : 'test'))
  return out
}

/** Stratified: each label class is split separately so class proportions are kept in every part. */
export function stratifiedSplit(labels: readonly string[], fr: [number, number, number], seed: number): Part[] {
  const rnd = mulberry32(seed)
  const groups = new Map<string, number[]>()
  labels.forEach((l, i) => groups.set(l, [...(groups.get(l) ?? []), i]))
  const out: Part[] = new Array(labels.length)
  for (const key of [...groups.keys()].sort()) {
    const idx = shuffle(groups.get(key)!, rnd)
    const [a, b] = allocate(idx.length, fr)
    idx.forEach((r, k) => (out[r] = k < a ? 'train' : k < a + b ? 'val' : 'test'))
  }
  return out
}

/**
 * Group-aware: all rows sharing a group id land in the same part (no leakage, e.g. one patient's scans).
 * Groups are shuffled, then assigned greedily to the part furthest below its row target.
 */
export function groupSplit(groupsOf: readonly string[], fr: [number, number, number], seed: number): Part[] {
  const g = new Map<string, number[]>()
  groupsOf.forEach((k, i) => g.set(k, [...(g.get(k) ?? []), i]))
  const keys = shuffle([...g.keys()].sort(), mulberry32(seed))
  const n = groupsOf.length
  const tot = fr[0] + fr[1] + fr[2] || 1
  const target = fr.map((f) => (f / tot) * n)
  const have = [0, 0, 0]
  const out: Part[] = new Array(n)
  for (const k of keys) {
    const rows = g.get(k)!
    let best = 0, bestGap = -Infinity
    for (let p = 0; p < 3; p++) {
      if (target[p] <= 0) continue
      const gap = (target[p] - have[p]) / target[p]
      if (gap > bestGap) { bestGap = gap; best = p }
    }
    have[best] += rows.length
    for (const r of rows) out[r] = PARTS[best]
  }
  return out
}

/** k-fold assignment (0..k-1); stratified folds deal each class round-robin; group folds keep groups whole. */
export function kFold(n: number, k: number, seed: number, opts: { labels?: readonly string[]; groups?: readonly string[] } = {}): number[] {
  const rnd = mulberry32(seed)
  const fold = new Array<number>(n).fill(0)
  if (opts.groups) {
    const g = new Map<string, number[]>()
    opts.groups.forEach((key, i) => g.set(key, [...(g.get(key) ?? []), i]))
    const keys = shuffle([...g.keys()].sort(), rnd).sort((a, b) => g.get(b)!.length - g.get(a)!.length)
    const size = new Array(k).fill(0)
    for (const key of keys) {
      const f = size.indexOf(Math.min(...size))
      size[f] += g.get(key)!.length
      for (const r of g.get(key)!) fold[r] = f
    }
    return fold
  }
  if (opts.labels) {
    const cls = new Map<string, number[]>()
    opts.labels.forEach((l, i) => cls.set(l, [...(cls.get(l) ?? []), i]))
    let offset = 0
    for (const key of [...cls.keys()].sort()) {
      const idx = shuffle(cls.get(key)!, rnd)
      idx.forEach((r, j) => (fold[r] = (j + offset) % k))
      offset = (offset + idx.length) % k
    }
    return fold
  }
  shuffle([...Array(n).keys()], rnd).forEach((r, j) => (fold[r] = j % k))
  return fold
}

/** Count of each label per bucket → { bucket: { label: count } }. */
export function crossTab(buckets: readonly string[], labels: readonly string[]): Map<string, Map<string, number>> {
  const t = new Map<string, Map<string, number>>()
  buckets.forEach((b, i) => {
    const m = t.get(b) ?? new Map<string, number>()
    m.set(labels[i], (m.get(labels[i]) ?? 0) + 1)
    t.set(b, m)
  })
  return t
}

/** Groups that appear in more than one bucket (leakage). */
export function leakingGroups(buckets: readonly string[], groups: readonly string[]): string[] {
  const seen = new Map<string, Set<string>>()
  groups.forEach((g, i) => seen.set(g, (seen.get(g) ?? new Set()).add(buckets[i])))
  return [...seen].filter(([, s]) => s.size > 1).map(([g]) => g)
}

/** Sample dataset: synthetic patient visits with an imbalanced diagnosis label and repeated patients. */
export function sampleCsv(): string {
  const rnd = mulberry32(7)
  const rows = ['visit_id,patient_id,age,systolic_bp,cholesterol,smoker,diagnosis']
  let v = 1
  for (let p = 1; p <= 48; p++) {
    const age = 25 + Math.floor(rnd() * 50)
    const smoker = rnd() < 0.3
    const risk = (age - 25) / 50 + (smoker ? 0.35 : 0) + rnd() * 0.4
    const diag = risk > 1.05 ? 'disease' : risk > 0.75 ? 'borderline' : 'healthy'
    const visits = 1 + Math.floor(rnd() * 4)
    for (let k = 0; k < visits; k++) {
      const bp = Math.round(105 + risk * 40 + rnd() * 12)
      const ch = Math.round(160 + risk * 70 + rnd() * 25)
      rows.push(`V${String(v++).padStart(3, '0')},P${String(p).padStart(2, '0')},${age},${bp},${ch},${smoker ? 'yes' : 'no'},${diag}`)
    }
  }
  return rows.join('\n')
}
