import { describe, expect, it } from 'vitest'
import { addDays, balances, history, projectSavings, splitAmount, weeklyRate, weeksDue, weeksToGoal } from './allowance-tracker'

describe('allowance-tracker', () => {
  it('splits amounts to the cent', () => {
    expect(splitAmount(10, { save: 50, spend: 40, give: 10 })).toEqual({ save: 5, spend: 4, give: 1 })
    const s = splitAmount(7, { save: 33, spend: 33, give: 34 })
    expect(s.save + s.spend + s.give).toBeCloseTo(7, 10)
  })
  it('balances and history', () => {
    const txs = [
      { id: '1', date: '2025-01-01', jar: 'save' as const, amount: 5, note: '', kind: 'allowance' as const },
      { id: '2', date: '2025-01-01', jar: 'spend' as const, amount: 4, note: '', kind: 'allowance' as const },
      { id: '3', date: '2025-01-03', jar: 'spend' as const, amount: -2.5, note: '', kind: 'spend' as const },
    ]
    expect(balances(txs)).toEqual({ save: 5, spend: 1.5, give: 0 })
    const h = history(txs)
    expect(h.spend.map((p) => p[1])).toEqual([4, 1.5])
  })
  it('interest projection', () => {
    expect(weeklyRate(0)).toBe(0)
    expect(Math.pow(1 + weeklyRate(5), 52 / 12)).toBeCloseTo(1.05, 10)
    expect(projectSavings(10, 5, 0, 4)).toEqual([10, 15, 20, 25, 30])
    expect(weeksToGoal(0, 5, 0, 50)).toBe(10)
    expect(weeksToGoal(0, 5, 10, 100)).toBeLessThan(20)
    expect(weeksToGoal(0, 0, 0, 50)).toBe(Infinity)
  })
  it('weeks due', () => {
    expect(weeksDue('2025-01-01', '2025-01-15')).toBe(2)
    expect(weeksDue('2025-01-01', '2025-01-07')).toBe(0)
    expect(addDays('2025-01-30', 3)).toBe('2025-02-02')
  })
})
