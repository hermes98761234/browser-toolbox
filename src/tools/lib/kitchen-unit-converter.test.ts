import { describe, expect, it } from 'vitest'
import { convert, density, fraction, fuzzy, matchIngredient, parseLine, parseQty } from './kitchen-unit-converter'

describe('kitchen-unit-converter', () => {
  it('converts within a kind', () => {
    expect(convert(1, 'cup', 'tbsp')).toBeCloseTo(16, 3)
    expect(convert(1, 'tbsp', 'tsp')).toBeCloseTo(3, 3)
    expect(convert(1, 'lb', 'oz')).toBeCloseTo(16, 3)
    expect(convert(1, 'l', 'cup')).toBeCloseTo(4.2268, 3)
  })
  it('converts across kinds with density', () => {
    expect(convert(1, 'cup', 'g', density(120))).toBeCloseTo(120, 6)
    expect(convert(240, 'g', 'cup', density(120))).toBeCloseTo(2, 6)
    expect(convert(1, 'cup', 'g')).toBeNaN()
  })
  it('parses quantities and lines', () => {
    expect(parseQty('1 1/2')).toBe(1.5)
    expect(parseQty('1½')).toBe(1.5)
    expect(parseQty('¾')).toBe(0.75)
    expect(parseLine('2 1/4 cups all-purpose flour')).toEqual({ qty: 2.25, unit: 'cup', rest: 'all-purpose flour' })
    expect(parseLine('1 T honey')?.unit).toBe('tbsp')
    expect(parseLine('1 t baking soda')?.unit).toBe('tsp')
    expect(parseLine('8 oz cream cheese')?.unit).toBe('oz')
    expect(parseLine('4 fl oz milk')?.unit).toBe('floz')
    expect(parseLine('3 eggs')).toEqual({ qty: 3, unit: null, rest: 'eggs' })
    expect(parseLine('salt to taste')).toBeNull()
  })
  it('matches ingredients fuzzily', () => {
    expect(fuzzy('flour', 'All-purpose flour')).toBeGreaterThan(0)
    expect(fuzzy('xyz', 'Butter')).toBe(0)
    expect(matchIngredient('all-purpose flour, sifted')?.[0]).toBe('All-purpose flour')
    expect(matchIngredient('granulated sugar')?.[0]).toBe('Granulated sugar')
    expect(matchIngredient('butter, softened')?.[0]).toBe('Butter')
    expect(matchIngredient('unsalted butter, melted')?.[0]).toBe('Butter')
  })
  it('formats fractions', () => {
    expect(fraction(1.5)).toBe('1 ½')
    expect(fraction(0.333)).toBe('⅓')
    expect(fraction(2)).toBe('2')
  })
})
