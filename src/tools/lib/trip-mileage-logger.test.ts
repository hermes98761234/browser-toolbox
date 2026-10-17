import { describe, expect, it } from 'vitest'
import { DEMO_METRES, demoDrive, groupBy, toUnit, trackDistance } from './trip-mileage-logger'

describe('trip mileage GPS', () => {
  it('filtered demo drive distance is within 3% of the true route', () => {
    const fixes = demoDrive()
    const { metres, kept } = trackDistance(fixes)
    expect(Math.abs(metres - DEMO_METRES) / DEMO_METRES).toBeLessThan(0.03)
    expect(kept.length).toBeLessThan(fixes.length)
  })
  it('rejects bad-accuracy jumps', () => {
    const r = trackDistance([
      { lat: 0, lon: 0, t: 0, acc: 5 },
      { lat: 0.01, lon: 0, t: 1000, acc: 5 }, // 1.1 km in 1 s: impossible
      { lat: 0.0002, lon: 0, t: 2000, acc: 5 },
      { lat: 0.0004, lon: 0, t: 3000, acc: 200 },
    ])
    expect(r.kept).toHaveLength(2)
    expect(r.metres).toBeCloseTo(22.2, 0)
  })
  it('units and grouping', () => {
    expect(toUnit(1609.344, 'mi')).toBeCloseTo(1)
    expect(toUnit(2500, 'km')).toBe(2.5)
    const g = groupBy([{ m: '2026-10', d: 10, a: 7 }, { m: '2026-09', d: 5, a: 3.5 }, { m: '2026-10', d: 2, a: 1.4 }], (x) => x.m, (x) => x.d, (x) => x.a)
    expect(g).toEqual([{ key: '2026-09', trips: 1, distance: 5, amount: 3.5 }, { key: '2026-10', trips: 2, distance: 12, amount: 8.4 }])
  })
})
