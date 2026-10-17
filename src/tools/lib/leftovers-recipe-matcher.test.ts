import { describe, expect, it } from 'vitest'
import { editDistance, matchScore, normalize, parseRecipes, rankRecipes, scoreRecipe } from './leftovers-recipe-matcher'

const R = parseRecipes()

describe('leftovers-recipe-matcher', () => {
  it('parses the bundled dataset', () => {
    expect(R.length).toBeGreaterThanOrEqual(60)
    const fr = R.find((r) => r.name === 'Fried rice')!
    expect(fr.need).toEqual(['cooked rice', 'egg', 'soy sauce', 'green onion'])
    expect(fr.optional).toContain('carrot')
    expect(R.every((r) => r.need.length > 0 && r.minutes > 0 && r.method.length > 10)).toBe(true)
  })
  it('normalises plurals and synonyms', () => {
    expect(normalize('Tomatoes')).toBe('tomato')
    expect(normalize('scallions')).toBe('green onion')
    expect(normalize('Courgette')).toBe('zucchini')
    expect(normalize('2 chicken breasts')).toBe('chicken')
    expect(normalize('leftover rice')).toBe('cooked rice')
    expect(normalize('mature cheddar')).toBe('mature cheese')
    expect(normalize('bell peppers')).toBe('bell pepper')
    expect(normalize('berries')).toBe('berry')
  })
  it('fuzzy matches typos and partial names', () => {
    expect(editDistance('brocoli', 'broccoli')).toBe(1)
    expect(editDistance('ab', 'ba')).toBe(1)
    expect(matchScore(normalize('brocoli'), normalize('broccoli'))).toBeGreaterThan(0.75)
    expect(matchScore('rice', 'cooked rice')).toBeGreaterThan(0.75)
    expect(matchScore('mature cheese', 'cheese')).toBeGreaterThan(0.9)
    expect(matchScore('egg', 'eggplant')).toBe(0)
  })
  it('scores recipes by coverage and lists what is missing', () => {
    const m = scoreRecipe(R.find((r) => r.name === 'Fried rice')!, ['rice', 'eggs', 'soy sauce'], ['salt'])
    expect(m.missing).toEqual(['green onion'])
    expect(m.coverage).toBeCloseTo(0.75)
    const top = rankRecipes(R, ['eggs', 'potatoes', 'onion'], ['salt', 'olive oil'])[0]
    expect(top.recipe.name).toBe('Spanish omelette')
    expect(top.missing).toEqual([])
  })
})
