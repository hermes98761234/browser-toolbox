import { describe, expect, it } from 'vitest'
import { FT, IN, layer, mat, SHORT_TON, TRUCKS, trucks, YD3 } from './gravel-driveway-estimator'

describe('gravel driveway', () => {
  it('computes layer volume and tonnage', () => {
    // 100 ft × 12 ft × 4 in = 400 ft³ = 14.81 yd³ compacted
    const area = 100 * FT * 12 * FT
    const r = layer(area, 4 * IN, { ...mat('n57'), compaction: 1 })
    expect(r.compacted / YD3).toBeCloseTo(14.815, 2)
    expect(r.kg).toBeCloseTo(r.compacted * 1450, 6)
    const c = layer(area, 4 * IN, mat('cr'), 0.1)
    expect(c.loose / r.loose).toBeCloseTo(1.25 * 1.1, 6)
  })
  it('counts truckloads by weight or volume', () => {
    const tandem = TRUCKS.find((t) => t.id === 'tandem')!
    expect(trucks(14 * SHORT_TON, 1, tandem)).toBe(1)
    expect(trucks(14.1 * SHORT_TON, 1, tandem)).toBe(2)
    expect(trucks(1000, 11 * YD3, tandem)).toBe(2)
    expect(trucks(0, 0, tandem)).toBe(0)
  })
})
