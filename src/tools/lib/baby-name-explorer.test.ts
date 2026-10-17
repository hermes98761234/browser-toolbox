import { describe, expect, it } from 'vitest'
import { editDistance, NAMES, ORIGINS, score, syllables } from './baby-name-explorer'

describe('baby names', () => {
  it('parses the dataset', () => {
    expect(NAMES.length).toBeGreaterThan(400)
    expect(ORIGINS).toContain('Norse')
    expect(NAMES.find((n) => n.name === 'Sophia')).toMatchObject({ g: 'f', origin: 'Greek', meaning: 'wisdom' })
    expect(NAMES.every((n) => n.meaning.length > 1)).toBe(true)
  })
  it('counts syllables', () => {
    expect(syllables('Grace')).toBe(1)
    expect(syllables('Oliver')).toBe(3)
    expect(syllables('Amelia')).toBe(3)
  })
  it('fuzzy scores', () => {
    const sophia = NAMES.find((n) => n.name === 'Sophia')!
    expect(score(sophia, 'sophia')).toBe(100)
    expect(score(sophia, 'soph')).toBeGreaterThan(60)
    expect(score(sophia, 'sopiha')).toBeGreaterThan(0)
    expect(score(sophia, 'wisdom')).toBe(30)
    expect(score(sophia, 'xyz')).toBe(0)
    expect(editDistance('kitten', 'sitting')).toBe(3)
    expect(editDistance('ab', 'ba')).toBe(1)
  })
})
