import { describe, expect, it } from 'vitest'
import { costPerDist, splitDay, splitWeek, type Leg, type Person } from './carpool-cost-splitter'

const all = [true, true, true, true, true]
const legs: Leg[] = [{ to: 'B', dist: 10, toll: 0 }, { to: 'Office', dist: 20, toll: 3 }]
const people: Person[] = [
  { id: 'd', name: 'Driver', board: 0, days: all, driver: true },
  { id: 'b', name: 'Ben', board: 1, days: all },
]

describe('carpool split', () => {
  it('cost per distance', () => {
    expect(costPerDist('km', 8, 'l100', 2, 0)).toBeCloseTo(0.16, 6)
    expect(costPerDist('mi', 30, 'mpg', 3.6, 0)).toBeCloseTo(0.12, 6)
    expect(costPerDist('km', 30, 'mpg', 3.6, 0.05)).toBeCloseTo(0.12 / 1.609344 + 0.05, 6)
  })
  it('shared legs: rider pays half the shared leg only', () => {
    const r = splitDay(legs, people, 0, 0.1, false, 0, 'legs')
    expect(r.total).toBeCloseTo(6, 6) // 1 + 2 + 3 toll
    expect(r.share.d).toBeCloseTo(1 + 2.5, 6)
    expect(r.share.b).toBeCloseTo(2.5, 6)
  })
  it('distance and equal', () => {
    const e = splitDay(legs, people, 0, 0.1, true, 10, 'equal')
    expect(e.total).toBeCloseTo(22, 6)
    expect(e.share.d).toBeCloseTo(11, 6)
    const d = splitDay(legs, people, 0, 0.1, false, 0, 'distance')
    expect(d.share.d).toBeCloseTo(6 * 30 / 50, 6)
    expect(d.share.b).toBeCloseTo(6 * 20 / 50, 6)
  })
  it('shares always sum to the total', () => {
    for (const m of ['equal', 'distance', 'legs'] as const) {
      const r = splitDay(legs, people, 0, 0.13, true, 7, m)
      expect(Object.values(r.share).reduce((a, b) => a + b, 0)).toBeCloseTo(r.total, 9)
    }
  })
  it('driver excluded and part-time riders', () => {
    const ps: Person[] = [...people, { id: 'c', name: 'Chloe', board: 0, days: [true, false, true, false, false] }]
    const w = splitWeek(legs, ps, 0.1, false, 0, 'legs', false)
    expect(w.perPerson.d).toBe(0)
    expect(w.perPerson.b + w.perPerson.c).toBeCloseTo(w.total, 9)
    expect(w.owed.c).toBeGreaterThan(0)
    const off = splitDay(legs, [{ ...people[0], days: [false, true, true, true, true] }, people[1]], 0, 0.1, false, 0, 'legs')
    expect(off.total).toBe(0)
  })
})
