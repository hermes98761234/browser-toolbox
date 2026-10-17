import { describe, expect, it } from 'vitest'
import { dueFor, kmPerMonth, type Item, type Rec } from './car-maintenance-tracker'

const oil: Item = { id: 'oil', name: 'Oil', km: 10000, months: 12 }
const rec = (date: string, odo: number, items: string[]): Rec => ({ id: date, vehicle: 'v', date, odo, items, cost: 0, shop: '', note: '' })

describe('car-maintenance-tracker', () => {
  it('uses the latest matching record', () => {
    const d = dueFor(oil, [rec('2025-01-10', 40000, ['oil']), rec('2025-06-01', 45000, ['rotate'])], 47000, '2025-07-01', 1000, '2020-01-01')
    expect(d.last?.date).toBe('2025-01-10')
    expect(d.dueOdo).toBe(50000)
    expect(d.kmLeft).toBe(3000)
    expect(d.dueDate).toBe('2026-01-10')
    expect(d.status).toBe('ok')
    expect(d.eta).toBe('2025-09-30') // ~3 months (91 days) at 1000 km/month comes before the 12-month limit
  })
  it('flags overdue by distance or time and due soon', () => {
    expect(dueFor(oil, [rec('2025-01-10', 40000, ['oil'])], 50500, '2025-03-01', 1000, '').status).toBe('overdue')
    expect(dueFor(oil, [rec('2024-01-10', 40000, ['oil'])], 41000, '2025-02-01', 100, '').status).toBe('overdue')
    expect(dueFor(oil, [rec('2025-01-10', 40000, ['oil'])], 49200, '2025-03-01', 1000, '').status).toBe('soon')
  })
  it('handles end-of-month dates and missing history', () => {
    expect(dueFor({ ...oil, km: 0, months: 1 }, [rec('2025-01-31', 0, ['oil'])], 0, '2025-02-01', 0, '').dueDate).toBe('2025-02-28')
    const fresh = dueFor(oil, [], 4000, '2025-02-01', 0, '2024-06-01')
    expect(fresh.kmLeft).toBe(6000)
    expect(fresh.dueDate).toBe('2025-06-01')
  })
  it('estimates distance per month', () => {
    expect(kmPerMonth([rec('2024-01-01', 10000, [])], 22000, '2025-01-01')).toBeCloseTo(12000 / (366 / 30.4375), 6)
    expect(kmPerMonth([], 1000, '2025-01-01')).toBe(0)
  })
})
