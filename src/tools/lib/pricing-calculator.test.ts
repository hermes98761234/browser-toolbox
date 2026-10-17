import { describe, expect, it } from 'vitest'
import { breakdown, breakEvenUnits, marginToMarkup, markupToMargin, priceForMargin, priceForMarkup, pricePercentile, roundPrice } from './pricing-calculator'

const none = { pct: 0, fixed: 0 }

describe('pricing-calculator', () => {
  it('converts markup and margin', () => {
    expect(markupToMargin(1)).toBe(0.5)
    expect(marginToMarkup(0.5)).toBe(1)
    expect(marginToMarkup(0.2)).toBeCloseTo(0.25)
  })
  it('prices for margin and markup', () => {
    expect(priceForMargin(60, 0.4, none)).toBeCloseTo(100)
    expect(priceForMarkup(60, 0.5, none)).toBeCloseTo(90)
    // 3% + 0.30 card fee, 40% margin: (60 + .3) / (1 - .03 - .4)
    const p = priceForMargin(60, 0.4, { pct: 0.03, fixed: 0.3 })
    expect(p).toBeCloseTo(105.789, 3)
    expect(breakdown(p, 60, { pct: 0.03, fixed: 0.3 }).margin).toBeCloseTo(0.4)
    expect(priceForMargin(10, 0.99, { pct: 0.05, fixed: 0 })).toBeNaN()
  })
  it('rounds to charm prices without undercutting', () => {
    expect(roundPrice(23.41, '99')).toBe(23.99)
    expect(roundPrice(23.995, '99')).toBe(24.99)
    expect(roundPrice(23.2, '49')).toBe(23.49)
    expect(roundPrice(23.6, '49')).toBe(23.99)
    expect(roundPrice(23.01, 'whole')).toBe(24)
    expect(roundPrice(41, '5')).toBe(45)
    expect(roundPrice(12.341, 'cent')).toBe(12.35)
  })
  it('break-even and percentile', () => {
    expect(breakEvenUnits(1000, 25)).toBe(40)
    expect(breakEvenUnits(1000, 0)).toBe(Infinity)
    expect(pricePercentile(50, [40, 45, 55, 60])).toBe(0.5)
  })
})
