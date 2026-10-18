import { describe, expect, it } from 'vitest'
import { analyse, groups, importTables, totals, type Line } from './budget-variance-report'

let n = 0
const id = () => `x${n++}`
const L: Line[] = [
  { id: 'a', category: 'Sales', group: 'Revenue', kind: 'income', budget: 10000, actual: 9000 },
  { id: 'b', category: 'Rent', group: 'Fixed', kind: 'expense', budget: 2000, actual: 2000 },
  { id: 'c', category: 'Travel', group: 'Variable', kind: 'expense', budget: 500, actual: 800 },
  { id: 'd', category: 'Ads', group: 'Variable', kind: 'expense', budget: 1000, actual: 700 },
]

describe('budget variance', () => {
  it('classifies favourable and unfavourable by type', () => {
    const v = analyse(L, { pct: 10, abs: 100, rule: 'and' })
    expect(v.map((x) => x.variance)).toEqual([-1000, 0, 300, -300])
    expect(v.map((x) => x.fav)).toEqual([false, null, false, true])
    expect(v[2].pct).toBeCloseTo(0.6)
    expect(v.map((x) => x.flag)).toEqual([true, false, true, false])
    expect(analyse(L, { pct: 50, abs: 100, rule: 'and' }).map((x) => x.flag)).toEqual([false, false, true, false])
    expect(analyse(L, { pct: 50, abs: 100, rule: 'or' })[0].flag).toBe(true)
  })
  it('pro-rates and totals', () => {
    const v = analyse(L, { pct: 10, abs: 0, rule: 'and' }, 0.5)
    expect(v[0].budgetAdj).toBe(5000)
    const t = totals(v)
    expect(t.ib).toBe(5000)
    expect(t.ea).toBe(3500)
    expect(t.netVar).toBe(9000 - 3500 - (5000 - 1750))
    expect(groups(v).find((g) => g.group === 'Variable')).toMatchObject({ budget: 750, actual: 1500, fav: false })
  })
  it('imports one table or two sheets', () => {
    const one = importTables([[['Category', 'Type', 'Budget', 'Actual'], ['Sales', 'Income', '1,000', 1100], ['Rent', 'Expense', 500, '$450']]], id)!
    expect(one.lines.map((l) => [l.category, l.kind, l.budget, l.actual])).toEqual([['Sales', 'income', 1000, 1100], ['Rent', 'expense', 500, 450]])
    const two = importTables([[['Category', 'Amount'], ['Rent', 500], ['Food', 300]], [['Category', 'Amount'], ['food', 320], ['Taxi', 40]]], id)!
    expect(two.lines.map((l) => [l.category, l.budget, l.actual])).toEqual([['Rent', 500, 0], ['Food', 300, 320], ['Taxi', 0, 40]])
    expect(importTables([[['a', 'b']]], id)).toBeNull()
  })
})
