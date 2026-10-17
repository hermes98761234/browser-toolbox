import { describe, expect, it } from 'vitest'
import { fmtQty, formatScaled, parseLine, parseNumber, scaleIngredient } from './recipe-scaler'

describe('recipe scaler', () => {
  it('parses numbers', () => {
    expect(parseNumber('1 1/2')).toBe(1.5)
    expect(parseNumber('1½')).toBe(1.5)
    expect(parseNumber('3/4')).toBe(0.75)
    expect(parseNumber('0,5')).toBe(0.5)
    expect(parseNumber('⅓')).toBeCloseTo(1 / 3)
  })
  it('parses lines', () => {
    expect(parseLine('1 1/2 cups all-purpose flour')).toMatchObject({ qty: 1.5, unit: 'cup', text: 'all-purpose flour' })
    expect(parseLine('200g butter, softened')).toMatchObject({ qty: 200, unit: 'g', text: 'butter, softened' })
    expect(parseLine('2-3 cloves garlic')).toMatchObject({ qty: 2, qty2: 3, unit: null, text: 'cloves garlic' })
    expect(parseLine('2 large eggs')).toMatchObject({ qty: 2, unit: null, text: 'large eggs' })
    expect(parseLine('1 T olive oil')).toMatchObject({ unit: 'tbsp' })
    expect(parseLine('1 t salt')).toMatchObject({ unit: 'tsp' })
    expect(parseLine('Salt and pepper to taste')).toMatchObject({ qty: null, text: 'Salt and pepper to taste' })
    expect(parseLine('- ½ tsp. baking soda')).toMatchObject({ qty: 0.5, unit: 'tsp', text: 'baking soda' })
  })
  it('formats kitchen fractions', () => {
    expect(fmtQty(0.5)).toBe('½')
    expect(fmtQty(1.333)).toBe('1 ⅓')
    expect(fmtQty(2.98)).toBe('3')
    expect(fmtQty(0.15)).toBe('⅛')
    expect(fmtQty(12.3)).toBe('12.5')
  })
  it('scales and tidies units', () => {
    const tsp = parseLine('3 tsp sugar')
    expect(formatScaled(scaleIngredient(tsp, 4, 'tidy'))).toBe('¼ cup sugar')
    expect(formatScaled(scaleIngredient(tsp, 4, 'keep'))).toBe('12 tsp sugar')
    const oz = parseLine('8 oz cheese')
    expect(formatScaled(scaleIngredient(oz, 3, 'tidy'))).toBe('1 ½ lb cheese')
    expect(formatScaled(scaleIngredient(oz, 1, 'metric'))).toBe('227 g cheese')
    const g = parseLine('500 g flour')
    expect(formatScaled(scaleIngredient(g, 3, 'tidy'))).toBe('1.5 kg flour')
    const cup = parseLine('1 cup milk')
    expect(formatScaled(scaleIngredient(cup, 2, 'metric'))).toBe('473 ml milk')
    expect(formatScaled(scaleIngredient(cup, 2, 'tidy'))).toBe('2 cups milk')
    // 3 1/2 tsp × 2.5 = 8.75 tsp = 2 tbsp + 2 3/4 tsp
    expect(formatScaled(scaleIngredient(parseLine('3 1/2 tsp baking powder'), 2.5, 'tidy'))).toBe('2 tbsp + 2 ¾ tsp baking powder')
    expect(formatScaled(scaleIngredient(parseLine('1 tbsp sugar'), 2.5, 'tidy'))).toBe('2 ½ tbsp sugar')
    expect(formatScaled(scaleIngredient(parseLine('1 cup stock'), 1.25, 'tidy'))).toBe('1 ¼ cups stock')
    expect(formatScaled(scaleIngredient(parseLine('1 cup stock'), 4, 'tidy'))).toBe('4 cups stock')
    expect(formatScaled(scaleIngredient(parseLine('1 cup stock'), 10, 'tidy'))).toBe('2 ½ quarts stock')
  })
})
