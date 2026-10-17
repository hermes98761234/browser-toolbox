import { describe, expect, it } from 'vitest'
import { decide, effectiveCost, nominalCost, parseTerms } from './payment-terms-calculator'

describe('parseTerms', () => {
  it('parses common notations', () => {
    expect(parseTerms('2/10 net 30')).toMatchObject({ discount: 0.02, discDays: 10, netDays: 30 })
    expect(parseTerms('2/10 n/30')).toMatchObject({ discount: 0.02, discDays: 10, netDays: 30 })
    expect(parseTerms('1.5/15, net 45')).toMatchObject({ discount: 0.015, discDays: 15, netDays: 45 })
    expect(parseTerms('2% 10 net 60')).toMatchObject({ discount: 0.02, discDays: 10, netDays: 60 })
    expect(parseTerms('Net 60')).toMatchObject({ discount: 0, netDays: 60 })
    expect(parseTerms('3/10 EOM')).toMatchObject({ discount: 0.03, discDays: 10, netDays: 30, eom: true })
    expect(parseTerms('hello')).toBeNull()
    expect(parseTerms('2/30 net 10')).toBeNull()
  })
})

describe('cost of credit', () => {
  it('textbook 2/10 net 30', () => {
    // 2/98 × 365/20 = 37.24 %; EAR = (1 + 2/98)^(365/20) − 1 = 44.59 %
    expect(nominalCost(0.02, 10, 30)).toBeCloseTo(0.37245, 4)
    expect(effectiveCost(0.02, 10, 30)).toBeCloseTo(0.44585, 4)
  })
  it('decision on an invoice', () => {
    const t = parseTerms('2/10 net 30')!
    const d = decide(t, 10000, 0.1)
    expect(d.discountAmt).toBe(200)
    expect(d.payEarly).toBe(9800)
    expect(d.interest).toBeCloseTo(9800 * 0.1 * 20 / 365, 6)
    expect(d.takeIt).toBe(true)
  })
})
