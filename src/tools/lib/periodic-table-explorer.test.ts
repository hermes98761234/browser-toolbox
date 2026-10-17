import { describe, expect, it } from 'vitest'
import { config, ELEMENTS, position, shells, stateAt } from './periodic-table-explorer'

const el = (s: string) => ELEMENTS.find((e) => e.sym === s)!

describe('periodic table explorer', () => {
  it('has all 118 elements in order', () => {
    expect(ELEMENTS).toHaveLength(118)
    expect(ELEMENTS[25].sym).toBe('Fe')
    expect(ELEMENTS[117].sym).toBe('Og')
    expect(el('Au').z).toBe(79)
  })
  it('places elements in the table', () => {
    expect(position(1)).toEqual({ period: 1, group: 1 })
    expect(position(2)).toEqual({ period: 1, group: 18 })
    expect(position(5).group).toBe(13)
    expect(position(26)).toEqual({ period: 4, group: 8 })
    expect(position(79)).toEqual({ period: 6, group: 11 })
    expect(position(72).group).toBe(4)
    expect(position(57).fRow).toBe(1)
    expect(position(103)).toMatchObject({ fRow: 2, fCol: 14 })
    expect(position(118)).toEqual({ period: 7, group: 18 })
  })
  it('builds electron configurations', () => {
    expect(config(1)).toBe('1s1')
    expect(config(26)).toBe('[Ar] 3d6 4s2')
    expect(config(29)).toBe('[Ar] 3d10 4s1')
    expect(config(46)).toBe('[Kr] 4d10')
    expect(config(82)).toBe('[Xe] 4f14 5d10 6s2 6p2')
    expect(config(64)).toBe('[Xe] 4f7 5d1 6s2')
    expect(shells(26)).toEqual([2, 8, 14, 2])
  })
  it('knows the phase at room temperature', () => {
    expect(stateAt(el('Hg'), 298)).toBe('liquid')
    expect(stateAt(el('Br'), 298)).toBe('liquid')
    expect(stateAt(el('Ga'), 298)).toBe('solid')
    expect(stateAt(el('Ga'), 310)).toBe('liquid')
    expect(stateAt(el('O'), 298)).toBe('gas')
    expect(ELEMENTS.filter((e) => stateAt(e, 298) === 'gas').map((e) => e.sym)).toEqual(['H', 'He', 'N', 'O', 'F', 'Ne', 'Cl', 'Ar', 'Kr', 'Xe', 'Rn'])
  })
})
