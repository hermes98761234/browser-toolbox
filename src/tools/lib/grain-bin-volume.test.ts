import { describe, expect, it } from 'vitest'
import { bushels, capacity, FT3_PER_BU, grainVolume, type Bin } from './grain-bin-volume'

const bin: Bin = { diameter: 30, wallHeight: 24, roofPitch: 30, hopper: false, hopperAngle: 45 }

describe('grain bin volume', () => {
  it('US bushel volume', () => {
    expect(FT3_PER_BU).toBeCloseTo(1.244456, 6)
  })
  it('level fill of a 30 × 24 ft bin ≈ 13,632 bu', () => {
    const v = grainVolume(bin, 24, 'level', 23)
    expect(v.total).toBeCloseTo(Math.PI * 225 * 24, 6)
    expect(v.total / FT3_PER_BU).toBeCloseTo(13632, 0)
  })
  it('peaked and inverted cones', () => {
    const p = grainVolume(bin, 24, 'peaked', 23)
    expect(p.cone).toBeCloseTo((Math.PI * 3375 * Math.tan((23 * Math.PI) / 180)) / 3, 6)
    expect(p.peakH).toBeCloseTo(15 * Math.tan((23 * Math.PI) / 180), 6)
    const inv = grainVolume(bin, 24, 'inverted', 23)
    expect(inv.cone).toBeCloseTo(-p.cone, 6)
    // shallow grain: draw-down cone limited by depth
    const shallow = grainVolume(bin, 2, 'inverted', 23)
    expect(shallow.peakH).toBe(-2)
    expect(shallow.total).toBeGreaterThan(0)
    // roof caps the peak angle
    expect(grainVolume({ ...bin, roofPitch: 20 }, 24, 'peaked', 32).cone).toBeCloseTo((Math.PI * 3375 * Math.tan((20 * Math.PI) / 180)) / 3, 6)
  })
  it('hopper bottom adds a cone', () => {
    const h = grainVolume({ ...bin, hopper: true, hopperAngle: 45 }, 0, 'level', 23)
    expect(h.total).toBeCloseTo((Math.PI * 3375) / 3, 6)
    expect(capacity(bin, 23)).toBeCloseTo(grainVolume(bin, 24, 'peaked', 23).total, 9)
  })
  it('weights and dry bushels', () => {
    const w = bushels(FT3_PER_BU * 1000, 0, 54, 56, 20, 15.5)
    expect(w.bu).toBeCloseTo(1000, 6)
    expect(w.lb).toBeCloseTo(54000, 6)
    expect(w.marketBu).toBeCloseTo(964.29, 2)
    expect(w.dryBu).toBeCloseTo((54000 * 80) / 84.5 / 56, 6)
    expect(bushels(FT3_PER_BU * 100, 5, 56, 56, 15, 15.5).bu).toBeCloseTo(105, 6)
  })
})
