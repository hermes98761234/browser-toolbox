import { describe, expect, it } from 'vitest'
import { CURRENCIES, expected, keepFloat, pieces, rollSize, status, total, type Line } from './cash-drawer-counter'

const usd = CURRENCIES.find((c) => c.code === 'USD')!
const line = (v: number, loose: number, rolls = 0): Line => ({ d: usd.denoms.find((d) => d.v === v)!, loose, rolls })

describe('cash drawer counter', () => {
  it('totals with rolls and no float drift', () => {
    expect(rollSize('USD', usd.denoms.find((d) => d.v === 0.25)!)).toBe(40)
    expect(rollSize('USD', usd.denoms.find((d) => d.v === 1)!)).toBe(0)
    expect(pieces(line(0.25, 3, 2), 'USD')).toBe(83)
    expect(total([line(0.1, 3), line(0.01, 7), line(20, 4), line(0.25, 0, 1)], usd)).toBe(90.37)
  })
  it('expected cash, variance status', () => {
    expect(expected({ float: 200, sales: 1234.56, paidIn: 20, paidOut: 45.5, refunds: 12 })).toBeCloseTo(1397.06, 6)
    expect(status(0.004, 0.01)).toBe('balanced')
    expect(status(-2, 0.5)).toBe('short')
    expect(status(3, 0.5)).toBe('over')
  })
  it('keeps an exact float preferring small change', () => {
    const avail = [{ v: 50, n: 2 }, { v: 20, n: 5 }, { v: 1, n: 3 }]
    const r = keepFloat(avail, 150, 2)
    expect(r.amount).toBe(150)
    expect(r.keep).toEqual([1, 5, 0])
    const s = keepFloat([{ v: 20, n: 10 }, { v: 5, n: 10 }, { v: 1, n: 10 }, { v: 0.25, n: 8 }], 100, 2)
    expect(s.amount).toBe(100)
    expect(s.keep[3]).toBe(8)
    expect(s.keep).toEqual([2, 10, 8, 8])
    const short = keepFloat([{ v: 20, n: 2 }], 50, 2)
    expect(short.amount).toBe(40)
  })
})
