// One-rep-max estimation formulas, percentage tables and barbell plate breakdown.

export type FormulaId = 'epley' | 'brzycki' | 'lombardi' | 'mayhew' | 'oconner' | 'wathan'

export const FORMULAS: { id: FormulaId; name: string; expr: string; f: (w: number, r: number) => number }[] = [
  { id: 'epley', name: 'Epley', expr: 'w × (1 + r/30)', f: (w, r) => w * (1 + r / 30) },
  { id: 'brzycki', name: 'Brzycki', expr: 'w × 36 / (37 − r)', f: (w, r) => (w * 36) / (37 - r) },
  { id: 'lombardi', name: 'Lombardi', expr: 'w × r^0.10', f: (w, r) => w * r ** 0.1 },
  { id: 'mayhew', name: 'Mayhew et al.', expr: '100w / (52.2 + 41.9e^(−0.055r))', f: (w, r) => (100 * w) / (52.2 + 41.9 * Math.exp(-0.055 * r)) },
  { id: 'oconner', name: "O'Conner et al.", expr: 'w × (1 + 0.025r)', f: (w, r) => w * (1 + 0.025 * r) },
  { id: 'wathan', name: 'Wathan', expr: '100w / (48.8 + 53.8e^(−0.075r))', f: (w, r) => (100 * w) / (48.8 + 53.8 * Math.exp(-0.075 * r)) },
]

/** Estimated 1RM for one formula. A single rep is the 1RM itself. */
export function oneRm(id: FormulaId, w: number, reps: number): number {
  if (!(w > 0) || !(reps >= 1)) return NaN
  if (reps === 1) return w
  const fm = FORMULAS.find((x) => x.id === id)!
  return fm.f(w, reps)
}

export function estimates(w: number, reps: number, use: FormulaId[]) {
  const rows = FORMULAS.map((fm) => ({ ...fm, value: oneRm(fm.id, w, reps), used: use.includes(fm.id) }))
  const used = rows.filter((r) => r.used && Number.isFinite(r.value))
  const avg = used.length ? used.reduce((a, r) => a + r.value, 0) / used.length : NaN
  return { rows, avg }
}

/** Reps you can expect at `w` given a 1RM (inverse Epley), at least 1. */
export const repsAt = (rm: number, w: number) => (w >= rm ? 1 : Math.max(1, Math.round(30 * (rm / w - 1))))

export function pctTable(rm: number, from = 100, to = 50, step = 5) {
  const out: { pct: number; weight: number; reps: number }[] = []
  for (let p = from; p >= to; p -= step) {
    const weight = (rm * p) / 100
    out.push({ pct: p, weight, reps: repsAt(rm, weight) })
  }
  return out
}

export const roundTo = (x: number, inc: number) => (inc > 0 ? Math.round(x / inc) * inc : x)

export interface PlateSet { plate: number; pairs: number }

/**
 * Plates per side to reach `target` on a bar of weight `bar` (+ both collars).
 * `stock` = pairs available per plate size (Infinity allowed). Uses an exact search in
 * smallest-plate units, so it finds the closest achievable load not above the target.
 */
export function platesFor(target: number, bar: number, collars: number, stock: PlateSet[]) {
  const perSide = (target - bar - collars) / 2
  const sizes = [...stock].filter((s) => s.plate > 0 && s.pairs > 0).sort((a, b) => b.plate - a.plate)
  if (perSide <= 0 || !sizes.length) return { side: [] as PlateSet[], total: bar + collars, diff: target - bar - collars, perSide: 0 }
  const unit = 0.05
  const goal = Math.round(perSide / unit)
  // bounded knapsack over integer units: reach[x] = plate counts that produce x
  const reach: (number[] | null)[] = new Array(goal + 1).fill(null)
  reach[0] = sizes.map(() => 0)
  for (let x = 0; x <= goal; x++) {
    const cur = reach[x]
    if (!cur) continue
    sizes.forEach((s, i) => {
      const nx = x + Math.round(s.plate / unit)
      if (nx <= goal && !reach[nx] && cur[i] < s.pairs) {
        const n = cur.slice()
        n[i]++
        reach[nx] = n
      }
    })
  }
  let best = goal
  while (best > 0 && !reach[best]) best--
  // Prefer fewest plates: rebuild greedily for the reachable amount if greedy hits it exactly.
  const counts = greedy(best * unit, sizes) ?? reach[best]!
  const side = sizes.map((s, i) => ({ plate: s.plate, pairs: counts[i] })).filter((p) => p.pairs > 0)
  const load = side.reduce((a, p) => a + p.plate * p.pairs, 0)
  const total = bar + collars + 2 * load
  return { side, total, diff: target - total, perSide }
}

function greedy(amount: number, sizes: PlateSet[]): number[] | null {
  let left = amount
  const out = sizes.map((s) => {
    const n = Math.min(s.pairs, Math.floor(left / s.plate + 1e-9))
    left -= n * s.plate
    return n
  })
  return Math.abs(left) < 1e-6 ? out : null
}
