import { describe, expect, it } from 'vitest'
import { findTimer, parseCommand, parseRecipe } from './hands-free-recipe-reader'

describe('recipe reader', () => {
  it('parses sections', () => {
    const r = parseRecipe('Pancakes\n\nIngredients\n- 2 eggs\n- 1 cup flour\n\nMethod\n1. Whisk everything.\n2. Fry for 2 minutes.')
    expect(r.title).toBe('Pancakes')
    expect(r.ingredients).toEqual(['2 eggs', '1 cup flour'])
    expect(r.steps).toEqual(['Whisk everything.', 'Fry for 2 minutes.'])
  })
  it('finds timers', () => {
    expect(findTimer('Bake for 25 minutes until golden')).toBe(1500)
    expect(findTimer('Simmer 8-10 mins')).toBe(600)
    expect(findTimer('Rest for an hour')).toBe(3600)
    expect(findTimer('Season to taste')).toBeNull()
  })
  it('parses commands', () => {
    expect(parseCommand('next please')).toBe('next')
    expect(parseCommand('no go back')).toBe('back')
    expect(parseCommand('start timer')).toBe('timer')
    expect(parseCommand('banana')).toBeNull()
  })
})
