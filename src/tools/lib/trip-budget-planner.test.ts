import { describe, expect, it } from 'vitest'
import { balances, settle, shares, toHome, tripDays, type Expense } from './trip-budget-planner'

const E = (amount: number, cur: string, paidBy: string, split: string[] = []): Expense => ({ id: '', date: '', desc: '', cat: '', amount, cur, paidBy, split })

describe('trip-budget-planner', () => {
  it('converts currency', () => {
    expect(toHome(100, 'EUR', { EUR: 1.1 }, 'USD')).toBeCloseTo(110)
    expect(toHome(5, 'USD', {}, 'USD')).toBe(5)
    expect(toHome(5, 'JPY', {}, 'USD')).toBeNaN()
  })
  it('computes balances and settle-up', () => {
    const ex = [E(90, 'USD', 'A'), E(30, 'USD', 'B'), E(100, 'EUR', 'C', ['A', 'C'])]
    const b = balances(ex, ['A', 'B', 'C'], { EUR: 1.2 }, 'USD')
    // A paid 90, owes 40+60 = 100 → −10; B paid 30, owes 40 → −10; C paid 120, owes 40+60 → +20
    expect(b.A).toBeCloseTo(-10)
    expect(b.B).toBeCloseTo(-10)
    expect(b.C).toBeCloseTo(20)
    const t = settle(b)
    expect(t).toHaveLength(2)
    expect(t.every((x) => x.to === 'C' && x.amount === 10)).toBe(true)
    const sh = shares(ex, ['A', 'B', 'C'], { EUR: 1.2 }, 'USD')
    expect(sh.A + sh.B + sh.C).toBeCloseTo(240)
  })
  it('counts days inclusively', () => {
    expect(tripDays('2024-05-01', '2024-05-07')).toBe(7)
    expect(tripDays('2024-05-07', '2024-05-01')).toBe(1)
  })
})
