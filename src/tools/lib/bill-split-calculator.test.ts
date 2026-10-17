import { describe, expect, it } from 'vitest'
import { allocate, balances, exactGap, settle, shares, type Expense } from './bill-split-calculator'

const P = ['a', 'b', 'c', 'd'].map((id) => ({ id, name: id.toUpperCase() }))
const ex = (amount: number, payer: string, mode: Expense['mode'], parts: Record<string, number>): Expense => ({ id: payer + amount, desc: '', amount, payer, mode, parts })

describe('bill split', () => {
  it('allocates cents exactly', () => {
    expect(allocate(100, [1, 1, 1])).toEqual([33.34, 33.33, 33.33])
    expect(allocate(10, [2, 1, 1])).toEqual([5, 2.5, 2.5])
    expect(allocate(0.05, [1, 1, 1, 1, 1, 1]).reduce((a, b) => a + b, 0)).toBeCloseTo(0.05)
    expect(allocate(10, [0, 0])).toEqual([0, 0])
  })
  it('equal, weighted and exact shares', () => {
    expect(shares(ex(90, 'a', 'equal', { a: 1, b: 1, c: 1 }), P)).toEqual({ a: 30, b: 30, c: 30, d: 0 })
    expect(shares(ex(100, 'a', 'weights', { a: 2, b: 1, c: 1, d: 0 }), P)).toEqual({ a: 50, b: 25, c: 25, d: 0 })
    expect(shares(ex(50, 'a', 'exact', { a: 20, b: 30 }), P)).toEqual({ a: 20, b: 30, c: 0, d: 0 })
    expect(exactGap(ex(50, 'a', 'exact', { a: 20, b: 25 }))).toBe(5)
  })
  it('balances sum to zero and settle-up clears them', () => {
    const es = [ex(120, 'a', 'equal', { a: 1, b: 1, c: 1, d: 1 }), ex(60, 'b', 'equal', { a: 1, b: 1, c: 1 }), ex(33.33, 'c', 'weights', { c: 1, d: 2 })]
    const bal = balances(P, es)
    expect(bal.reduce((s, b) => s + b.net, 0)).toBeCloseTo(0, 6)
    const tr = settle(bal)
    expect(tr.length).toBeLessThanOrEqual(P.length - 1)
    const after = Object.fromEntries(bal.map((b) => [b.id, Math.round(b.net * 100)]))
    for (const t of tr) {
      after[t.from] += Math.round(t.amount * 100)
      after[t.to] -= Math.round(t.amount * 100)
    }
    expect(Object.values(after).every((v) => v === 0)).toBe(true)
  })
  it('greedy matches largest debtor with largest creditor', () => {
    const tr = settle([{ id: 'a', net: 50 }, { id: 'b', net: 30 }, { id: 'c', net: -60 }, { id: 'd', net: -20 }])
    expect(tr[0]).toEqual({ from: 'c', to: 'a', amount: 50 })
    expect(tr).toHaveLength(3)
    expect(settle([{ id: 'a', net: 0 }])).toEqual([])
  })
})
