import { describe, expect, it } from 'vitest'
import { breakdown, cashRound, CURRENCIES, fmtDenom, withdrawal, type CurrencySet } from './envelope-cash-planner'

const cur = (code: string) => CURRENCIES.find((c) => c.code === code)!
const asMap = (b: ReturnType<typeof breakdown>) => Object.fromEntries(b.counts.map(([d, c]) => [d.v, c]))

describe('envelope cash planner', () => {
  it('USD fewest pieces matches greedy for a canonical set', () => {
    const b = breakdown(187.41, cur('USD'))
    expect(asMap(b)).toEqual({ 100: 1, 50: 1, 20: 1, 10: 1, 5: 1, 1: 2, 0.25: 1, 0.1: 1, 0.05: 1, 0.01: 1 })
    expect(b.remainder).toBe(0)
    expect(b.pieces).toBe(11)
  })
  it('respects the largest-note limit', () => {
    const b = breakdown(120, cur('USD'), 20)
    expect(asMap(b)).toEqual({ 20: 6 })
  })
  it('beats greedy on a non-canonical set', () => {
    const odd: CurrencySet = { code: 'X', symbol: 'X', decimals: 0, denoms: [25, 20, 5].map((v) => ({ v, kind: 'note' as const, on: true })) }
    expect(asMap(breakdown(40, odd))).toEqual({ 20: 2 })
    const r = breakdown(43, odd)
    expect(r.paid).toBe(40)
    expect(r.remainder).toBe(3)
  })
  it('cash rounding for sets without small coins', () => {
    const cad = cur('CAD')
    expect(cashRound(12.37, cad)).toBeCloseTo(12.35, 10)
    expect(cashRound(12.38, cad)).toBeCloseTo(12.4, 10)
    expect(breakdown(12.37, cad).remainder).toBeCloseTo(0.02, 10)
    expect(asMap(breakdown(2000, cur('JPY')))).toEqual({ 1000: 2 })
    expect(asMap(breakdown(30, cur('UAH')))).toEqual({ 20: 1, 10: 1 })
  })
  it('combines envelopes into a withdrawal list', () => {
    const usd = cur('USD')
    const w = withdrawal([breakdown(70, usd), breakdown(25, usd)])
    expect(w.map(([d, c]) => [d.v, c])).toEqual([[50, 1], [20, 2], [5, 1]])
    expect(fmtDenom(0.25, usd)).toBe('25¢')
    expect(fmtDenom(100, usd)).toBe('$100')
  })
})
