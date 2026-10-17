import { describe, expect, it } from 'vitest'
import { aisle, formatQty, normItem, parseIngredient, shoppingList, type Recipe } from './meal-planner'

describe('meal-planner', () => {
  it('parses ingredient lines', () => {
    expect(parseIngredient('200 g pasta')).toEqual({ qty: 200, unit: 'g', item: 'pasta' })
    expect(parseIngredient('200g Pasta')).toEqual({ qty: 200, unit: 'g', item: 'pasta' })
    expect(parseIngredient('1/2 cup milk')).toEqual({ qty: 0.5, unit: 'cup', item: 'milk' })
    expect(parseIngredient('1 1/2 tbsp olive oil')).toEqual({ qty: 1.5, unit: 'tbsp', item: 'olive oil' })
    expect(parseIngredient('3 Eggs')).toEqual({ qty: 3, unit: '', item: 'egg' })
    expect(parseIngredient('2 cloves garlic, minced')).toEqual({ qty: 2, unit: 'cloves', item: 'garlic' })
    expect(parseIngredient('Salt')).toEqual({ qty: 1, unit: '', item: 'salt' })
    expect(parseIngredient('  ')).toBeNull()
  })
  it('normalises plurals', () => {
    expect(normItem('Tomatoes')).toBe('tomato')
    expect(normItem('berries')).toBe('berry')
    expect(normItem('hummus')).toBe('hummus')
    expect(normItem('onions (red)')).toBe('onion')
  })
  it('aggregates and scales across the plan', () => {
    const recipes: Recipe[] = [
      { id: 'a', name: 'A', servings: 2, tags: '', ingredients: '200 g pasta\n1 kg tomatoes\n2 eggs\n1 tbsp oil' },
      { id: 'b', name: 'B', servings: 4, tags: '', ingredients: '0.5 kg pasta\n4 eggs\n1/4 cup oil' },
    ]
    const list = shoppingList({ '0-2': [{ recipe: 'a', servings: 4 }], '1-1': [{ recipe: 'b', servings: 2 }] }, recipes)
    const get = (n: string) => list.find((x) => x.item === n)!
    expect(get('pasta').qty).toBeCloseTo(400 + 250, 6)
    expect(formatQty(get('pasta'))).toBe('650 g')
    expect(formatQty(get('tomato'))).toBe('2 kg')
    expect(get('egg').qty).toBe(6)
    expect(get('oil').qty).toBeCloseTo(30 + 30, 6)
    expect(get('pasta').recipes).toEqual(['A', 'B'])
  })
  it('formats counts and guesses aisles', () => {
    expect(formatQty({ qty: 2.1, unit: 'can', dim: 'count' })).toBe('2.25 cans')
    expect(formatQty({ qty: 1500, unit: 'ml', dim: 'vol' })).toBe('1.5 l')
    expect(aisle('chicken breast')).toBe('Meat & fish')
    expect(aisle('black pepper')).toBe('Pantry')
    expect(aisle('red onion')).toBe('Produce')
  })
})
