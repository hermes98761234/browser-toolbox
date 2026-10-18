// Plate loading: per-side combinations, warm-up ramps and set ordering with the fewest plate changes.
// The closest achievable load comes from the shared bounded-knapsack search in one-rep-max-calculator.
import { platesFor } from './one-rep-max-calculator'

export type Unit = 'kg' | 'lb'
export const KG_PER_LB = 0.45359237

export interface Plate {
  w: number
  pairs: number
  /** Thickness in mm. */
  mm: number
  bumper: boolean
}

const EPS = 1e-6

/** All per-side plate combinations (counts per plate index) that sum exactly to `amount`. */
export function combos(amount: number, plates: Plate[], limit = 60): number[][] {
  const out: number[][] = []
  const idx = plates.map((_, i) => i).filter((i) => plates[i].w > 0 && plates[i].pairs > 0).sort((a, b) => plates[b].w - plates[a].w)
  const cur = plates.map(() => 0)
  const go = (k: number, left: number) => {
    if (out.length >= limit * 4) return
    if (Math.abs(left) < EPS) {
      out.push(cur.slice())
      return
    }
    if (k >= idx.length) return
    const i = idx[k]
    const p = plates[i]
    const maxN = Math.min(p.pairs, Math.floor(left / p.w + EPS))
    for (let n = maxN; n >= 0; n--) {
      cur[i] = n
      go(k + 1, left - n * p.w)
    }
    cur[i] = 0
  }
  go(0, amount)
  const count = (c: number[]) => c.reduce((a, b) => a + b, 0)
  return out.sort((a, b) => count(a) - count(b)).slice(0, limit)
}

/** Stack on the sleeve, inside → out: heavier first; at equal weight bumpers sit inside. */
export function stack(counts: number[], plates: Plate[]): number[] {
  const out: number[] = []
  counts.forEach((n, i) => {
    for (let k = 0; k < n; k++) out.push(i)
  })
  return out.sort((a, b) => plates[b].w - plates[a].w || Number(plates[b].bumper) - Number(plates[a].bumper) || a - b)
}

/** Plate moves per side to go from stack a to stack b (only the outer plates can be touched). */
export function changes(a: number[], b: number[]): number {
  let k = 0
  while (k < a.length && k < b.length && a[k] === b[k]) k++
  return a.length - k + (b.length - k)
}

export interface SetPlan {
  label: string
  reps: number
  target: number
  total: number
  stack: number[]
  /** Moves per side from the previous set. */
  moves: number
}

export interface PlanInput {
  sets: { label: string; reps: number; target: number }[]
  bar: number
  collars: number
  plates: Plate[]
}

/**
 * Plans each set. `fewestChanges` picks, among all exact combinations of the achievable load,
 * the sequence that minimises total plate moves (dynamic programming over the sets);
 * otherwise each set simply uses its fewest-plates combination.
 */
export function planSets({ sets, bar, collars, plates }: PlanInput, fewestChanges: boolean): SetPlan[] {
  const stock = plates.map((p) => ({ plate: p.w, pairs: p.pairs }))
  const options = sets.map((s) => {
    const r = platesFor(s.target, bar, collars, stock)
    const per = (r.total - bar - collars) / 2
    const cs = per > EPS ? combos(per, plates) : [plates.map(() => 0)]
    return { total: r.total, stacks: (cs.length ? cs : [plates.map(() => 0)]).map((c) => stack(c, plates)) }
  })
  if (!options.length) return []
  const pick: number[] = options.map(() => 0)
  if (fewestChanges) {
    // cost[i][j] = min moves to reach option j of set i; tie-break on plate count.
    const cost: number[][] = []
    const from: number[][] = []
    options.forEach((o, i) => {
      cost[i] = []
      from[i] = []
      o.stacks.forEach((st, j) => {
        if (i === 0) {
          cost[0][j] = st.length + st.length * 1e-3
          from[0][j] = -1
          return
        }
        let best = Infinity, arg = 0
        options[i - 1].stacks.forEach((pv, k) => {
          const c = cost[i - 1][k] + changes(pv, st) + st.length * 1e-3
          if (c < best - EPS) {
            best = c
            arg = k
          }
        })
        cost[i][j] = best
        from[i][j] = arg
      })
    })
    const last = options.length - 1
    let j = cost[last].indexOf(Math.min(...cost[last]))
    for (let i = last; i >= 0; i--) {
      pick[i] = j
      j = from[i][j]
    }
  }
  let prev: number[] = []
  return sets.map((s, i) => {
    const st = options[i].stacks[pick[i]]
    const moves = changes(prev, st)
    prev = st
    return { label: s.label, reps: s.reps, target: s.target, total: options[i].total, stack: st, moves }
  })
}

export interface RampStep { pct: number; reps: number }

/** Warm-up targets from a working weight; anything at or below the empty bar becomes a bar set. */
export function ramp(work: number, steps: RampStep[], workSets: number, workReps: number, bar: number, collars: number, inc = 0) {
  const empty = bar + collars
  const out: { label: string; reps: number; target: number }[] = []
  for (const st of [...steps].sort((a, b) => a.pct - b.pct)) {
    const raw = (work * st.pct) / 100
    const t = inc > 0 ? Math.round(raw / inc) * inc : raw
    out.push({ label: t <= empty + EPS ? 'Empty bar' : `Warm-up ${st.pct}%`, reps: st.reps, target: Math.max(empty, t) })
  }
  for (let k = 1; k <= workSets; k++) out.push({ label: `Work set ${k}`, reps: workReps, target: work })
  return out
}

/** Thickness used on one sleeve (mm) incl. the collar. */
export const sleeveUsed = (st: number[], plates: Plate[], collarMm: number) => st.reduce((a, i) => a + plates[i].mm, 0) + (st.length ? collarMm : 0)

export const toKg = (x: number, u: Unit) => (u === 'kg' ? x : x * KG_PER_LB)
export const fromKg = (x: number, u: Unit) => (u === 'kg' ? x : x / KG_PER_LB)
