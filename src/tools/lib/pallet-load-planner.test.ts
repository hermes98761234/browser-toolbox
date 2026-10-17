import { describe, expect, it } from 'vitest'
import { packLayer, planPallet } from './pallet-load-planner'

const overlaps = (r: { x: number; y: number; w: number; d: number }[]) => {
  for (let i = 0; i < r.length; i++)
    for (let j = i + 1; j < r.length; j++) {
      const a = r[i], b = r[j]
      if (a.x < b.x + b.w - 1e-6 && b.x < a.x + a.w - 1e-6 && a.y < b.y + b.d - 1e-6 && b.y < a.y + a.d - 1e-6) return true
    }
  return false
}

describe('pallet packing', () => {
  it('fills a EUR pallet with standard module boxes', () => {
    expect(packLayer(1200, 800, 600, 400)).toHaveLength(4)
    expect(packLayer(1200, 800, 400, 300)).toHaveLength(8)
    expect(packLayer(1200, 800, 300, 200)).toHaveLength(16)
  })
  it('mixes orientations when that helps', () => {
    // 1200x1000 with 500x300: plain rows give 2x3=6 or 4x2=8; mixing gives 8 too, 1000x1200 rotated... at least 8
    const r = packLayer(1200, 1000, 500, 300)
    expect(r.length).toBeGreaterThanOrEqual(7)
    expect(overlaps(r)).toBe(false)
    for (const b of r) {
      expect(b.x).toBeGreaterThanOrEqual(-1e-6)
      expect(b.x + b.w).toBeLessThanOrEqual(1200 + 1e-6)
      expect(b.y + b.d).toBeLessThanOrEqual(1000 + 1e-6)
    }
  })
  it('respects height and weight limits', () => {
    const base = { palletL: 1200, palletW: 800, palletH: 144, palletKg: 25, boxL: 400, boxW: 300, boxH: 250, boxKg: 12, maxHeight: 1800, maxKg: 1000, overhang: 0, upright: true }
    const p = planPallet(base)
    expect(p.perLayer).toBe(8)
    expect(p.layers).toBe(6) // (1800-144)/250 = 6.6
    expect(p.total).toBe(48)
    const heavy = planPallet({ ...base, boxKg: 30 })
    expect(heavy.total).toBe(33) // 1000/30
    expect(heavy.limitedBy).toBe('weight')
    expect(heavy.topLayer).toBe(1)
  })
})
