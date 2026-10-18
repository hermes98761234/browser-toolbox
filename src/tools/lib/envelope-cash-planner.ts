// Cash envelope planning: split amounts into banknotes and coins with the fewest pieces (dynamic
// programming, so non-canonical sets like {25, 20, 5} work too), per-envelope largest-note limits,
// cash rounding when an amount isn't payable, and a combined bank-withdrawal list.

export interface Denom { v: number; kind: 'note' | 'coin'; on: boolean }
export interface CurrencySet { code: string; symbol: string; decimals: number; denoms: Denom[] }

const n = (vs: number[], kind: 'note' | 'coin', off: number[] = []): Denom[] => vs.map((v) => ({ v, kind, on: !off.includes(v) }))

export const CURRENCIES: CurrencySet[] = [
  { code: 'USD', symbol: '$', decimals: 2, denoms: [...n([100, 50, 20, 10, 5, 2, 1], 'note', [2]), ...n([0.25, 0.1, 0.05, 0.01], 'coin')] },
  { code: 'EUR', symbol: '€', decimals: 2, denoms: [...n([500, 200, 100, 50, 20, 10, 5], 'note', [500]), ...n([2, 1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01], 'coin')] },
  { code: 'GBP', symbol: '£', decimals: 2, denoms: [...n([50, 20, 10, 5], 'note'), ...n([2, 1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01], 'coin')] },
  { code: 'CAD', symbol: 'C$', decimals: 2, denoms: [...n([100, 50, 20, 10, 5], 'note'), ...n([2, 1, 0.25, 0.1, 0.05], 'coin')] },
  { code: 'AUD', symbol: 'A$', decimals: 2, denoms: [...n([100, 50, 20, 10, 5], 'note'), ...n([2, 1, 0.5, 0.2, 0.1, 0.05], 'coin')] },
  { code: 'UAH', symbol: '₴', decimals: 2, denoms: [...n([1000, 500, 200, 100, 50, 20], 'note'), ...n([10, 5, 2, 1, 0.5, 0.1], 'coin')] },
  { code: 'PLN', symbol: 'zł ', decimals: 2, denoms: [...n([500, 200, 100, 50, 20, 10], 'note'), ...n([5, 2, 1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01], 'coin')] },
  { code: 'INR', symbol: '₹', decimals: 0, denoms: [...n([500, 200, 100, 50, 20, 10], 'note'), ...n([20, 10, 5, 2, 1], 'coin')] },
  { code: 'JPY', symbol: '¥', decimals: 0, denoms: [...n([10000, 5000, 2000, 1000], 'note', [2000]), ...n([500, 100, 50, 10, 5, 1], 'coin')] },
  { code: 'MXN', symbol: 'MX$', decimals: 2, denoms: [...n([1000, 500, 200, 100, 50, 20], 'note'), ...n([20, 10, 5, 2, 1, 0.5], 'coin')] },
]

export interface Breakdown { counts: [Denom, number][]; paid: number; remainder: number; pieces: number }

/**
 * Fewest pieces that pay `amount` using enabled denominations ≤ maxDenom. If the exact amount
 * can't be made, pays the largest smaller amount and reports the remainder.
 */
export function breakdown(amount: number, cur: CurrencySet, maxDenom = Infinity): Breakdown {
  const f = 10 ** cur.decimals
  const A = Math.max(0, Math.round(amount * f))
  const seen = new Set<number>()
  const ds = cur.denoms
    .filter((d) => d.on && d.v > 0 && d.v <= maxDenom + 1e-9)
    .map((d) => ({ d, u: Math.round(d.v * f) }))
    .filter(({ u }) => u > 0 && !seen.has(u) && seen.add(u))
    .sort((a, b) => b.u - a.u)
  if (!ds.length || A === 0) return { counts: [], paid: 0, remainder: A / f, pieces: 0 }
  // work in units of the gcd so cash amounts like 5 000.00 with whole-unit coins stay small
  const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a)
  const g = ds.reduce((a, { u }) => gcd(a, u), 0)
  const T = Math.floor(A / g)
  const INF = 0x3fffffff
  const dp = new Int32Array(T + 1).fill(INF)
  const pick = new Int16Array(T + 1).fill(-1)
  dp[0] = 0
  const us = ds.map(({ u }) => u / g)
  for (let a = 1; a <= T; a++)
    for (let k = 0; k < us.length; k++) {
      const u = us[k]
      if (u <= a && dp[a - u] + 1 < dp[a]) {
        dp[a] = dp[a - u] + 1
        pick[a] = k
      }
    }
  let best = T
  while (best > 0 && dp[best] >= INF) best--
  const cnt = new Array(ds.length).fill(0)
  for (let a = best; a > 0; a -= us[pick[a]]) cnt[pick[a]]++
  const counts = ds.map(({ d }, k) => [d, cnt[k]] as [Denom, number]).filter(([, c]) => c > 0)
  const paid = (best * g) / f
  return { counts, paid, remainder: (A - best * g) / f, pieces: cnt.reduce((a, b) => a + b, 0) }
}

/** Rounds to the nearest payable step (e.g. 0.05 for CAD cash). */
export function cashRound(amount: number, cur: CurrencySet): number {
  const on = cur.denoms.filter((d) => d.on && d.v > 0)
  if (!on.length) return amount
  const f = 10 ** cur.decimals
  const step = Math.min(...on.map((d) => Math.round(d.v * f)))
  return (Math.round((amount * f) / step) * step) / f
}

/** Sum of several breakdowns per denomination value, largest first. */
export function withdrawal(bs: Breakdown[]): [Denom, number][] {
  const m = new Map<number, [Denom, number]>()
  for (const b of bs)
    for (const [d, c] of b.counts) {
      const e = m.get(d.v)
      if (e) e[1] += c
      else m.set(d.v, [d, c])
    }
  return [...m.values()].sort((a, b) => b[0].v - a[0].v)
}

export const fmtDenom = (v: number, cur: CurrencySet) => (v < 1 && cur.decimals ? `${Math.round(v * 100)}${cur.code === 'USD' || cur.code === 'CAD' ? '¢' : 'c'}` : `${cur.symbol}${v.toLocaleString('en-US')}`)
