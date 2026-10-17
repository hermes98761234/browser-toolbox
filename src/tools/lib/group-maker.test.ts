import { describe, expect, it } from 'vitest'
import { makeGroups, parsePairs, parseRoster, sizesFor } from './group-maker'

const roster = parseRoster(Array.from({ length: 24 }, (_, i) => `P${i}, ${i % 2 ? 'girl' : 'boy'}, ${(i % 5) + 1}`).join('\n'))

describe('group-maker', () => {
  it('parses roster lines and pairs', () => {
    expect(parseRoster('Anna, girl, 4\nBen\n# note\nanna\nCleo; 2.5')).toEqual([
      { name: 'Anna', tag: 'girl', skill: 4 }, { name: 'Ben', tag: '', skill: null }, { name: 'Cleo', tag: '', skill: 2.5 },
    ])
    expect(parsePairs('Anna - Ben\nCleo + Dan\nbad line')).toEqual([{ a: 'Anna', b: 'Ben', together: false }, { a: 'Cleo', b: 'Dan', together: true }])
  })
  it('splits sizes evenly', () => {
    expect(sizesFor(26, 'size', 4)).toEqual([4, 4, 4, 4, 4, 3, 3])
    expect(sizesFor(10, 'count', 3)).toEqual([4, 3, 3])
  })
  it('keeps people apart / together and balances tags', () => {
    const pairs = parsePairs('P0 - P2\nP0 - P4\nP1 + P3\nP5 - P7')
    const r = makeGroups(roster, sizesFor(24, 'count', 4), pairs, 42)
    expect(r.groups.map((g) => g.length)).toEqual([6, 6, 6, 6])
    expect(r.apartBroken).toEqual([])
    expect(r.togetherBroken).toEqual([])
    for (const g of r.groups) expect(g.filter((p) => p.tag === 'girl').length).toBe(3)
  })
  it('is deterministic per seed', () => {
    const a = makeGroups(roster, [8, 8, 8], [], 7).groups.map((g) => g.map((p) => p.name))
    const b = makeGroups(roster, [8, 8, 8], [], 7).groups.map((g) => g.map((p) => p.name))
    expect(a).toEqual(b)
  })
})
