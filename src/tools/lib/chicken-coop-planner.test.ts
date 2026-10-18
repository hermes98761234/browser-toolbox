import { describe, expect, it } from 'vitest'
import { autoSize, checks, materials, requirements, roostLayout, type Design } from './chicken-coop-planner'

const D: Design = { w: 2, d: 1.2, h: 1.2, legs: 0.5, runW: 2, runL: 3, runH: 1.8, roof: 'gable', pitch: 30, overhang: 0.15, confined: false, climate: 'temperate' }

describe('coop rules', () => {
  it('per-bird requirements', () => {
    const r = requirements({ bantam: 0, standard: 6, large: 0 }, false, 'temperate')
    expect(r.floor).toBeCloseTo(6 * 0.37, 9)
    expect(r.run).toBeCloseTo(6 * 0.93, 9)
    expect(r.roost).toBeCloseTo(1.2, 9)
    expect(r.nests).toBe(2)
    expect(r.vent).toBeCloseTo(0.222, 9)
    const c = requirements({ bantam: 4, standard: 0, large: 2 }, true, 'hot')
    expect(c.floor).toBeCloseTo((4 * 0.19 + 2 * 0.46) * 2.5, 9)
    expect(c.run).toBe(0)
    expect(c.nestCm).toBe(36)
    expect(c.waterL).toBe(6)
  })
  it('roost layout and checks', () => {
    const rl = roostLayout(D, 1.2)
    expect(rl.bars).toBe(2)
    expect(rl.total).toBeCloseTo(2.2, 9)
    const ch = checks(D, { bantam: 0, standard: 6, large: 0 })
    expect(ch.every((c) => c.ok)).toBe(true)
    const tight = checks({ ...D, w: 1, d: 1 }, { bantam: 0, standard: 6, large: 0 })
    expect(tight.find((c) => c.label === 'Coop floor')!.ok).toBe(false)
  })
  it('auto size satisfies the rules', () => {
    for (const n of [3, 6, 12, 25]) {
      const f = { bantam: 0, standard: n, large: 0 }
      const a = autoSize(f, false, 'temperate')
      const ch = checks({ ...D, ...a }, f)
      expect(ch.filter((c) => c.label !== 'Roost length').every((c) => c.ok)).toBe(true)
    }
  })
  it('materials list', () => {
    const m = materials(D, { bantam: 0, standard: 6, large: 0 })
    expect(m[0].qty).toBe(1)
    const roof = m.find((x) => x.item.startsWith('Roofing'))!
    // two slopes of (1 + 0.15)/cos30 × (1.2 + 0.3)
    expect(roof.qty).toBeCloseTo(Math.round(2 * (1.15 / Math.cos(Math.PI / 6)) * 1.5 * 10) / 10, 9)
    expect(m.some((x) => x.item.startsWith('Welded mesh'))).toBe(true)
  })
})
