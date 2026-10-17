import { describe, expect, it } from 'vitest'
import { balance, molarMass, parseFormula, pretty } from './equation-balancer'

const co = (eq: string) => balance(eq).coef.map(Number)

describe('equation balancer', () => {
  it('parses formulas', () => {
    expect(parseFormula('Ca3(PO4)2').atoms).toEqual({ Ca: 3, P: 2, O: 8 })
    expect(parseFormula('CuSO4·5H2O').atoms).toEqual({ Cu: 1, S: 1, O: 9, H: 10 })
    expect(parseFormula('[Fe(CN)6]^3-').charge).toBe(-3)
    expect(parseFormula('NH4+').atoms).toEqual({ N: 1, H: 4 })
    expect(parseFormula('NH4+').charge).toBe(1)
    expect(parseFormula('H2O(l)').state).toBe('l')
    expect(() => parseFormula('Xx2')).toThrow()
  })
  it('molar mass', () => {
    expect(molarMass(parseFormula('H2O'))).toBeCloseTo(18.015, 2)
  })
  it('balances classics', () => {
    expect(co('Fe + O2 = Fe2O3')).toEqual([4, 3, 2])
    expect(co('C3H8 + O2 -> CO2 + H2O')).toEqual([1, 5, 3, 4])
    expect(co('KMnO4 + HCl = KCl + MnCl2 + H2O + Cl2')).toEqual([2, 16, 2, 2, 8, 5])
    expect(co('Ca3(PO4)2 + SiO2 + C = CaSiO3 + P4 + CO')).toEqual([2, 6, 10, 6, 1, 10])
    expect(co('K4[Fe(CN)6] + KMnO4 + H2SO4 = KHSO4 + Fe2(SO4)3 + MnSO4 + HNO3 + CO2 + H2O')).toEqual([10, 122, 299, 162, 5, 122, 60, 60, 188])
    expect(co('CuSO4·5H2O = CuSO4 + H2O')).toEqual([1, 1, 5])
    expect(co('Cu + HNO3 = Cu(NO3)2 + NO + H2O')).toEqual([3, 8, 3, 2, 4])
  })
  it('balances ionic equations', () => {
    expect(co('MnO4^- + Fe^2+ + H^+ = Mn^2+ + Fe^3+ + H2O')).toEqual([1, 5, 8, 1, 5, 4])
  })
  it('rejects impossible ones', () => {
    expect(() => balance('H2 = O2')).toThrow()
  })
  it('pretty prints', () => {
    expect(pretty(parseFormula('SO4^2-'))).toBe('SO₄²⁻')
  })
})
