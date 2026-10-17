// Petty cash (imprest) reconciliation in integer cents.

export interface Den { c: number; coin: boolean } // value in cents

const D = (notes: number[], coins: number[]): Den[] => [...notes.map((v) => ({ c: Math.round(v * 100), coin: false })), ...coins.map((v) => ({ c: Math.round(v * 100), coin: true }))]

export const CURRENCIES: Record<string, { sym: string; dens: Den[] }> = {
  USD: { sym: '$', dens: D([100, 50, 20, 10, 5, 2, 1], [1, 0.5, 0.25, 0.1, 0.05, 0.01]) },
  EUR: { sym: '€', dens: D([200, 100, 50, 20, 10, 5], [2, 1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01]) },
  GBP: { sym: '£', dens: D([50, 20, 10, 5], [2, 1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01]) },
  CAD: { sym: 'CA$', dens: D([100, 50, 20, 10, 5], [2, 1, 0.25, 0.1, 0.05]) },
  AUD: { sym: 'A$', dens: D([100, 50, 20, 10, 5], [2, 1, 0.5, 0.2, 0.1, 0.05]) },
  PLN: { sym: 'zł ', dens: D([500, 200, 100, 50, 20, 10], [5, 2, 1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01]) },
  UAH: { sym: '₴', dens: D([1000, 500, 200, 100, 50, 20], [10, 5, 2, 1, 0.5, 0.1]) },
  CHF: { sym: 'CHF ', dens: D([1000, 200, 100, 50, 20, 10], [5, 2, 1, 0.5, 0.2, 0.1, 0.05]) },
}

export const toCents = (x: number) => Math.round((Number.isFinite(x) ? x : 0) * 100)

/** Sum of a denomination count map {cents: pieces} → cents. Keys are denomination keys `${coin?'c':'n'}${cents}`. */
export function countTotal(dens: Den[], counts: Record<string, number>): number {
  return dens.reduce((a, d) => a + d.c * Math.max(0, Math.floor(counts[denKey(d)] ?? 0)), 0)
}
export const denKey = (d: Den) => `${d.coin ? 'c' : 'n'}${d.c}`

export interface Recon {
  float: number
  vouchers: number
  ious: number
  cashIn: number
  expected: number
  counted: number
  variance: number // counted − expected (positive = over)
  topUp: number // cash needed to bring cash + IOUs back to the float
  status: 'balanced' | 'over' | 'short'
}

/** All inputs in cents. */
export function reconcile(float: number, counted: number, vouchers: number, ious: number, cashIn: number, tolerance = 0): Recon {
  const expected = float + cashIn - vouchers - ious
  const variance = counted - expected
  return {
    float, vouchers, ious, cashIn, expected, counted, variance,
    topUp: Math.max(0, float - counted - ious),
    status: Math.abs(variance) <= tolerance ? 'balanced' : variance > 0 ? 'over' : 'short',
  }
}

/** Greedy breakdown of an amount into denominations, e.g. for preparing the top-up. */
export function breakdown(cents: number, dens: Den[]): { d: Den; n: number }[] {
  const out: { d: Den; n: number }[] = []
  let left = cents
  for (const d of [...dens].sort((a, b) => b.c - a.c || Number(a.coin) - Number(b.coin))) {
    const n = Math.floor(left / d.c)
    if (n > 0) {
      out.push({ d, n })
      left -= n * d.c
    }
  }
  return out
}
