import { describe, expect, it } from 'vitest'
import { amountForRatio, elements, mix, waterForMoisture } from './compost-ratio-calculator'

const grass = { name: 'Grass', n: 3.4, cn: 17, moist: 82, kg: 10 }
const leaves = { name: 'Leaves', n: 0.9, cn: 54, moist: 38, kg: 10 }

describe('compost-ratio-calculator', () => {
  it('computes elements on a dry basis', () => {
    const e = elements(grass)
    expect(e.dry).toBeCloseTo(1.8)
    expect(e.n).toBeCloseTo(0.0612)
    expect(e.c).toBeCloseTo(1.0404)
  })
  it('mixes', () => {
    const m = mix([grass, leaves])
    // leaves: dry 6.2, N 0.0558, C 3.0132
    expect(m.ratio).toBeCloseTo((1.0404 + 3.0132) / (0.0612 + 0.0558), 6)
    expect(m.moisture).toBeCloseTo(((8.2 + 3.8) / 20) * 100, 6)
    expect(mix([]).ratio).toBeNaN()
  })
  it('solves for amounts', () => {
    const x = amountForRatio([grass], leaves, 30)!
    expect(mix([grass, { ...leaves, kg: x }]).ratio).toBeCloseTo(30, 6)
    expect(amountForRatio([leaves], leaves, 30)).toBeNull()
    const w = waterForMoisture([leaves], 55)
    const after = mix([leaves, { name: 'w', n: 0, cn: 0, moist: 100, kg: w }])
    expect(after.moisture).toBeCloseTo(55, 6)
  })
})
