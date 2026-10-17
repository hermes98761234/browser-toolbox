import { describe, expect, it } from 'vitest'
import { formatIngredient, parseIngredient, parseQty, parseRecipe, prettyQty } from './recipe-card-scanner'

describe('recipe parser', () => {
  it('parses quantities', () => {
    expect(parseQty('1 1/2')).toBe(1.5)
    expect(parseQty('3/4')).toBe(0.75)
    expect(parseQty('1½')).toBe(1.5)
    expect(parseQty('2,5')).toBe(2.5)
    expect(parseQty('abc')).toBeNull()
  })
  it('splits ingredient lines', () => {
    expect(parseIngredient('- 2 cups all-purpose flour')).toEqual({ qty: 2, qty2: null, unit: 'cup', item: 'all-purpose flour' })
    expect(parseIngredient('1 1/2 tsp. baking soda')).toMatchObject({ qty: 1.5, unit: 'tsp', item: 'baking soda' })
    expect(parseIngredient('200g butter')).toMatchObject({ qty: 200, unit: 'g', item: 'butter' })
    expect(parseIngredient('2-3 ripe bananas')).toMatchObject({ qty: 2, qty2: 3, unit: '', item: 'ripe bananas' })
    expect(parseIngredient('Salt to taste')).toMatchObject({ qty: null, item: 'Salt to taste' })
  })
  it('scales and pretty-prints', () => {
    expect(prettyQty(1.5)).toBe('1½')
    expect(prettyQty(0.333)).toBe('⅓')
    expect(prettyQty(2)).toBe('2')
    expect(prettyQty(0.98)).toBe('1')
    expect(formatIngredient(parseIngredient('3/4 cup sugar'), 2)).toBe('1½ cup sugar')
    expect(formatIngredient(parseIngredient('250 g flour'), 1.5)).toBe('375 g flour')
  })
  it('parses a full card', () => {
    const r = parseRecipe(`Grandma's Banana Bread\nServes 8\nPrep time: 15 min  Cook time: 1 hour\n\nIngredients\n3 ripe bananas\n1/3 cup melted butter\n3/4 cup sugar\nPinch of salt\n\nDirections\n1. Preheat oven to 350F.\n2. Mash the bananas with the butter\nin a large bowl.\n3. Stir in sugar and salt.`)
    expect(r.title).toBe("Grandma's Banana Bread")
    expect(r.servings).toBe(8)
    expect(r.prep).toBe('15 min')
    expect(r.cook).toBe('1 hour')
    expect(r.ingredients).toHaveLength(4)
    expect(r.ingredients[3]).toMatchObject({ item: 'Pinch of salt' })
    expect(r.steps).toEqual(['Preheat oven to 350F.', 'Mash the bananas with the butter in a large bowl.', 'Stir in sugar and salt.'])
  })
  it('guesses sections without headers', () => {
    const r = parseRecipe('Pancakes\n1 cup flour\n1 egg\n1 cup milk\nWhisk everything together until smooth and lump free.\nCook on a hot buttered pan until golden.')
    expect(r.ingredients).toHaveLength(3)
    expect(r.steps).toHaveLength(2)
  })
})
