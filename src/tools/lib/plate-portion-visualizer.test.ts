import { describe, expect, it } from 'vitest'
import { moundRadius, portions, sectorCentroid, USABLE } from './plate-portion-visualizer'

describe('plate portions', () => {
  const secs = [
    { group: 'veg' as const, frac: 2, food: 'broccoli' },
    { group: 'protein' as const, frac: 1, food: 'chicken' },
    { group: 'grain' as const, frac: 1, food: 'brownrice' },
  ]
  it('splits the usable area by normalised fractions', () => {
    const p = portions(25, secs)
    const area = Math.PI * ((25 * USABLE) / 2) ** 2
    expect(p[0].area).toBeCloseTo(area / 2, 6)
    expect(p[1].spanDeg).toBeCloseTo(90, 9)
    expect(p[2].startDeg).toBeCloseTo(270, 9)
    // chicken: area/4 * 2 cm * 0.7 fill * 1.05 g/ml
    expect(p[1].grams).toBeCloseTo((area / 4) * 2 * 0.7 * 1.05, 6)
    expect(p[1].kcal).toBeCloseTo(p[1].grams * 1.65, 6)
  })
  it('scales with plate size (area ∝ d²)', () => {
    const a = portions(20, secs)[0].ml, b = portions(30, secs)[0].ml
    expect(b / a).toBeCloseTo(2.25, 9)
  })
  it('geometry helpers', () => {
    // hemisphere of radius 3, height 3: V = 2/3 π 27
    expect(moundRadius((2 / 3) * Math.PI * 27, 3)).toBeCloseTo(3, 9)
    expect(sectorCentroid(10, 360)).toBe(0)
    // semicircle centroid = 4r / 3π
    expect(sectorCentroid(10, 180)).toBeCloseTo(40 / (3 * Math.PI), 9)
  })
})
