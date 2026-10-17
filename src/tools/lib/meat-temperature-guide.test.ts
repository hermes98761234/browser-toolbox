import { describe, expect, it } from 'vitest'
import { cToF, FOODS, fToC, isSafe, search, showT } from './meat-temperature-guide'

describe('meat-temperature-guide', () => {
  it('converts like the USDA chart', () => {
    expect(showT(145, 'C')).toBe('63°C')
    expect(showT(160, 'C')).toBe('71°C')
    expect(showT(165, 'C')).toBe('74°C')
    expect(fToC(212)).toBe(100)
    expect(cToF(-40)).toBe(-40)
  })
  it('keeps USDA FSIS minimums', () => {
    const f = (id: string) => FOODS.find((x) => x.id === id)!
    expect(f('beef-steak').safeF).toBe(145)
    expect(f('beef-steak').restMin).toBe(3)
    expect(f('ground-beef').safeF).toBe(160)
    expect(f('chicken-breast').safeF).toBe(165)
    expect(f('fish').safeF).toBe(145)
    expect(f('pork-chop').restMin).toBe(3)
  })
  it('flags doneness below the safe minimum', () => {
    const steak = FOODS.find((x) => x.id === 'beef-steak')!
    expect(isSafe(steak, { name: 'Rare', f: 125 })).toBe(false)
    expect(isSafe(steak, { name: 'Medium', f: 145 })).toBe(true)
  })
  it('searches names, tags and groups', () => {
    expect(search('burger', 'all').map((f) => f.id)).toContain('ground-beef')
    expect(search('salmon', 'all').map((f) => f.id)).toEqual(['fish'])
    expect(search('', 'Poultry').every((f) => f.group === 'Poultry')).toBe(true)
  })
})
