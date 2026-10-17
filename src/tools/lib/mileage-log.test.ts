import { describe, expect, it } from 'vitest'
import { claim, odometerIssues, RATE_SETS, summary, tieredAmount, tripDistance, type Trip } from './mileage-log'

const T = (p: Partial<Trip>): Trip => ({ id: Math.random().toString(), date: '2025-03-01', vehicle: 'Car', from: '', to: '', purpose: '', cat: 'business', start: null, end: null, dist: 0, round: false, ...p })

describe('distance', () => {
  it('odometer beats distance; round trips double', () => {
    expect(tripDistance(T({ start: 1000, end: 1042, dist: 5, round: true }))).toBe(42)
    expect(tripDistance(T({ dist: 12.5, round: true }))).toBe(25)
  })
})

describe('tiers', () => {
  const hmrc = RATE_SETS.find((r) => r.id === 'hmrc')!
  it('HMRC 45p then 25p after 10,000 miles', () => {
    expect(tieredAmount(hmrc.business, 9900, 200)).toBeCloseTo(100 * 0.45 + 100 * 0.25)
    expect(tieredAmount(hmrc.business, 0, 10000)).toBeCloseTo(4500)
    expect(tieredAmount(hmrc.business, 12000, 10)).toBeCloseTo(2.5)
  })
  it('claim accumulates business distance in date order and rates other categories', () => {
    const lines = claim([T({ date: '2025-02-01', dist: 6000 }), T({ date: '2025-01-01', dist: 5000 }), T({ cat: 'charity', dist: 100 }), T({ cat: 'personal', dist: 50 })], hmrc)
    expect(lines[0].trip.date).toBe('2025-01-01')
    expect(lines.reduce((a, l) => a + l.amount, 0)).toBeCloseTo(4500 + 1000 * 0.25 + 45)
    const s = summary(lines)
    expect(s.total).toBe(11150)
    expect(s.byCat.business).toBe(11000)
    expect(s.months[1].business).toBe(6000)
  })
  it('IRS flat rate', () => {
    const irs = RATE_SETS[0]
    expect(claim([T({ dist: 100 }), T({ cat: 'medical', dist: 100 })], irs).map((l) => l.amount)).toEqual([70, 21])
  })
})

describe('odometer checks', () => {
  it('flags reversed and overlapping readings', () => {
    const a = T({ id: 'a', date: '2025-01-01', start: 100, end: 150 })
    const b = T({ id: 'b', date: '2025-01-02', start: 140, end: 160 })
    const c = T({ id: 'c', date: '2025-01-03', start: 200, end: 190 })
    expect(Object.keys(odometerIssues([a, b, c]))).toEqual(['b', 'c'])
  })
})
