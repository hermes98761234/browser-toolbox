import { describe, expect, it } from 'vitest'
import { dv, FOODS, round, scale, sum } from './nutrition-label-maker'

describe('nutrition-label-maker', () => {
  it('parses the database', () => {
    expect(FOODS.length).toBeGreaterThan(30)
    expect(FOODS.find((f) => f.name === 'Butter (salted)')!.n.sat).toBe(51)
  })
  it('sums per gram', () => {
    const flour = FOODS[0].n
    const t = sum([{ grams: 200, n: flour }, { grams: 50, n: flour }])
    expect(t.kcal).toBeCloseTo(910)
    expect(scale(t, 0.5).carb).toBeCloseTo(95)
  })
  it('FDA rounding', () => {
    expect(round('kcal', 4)).toBe('0')
    expect(round('kcal', 47)).toBe('45')
    expect(round('kcal', 236)).toBe('240')
    expect(round('fat', 0.4)).toBe('0')
    expect(round('fat', 3.3)).toBe('3.5')
    expect(round('fat', 7.6)).toBe('8')
    expect(round('chol', 4)).toBe('less than 5')
    expect(round('chol', 33)).toBe('35')
    expect(round('sodium', 132)).toBe('130')
    expect(round('sodium', 236)).toBe('240')
    expect(round('fiber', 0.7)).toBe('less than 1')
    expect(round('ca', 44)).toBe('40')
  })
  it('daily value', () => {
    expect(dv('sodium', 230)).toBe(10)
    expect(dv('sugar', 10)).toBeNull()
  })
})
