import { describe, expect, it } from 'vitest'
import { breakdown, countTotal, CURRENCIES, reconcile, toCents } from './petty-cash-reconciler'

const usd = CURRENCIES.USD.dens

describe('petty cash', () => {
  it('counts notes and coins in cents', () => {
    expect(countTotal(usd, { n2000: 3, n100: 2, c25: 7, c1: 3, c100: 1 })).toBe(6000 + 200 + 175 + 3 + 100)
  })
  it('reconciles with exact cents', () => {
    const r = reconcile(toCents(500), toCents(312.4), toCents(167.35), toCents(20), toCents(0))
    expect(r.expected).toBe(31265)
    expect(r.variance).toBe(-25)
    expect(r.status).toBe('short')
    expect(r.topUp).toBe(16760)
    expect(reconcile(100, 100, 0, 0, 0).status).toBe('balanced')
    expect(reconcile(1000, 1003, 0, 0, 0, 5).status).toBe('balanced')
  })
  it('float noise does not leak', () => expect(toCents(0.1 + 0.2)).toBe(30))
  it('greedy breakdown', () => {
    const b = breakdown(18765, usd)
    expect(b.map((x) => [x.d.c, x.n])).toEqual([[10000, 1], [5000, 1], [2000, 1], [1000, 1], [500, 1], [200, 1], [50, 1], [10, 1], [5, 1]])
  })
})
