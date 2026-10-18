import { describe, expect, it } from 'vitest'
import { amounts, beverage, clock, METHODS, schedule, stepAt } from './coffee-brew-ratio'

const v60 = METHODS.find((m) => m.id === 'v60')!

describe('coffee brew ratio', () => {
  it('amounts both ways', () => {
    expect(amounts('coffee', 20, 16)).toEqual({ coffee: 20, water: 320 })
    expect(amounts('water', 500, 16.666666666666668).coffee).toBeCloseTo(30, 6)
    expect(beverage(v60, 20, 320)).toBe(280)
  })
  it('pour schedule ends at total water and is ordered', () => {
    const s = schedule(v60, 20, 320)
    expect(s[0].water).toBe(50)
    const w = s.filter((x) => x.water !== undefined).map((x) => x.water!)
    expect(w.at(-1)).toBe(320)
    for (let i = 1; i < s.length; i++) expect(s[i].at).toBeGreaterThanOrEqual(s[i - 1].at)
    expect(stepAt(s, 0)).toBe(0)
    expect(stepAt(s, 9999)).toBe(s.length - 1)
  })
  it('clock format', () => {
    expect(clock(75)).toBe('1:15')
    expect(clock(14 * 3600)).toBe('14:00:00')
  })
})
