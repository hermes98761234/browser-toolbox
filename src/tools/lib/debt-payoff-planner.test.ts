import { describe, expect, it } from 'vitest'
import { simulate, type Debt } from './debt-payoff-planner'

const debts: Debt[] = [
  { id: 'card', name: 'Card', balance: 5000, apr: 22, min: 150 },
  { id: 'car', name: 'Car', balance: 9000, apr: 6, min: 250 },
  { id: 'store', name: 'Store', balance: 800, apr: 18, min: 40 },
]

describe('debt payoff', () => {
  it('matches the amortization of a single loan', () => {
    // 10,000 at 12% with 222.44/month ≈ 60 months
    const r = simulate([{ id: 'a', name: 'a', balance: 10000, apr: 12, min: 222.45 }], 0, 'avalanche')
    expect(r.months).toBe(60)
    expect(r.totalInterest).toBeCloseTo(3347, -1)
  })
  it('avalanche never pays more interest than snowball', () => {
    const a = simulate(debts, 200, 'avalanche')
    const s = simulate(debts, 200, 'snowball')
    expect(a.totalInterest).toBeLessThanOrEqual(s.totalInterest + 1e-6)
    expect(s.order[0]).toBe('store')
    expect(a.order[0]).toBe('card')
    expect(a.totalPaid).toBeCloseTo(14800 + a.totalInterest, 4)
  })
  it('extra payments save time and interest vs minimums only', () => {
    const base = simulate(debts, 0, 'minimum')
    const plan = simulate(debts, 200, 'avalanche')
    expect(plan.months).toBeLessThan(base.months)
    expect(plan.totalInterest).toBeLessThan(base.totalInterest)
  })
  it('flags debts whose payment does not cover interest', () => {
    const r = simulate([{ id: 'x', name: 'x', balance: 10000, apr: 30, min: 100 }], 0, 'minimum', 120)
    expect(r.stuck).toBe(true)
    expect(r.payoffMonth.x).toBe(Infinity)
  })
})
