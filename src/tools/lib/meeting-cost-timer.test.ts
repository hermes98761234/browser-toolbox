import { describe, expect, it } from 'vitest'
import { comparison, costAt, costPerHour, hms, people } from './meeting-cost-timer'

const g = [
  { id: 'a', role: 'Eng', count: 4, rate: 75 },
  { id: 'b', role: 'PM', count: 1, rate: 90 },
]

describe('meeting cost', () => {
  it('rates', () => {
    expect(costPerHour(g, 'hourly', 1)).toBe(390)
    expect(costPerHour(g, 'hourly', 1.3)).toBeCloseTo(507, 9)
    expect(costPerHour([{ id: 'x', role: 'x', count: 2, rate: 104000 }], 'annual', 1)).toBe(100)
    expect(people(g)).toBe(5)
  })
  it('cost over time', () => {
    expect(costAt(390, 30 * 60_000)).toBe(195)
    expect(hms(3_725_000)).toBe('1:02:05')
    expect(hms(65_000)).toBe('1:05')
  })
  it('comparison', () => {
    expect(comparison(195).label).toBe('pairs of headphones')
    expect(comparison(2).label).toBe('coffees')
  })
})
