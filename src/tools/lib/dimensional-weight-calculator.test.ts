import { describe, expect, it } from 'vitest'
import { breakEvenSide, CARRIERS, parseBatch, rate, toMetricDivisor } from './dimensional-weight-calculator'

const c = (id: string) => CARRIERS.find((x) => x.id === id)!

describe('dimensional-weight-calculator', () => {
  it('matches the UPS worked example', () => {
    // 12×12×12 in box, 10 lb: 1728/139 = 12.43 → 13 lb billed
    const r = rate(c('us139'), [12 * 2.54, 12 * 2.54, 12 * 2.54], 10 * 0.45359237)
    expect(r.dims).toEqual([12, 12, 12])
    expect(r.dim).toBeCloseTo(12.43, 2)
    expect(r.billed).toBe(13)
    expect(r.dimWins).toBe(true)
  })
  it('applies USPS 1 ft³ threshold', () => {
    const small = rate(c('usps'), [30.48, 30.48, 30.48], 1)
    expect(small.applies).toBe(false)
    expect(small.billed).toBe(3) // 2.2 lb → 3
    expect(rate(c('usps'), [33, 33, 33], 1).applies).toBe(true)
  })
  it('metric rounding and helpers', () => {
    const r = rate(c('exp5000'), [40, 30, 20], 3.2)
    expect(r.dim).toBeCloseTo(4.8)
    expect(r.billed).toBe(5)
    expect(rate(c('exp5000'), [10, 10, 10], 1.01).billed).toBe(1.5)
    expect(toMetricDivisor(139)).toBeCloseTo(5021.6, 0)
    expect(breakEvenSide(5, 5000)).toBeCloseTo(29.24, 2)
    expect(parseBatch('Mug, 20, 15, 15, 0.8, 3\nbad line\nLamp;50;30;30;2.5')).toEqual([
      { name: 'Mug', l: 20, w: 15, h: 15, wt: 0.8, qty: 3 },
      { name: 'Lamp', l: 50, w: 30, h: 30, wt: 2.5, qty: 1 },
    ])
  })
})
