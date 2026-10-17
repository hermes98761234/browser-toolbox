import { describe, expect, it } from 'vitest'
import { BAGS, bagsNeeded, convert, roundUp, toFt3, toYd3, volume, withWaste } from './concrete-volume-calculator'

describe('concrete volume', () => {
  it('10×10 ft slab, 4 in thick = 33.33 ft³ = 1.235 yd³', () => {
    const m3 = volume('slab', { l: 10, w: 10, t: 4 }, 'imperial')
    expect(toFt3(m3)).toBeCloseTo(33.333, 3)
    expect(toYd3(m3)).toBeCloseTo(1.2346, 3)
  })
  it('metric slab 5×4 m × 10 cm = 2 m³', () => {
    expect(volume('slab', { l: 5, w: 4, t: 10 }, 'metric')).toBeCloseTo(2, 9)
  })
  it('round column: 12 in × 10 ft ×2 = 2·π·0.25·10 ft³', () => {
    expect(toFt3(volume('column', { dia: 12, h: 10, n: 2 }, 'imperial'))).toBeCloseTo(2 * Math.PI * 0.25 * 10, 6)
  })
  it('hollow tube subtracts the core', () => {
    expect(volume('tube', { od: 40, id: 20, h: 1, n: 1 }, 'metric')).toBeCloseTo(Math.PI * (0.04 - 0.01), 9)
  })
  it('stairs: 3 steps 7 in rise, 11 in run, 4 ft wide, no landing', () => {
    // (1+2+3)·7·11 in² · 48 in = 22176 in³ = 12.833 ft³
    expect(toFt3(volume('stairs', { w: 4, rise: 7, run: 11, n: 3, land: 0 }, 'imperial'))).toBeCloseTo(12.8333, 3)
  })
  it('bags, waste and rounding', () => {
    const m3 = volume('slab', { l: 10, w: 10, t: 4 }, 'imperial')
    // 33.33 ft³ / 0.6 ft³ per 80 lb bag = 55.6 → 56
    expect(bagsNeeded(m3, BAGS.find((b) => b.id === '80lb')!.yieldM3)).toBe(56)
    expect(withWaste(1, 10)).toBeCloseTo(1.1)
    expect(roundUp(1.26, 0.25)).toBe(1.5)
    expect(roundUp(1.25, 0.25)).toBe(1.25)
    expect(convert(12, 'short', 'imperial', 'metric')).toBeCloseTo(30.48)
    expect(convert(3, 'n', 'imperial', 'metric')).toBe(3)
  })
})
