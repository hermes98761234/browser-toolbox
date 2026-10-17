import { describe, expect, it } from 'vitest'
import { ITEMS, search, SPECIES, worst } from './toxic-food-checker'

describe('toxic-food-checker', () => {
  it('parses every row completely', () => {
    expect(ITEMS.length).toBeGreaterThan(50)
    for (const it of ITEMS) {
      expect(it.name).toBeTruthy()
      expect(['food', 'plant', 'household']).toContain(it.kind)
      for (const s of SPECIES) expect(['E', 'T', 'C', 'S', '?']).toContain(it.sev[s])
      expect(it.note).toBeTruthy()
    }
  })
  it('encodes key well-known facts', () => {
    const get = (n: string) => ITEMS.find((i) => i.name.startsWith(n))!
    expect(get('Chocolate').sev.dog).toBe('E')
    expect(get('Xylitol').sev.dog).toBe('E')
    expect(get('Grapes').sev.dog).toBe('E')
    expect(get('Lilies').sev.cat).toBe('E')
    expect(get('Avocado').sev.bird).toBe('E')
    expect(get('Onion').sev.cat).toBe('E')
    expect(get('Ragwort').sev.horse).toBe('E')
  })
  it('searches names and aliases fuzzily', () => {
    expect(search('raisin')[0].name).toBe('Grapes and raisins')
    expect(search('choc')[0].name).toBe('Chocolate')
    expect(search('sugar-free gum')[0].name).toBe('Xylitol')
    expect(search('stargazer')[0].name).toContain('Lilies')
    expect(search('').length).toBe(ITEMS.length)
  })
  it('finds the worst severity across species', () => {
    const av = ITEMS.find((i) => i.name === 'Avocado')!
    expect(worst(av, ['dog', 'cat'])).toBe('C')
    expect(worst(av, ['dog', 'bird'])).toBe('E')
  })
})
