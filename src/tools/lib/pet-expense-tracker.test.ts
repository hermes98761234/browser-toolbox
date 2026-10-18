import { describe, expect, it } from 'vitest'
import { byKey, byMonthCategory, lastMonths, projection, ytd, type Entry } from './pet-expense-tracker'

const e = (date: string, amount: number, category = 'Food', pet = 'a'): Entry => ({ id: date + amount, pet, date, category, amount, note: '' })

describe('pet expenses', () => {
  it('month keys across a year boundary', () => {
    expect(lastMonths('2026-02-10', 4)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02'])
  })
  it('aggregates by month and category', () => {
    const es = [e('2026-09-03', 40), e('2026-09-20', 120, 'Vet'), e('2026-10-01', 45)]
    const r = byMonthCategory(es, ['2026-09', '2026-10'], ['Food', 'Vet'])
    expect(r[0]).toEqual({ month: '2026-09', values: [40, 120], total: 160 })
    expect(byKey(es, 'category')[0]).toEqual(['Vet', 120])
  })
  it('projects from complete months only', () => {
    const es = [e('2026-07-05', 100), e('2026-08-05', 200), e('2026-09-05', 300), e('2026-10-05', 999)]
    const p = projection(es, '2026-10-18', 3)
    expect(p.avg).toBe(200)
    expect(p.year).toBe(2400)
    // tracking started in September → only 1 month counted
    expect(projection([e('2026-09-05', 300)], '2026-10-18', 6)).toEqual({ avg: 300, year: 3600, months: 1 })
    expect(ytd(es, '2026-10-18')).toBe(1599)
  })
})
