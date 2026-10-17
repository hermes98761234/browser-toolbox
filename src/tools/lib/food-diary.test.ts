import { describe, expect, it } from 'vitest'
import { energySplit, FOODS, fuzzyScore, scale, searchFoods, sum } from './food-diary'

describe('food-diary', () => {
  it('parses the bundled table', () => {
    expect(FOODS.length).toBeGreaterThan(100)
    for (const f of FOODS) {
      expect(Number.isFinite(f.kcal) && f.serving > 0).toBe(true)
      // energy roughly consistent with Atwater factors (alcohol/fiber aside)
      if (!/beer|wine/i.test(f.name)) expect(Math.abs(f.protein * 4 + f.carbs * 4 + f.fat * 9 - f.kcal)).toBeLessThan(Math.max(25, f.kcal * 0.15))
    }
  })
  it('fuzzy search ranks prefix and typo matches', () => {
    expect(searchFoods('banan', FOODS)[0].name).toBe('Banana')
    expect(searchFoods('chkn breast', FOODS)[0].name).toBe('Chicken breast, grilled')
    expect(searchFoods('greek yog', FOODS).map((f) => f.name)).toContain('Greek yogurt, plain')
    expect(fuzzyScore('xyzzy', 'Apple')).toBe(0)
  })
  it('scales and sums nutrients', () => {
    const egg = FOODS.find((f) => f.name.startsWith('Egg, whole'))!
    const two = scale(egg, 100)
    expect(two.kcal).toBe(155)
    const s = sum([scale(egg, 50), scale(egg, 50)])
    expect(s.protein).toBeCloseTo(12.6)
    const e = energySplit({ kcal: 0, protein: 25, carbs: 25, fat: 0, fiber: 0 })
    expect(e.protein).toBeCloseTo(0.5)
  })
})
