import { describe, expect, it } from 'vitest'
import { dilution, ELEMENTS, hillFormula, molarMass, parseFormula, solve } from './molarity-calculator'

const mm = (f: string) => molarMass(parseFormula(f))

describe('molarity-calculator', () => {
  it('has a full periodic table with correct positions', () => {
    expect(ELEMENTS.length).toBe(118)
    const pos = (s: string) => ELEMENTS.find((e) => e.symbol === s)!
    expect([pos('Fe').row, pos('Fe').col]).toEqual([4, 8])
    expect([pos('Hf').row, pos('Hf').col]).toEqual([6, 4])
    expect([pos('Og').row, pos('Og').col]).toEqual([7, 18])
    expect([pos('Ce').row, pos('Ce').col]).toEqual([8, 4])
    expect([pos('B').row, pos('B').col]).toEqual([2, 13])
  })
  it('computes molar masses', () => {
    expect(mm('NaCl')).toBeCloseTo(58.44, 2)
    expect(mm('CuSO4·5H2O')).toBeCloseTo(249.68, 1)
    expect(mm('CuSO4.5H2O')).toBeCloseTo(249.68, 1)
    expect(mm('Ca(OH)2')).toBeCloseTo(74.09, 2)
    expect(mm('K4[Fe(CN)6]')).toBeCloseTo(368.35, 1)
    expect(mm('C6H12O6')).toBeCloseTo(180.156, 2)
    expect(mm('2H2O')).toBeCloseTo(36.03, 2)
  })
  it('rejects bad formulas', () => {
    expect(() => parseFormula('Xx2')).toThrow(/Unknown/)
    expect(() => parseFormula('Ca(OH2')).toThrow(/Missing/)
    expect(() => parseFormula('NaCl)')).toThrow(/Unexpected/)
  })
  it('writes Hill formulas', () => {
    expect(hillFormula(parseFormula('CH3COOH'))).toBe('C2H4O2')
    expect(hillFormula(parseFormula('H2SO4'))).toBe('H2O4S')
  })
  it('solves molarity and dilution', () => {
    expect(solve('mass', { massG: 0, volL: 0.5, concM: 0.1, mw: 58.44 })).toBeCloseTo(2.922, 6)
    expect(solve('conc', { massG: 2.922, volL: 0.5, concM: 0, mw: 58.44 })).toBeCloseTo(0.1, 9)
    expect(solve('volume', { massG: 2.922, volL: 0, concM: 0.1, mw: 58.44 })).toBeCloseTo(0.5, 9)
    expect(solve('mass', { massG: 0, volL: 1, concM: 1, mw: 100, purity: 50 })).toBe(200)
    expect(dilution(10, null, 1, 100)).toBe(10)
    expect(dilution(null, 5, 2, 50)).toBe(20)
  })
})
