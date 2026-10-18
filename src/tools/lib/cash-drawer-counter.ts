// Cash drawer counting: totals from denomination counts (+ coin rolls), expected cash from the
// shift's transactions, over/short variance, and splitting the drawer into "keep as float" vs deposit.
import { CURRENCIES, fmtDenom, type CurrencySet, type Denom } from './envelope-cash-planner'

export { CURRENCIES, fmtDenom }
export type { CurrencySet, Denom }

/** Coins per standard roll (by currency and coin value). */
export const ROLLS: Record<string, Record<string, number>> = {
  USD: { '0.01': 50, '0.05': 40, '0.1': 50, '0.25': 40, '1': 25 },
  CAD: { '0.05': 40, '0.1': 50, '0.25': 40, '1': 25, '2': 25 },
  EUR: { '0.01': 50, '0.02': 50, '0.05': 50, '0.1': 40, '0.2': 40, '0.5': 40, '1': 25, '2': 25 },
  GBP: { '0.01': 100, '0.02': 50, '0.05': 100, '0.1': 50, '0.2': 50, '0.5': 20, '1': 20, '2': 10 },
}
export const rollSize = (cur: string, d: Denom) => (d.kind === 'coin' ? ROLLS[cur]?.[String(d.v)] ?? 0 : 0)
/** Stable key for a denomination (some currencies have a note and a coin of the same value). */
export const dkey = (d: Denom) => `${d.kind}:${d.v}`

export interface Line { d: Denom; loose: number; rolls: number }
export const pieces = (l: Line, cur: string) => Math.max(0, l.loose) + Math.max(0, l.rolls) * rollSize(cur, l.d)
/** Sum in minor units (cents) to avoid float drift, returned in major units. */
export function total(lines: Line[], cur: CurrencySet): number {
  const f = 10 ** cur.decimals
  return lines.reduce((a, l) => a + Math.round(l.d.v * f) * pieces(l, cur.code), 0) / f
}

export interface Shift { float: number; sales: number; paidIn: number; paidOut: number; refunds: number }
export const expected = (s: Shift) => s.float + s.sales + s.paidIn - s.paidOut - s.refunds

export function status(variance: number, tolerance: number): 'balanced' | 'over' | 'short' {
  if (Math.abs(variance) <= tolerance + 1e-9) return 'balanced'
  return variance > 0 ? 'over' : 'short'
}

/**
 * Pieces to leave in the drawer so they sum exactly to `target` (or as close below as possible),
 * preferring the most pieces — i.e. small change for the next shift. Bounded knapsack over minor units.
 * Returns pieces kept per line (same order as `avail`).
 */
export function keepFloat(avail: { v: number; n: number }[], target: number, decimals: number): { keep: number[]; amount: number } {
  const f = 10 ** decimals
  const T = Math.round(target * f)
  if (T <= 0) return { keep: avail.map(() => 0), amount: 0 }
  // binary-split bounded counts into 0/1 items
  const items: { line: number; units: number; count: number }[] = []
  avail.forEach((a, line) => {
    let n = Math.max(0, Math.floor(a.n))
    const u = Math.round(a.v * f)
    for (let k = 1; n > 0; k *= 2) {
      const c = Math.min(k, n)
      items.push({ line, units: u * c, count: c })
      n -= c
    }
  })
  const NEG = -1
  const dp = new Int32Array(T + 1).fill(NEG)
  dp[0] = 0
  const take = items.map(() => new Uint8Array(T + 1))
  items.forEach((it, i) => {
    for (let s = T; s >= it.units; s--) {
      const prev = dp[s - it.units]
      if (prev !== NEG && prev + it.count > dp[s]) {
        dp[s] = prev + it.count
        take[i][s] = 1
      }
    }
  })
  let s = T
  while (s > 0 && dp[s] === NEG) s--
  const keep = avail.map(() => 0)
  const amount = s / f
  for (let i = items.length - 1; i >= 0 && s > 0; i--) {
    if (take[i][s]) {
      keep[items[i].line] += items[i].count
      s -= items[i].units
    }
  }
  return { keep, amount }
}
