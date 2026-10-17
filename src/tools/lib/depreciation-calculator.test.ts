import { describe, expect, it } from 'vitest'
import { MACRS, schedule, type Input } from './depreciation-calculator'

const I: Input = { cost: 10000, salvage: 1000, life: 5, months: 12, factor: 2, switchToSl: true, units: [2000, 3000, 2500, 1500, 1000], totalUnits: 10000, macrs: 5 }

describe('depreciation', () => {
  it('straight-line', () => {
    const s = schedule(I, 'sl')
    expect(s.map((r) => r.dep)).toEqual([1800, 1800, 1800, 1800, 1800])
    expect(s[4].book).toBe(1000)
  })
  it('double declining balance with switch', () => {
    const s = schedule(I, 'db')
    expect(s.map((r) => r.dep)).toEqual([4000, 2400, 1440, 864, 296])
    expect(s[4].book).toBe(1000)
    const z = { ...I, salvage: 0 }
    expect(schedule(z, 'db').map((r) => r.dep)).toEqual([4000, 2400, 1440, 1080, 1080])
    expect(schedule({ ...z, switchToSl: false }, 'db').map((r) => r.dep)).toEqual([4000, 2400, 1440, 864, 518.4])
  })
  it('sum of years digits', () => {
    expect(schedule(I, 'syd').map((r) => r.dep)).toEqual([3000, 2400, 1800, 1200, 600])
  })
  it('units of production', () => {
    expect(schedule(I, 'units').map((r) => r.dep)).toEqual([1800, 2700, 2250, 1350, 900])
  })
  it('partial first year (6 months) spreads over life + 1 years', () => {
    const s = schedule({ ...I, months: 6 }, 'sl')
    expect(s.length).toBe(6)
    expect(s[0].dep).toBe(900)
    expect(s[5].dep).toBe(900)
    expect(s[5].book).toBe(1000)
  })
  it('MACRS tables add to 100% and ignore salvage', () => {
    for (const t of Object.values(MACRS)) expect(t.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 1)
    const s = schedule(I, 'macrs')
    expect(s.map((r) => r.dep)).toEqual([2000, 3200, 1920, 1152, 1152, 576])
    expect(s[5].book).toBe(0)
  })
})
