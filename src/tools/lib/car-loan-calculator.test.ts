import { describe, expect, it } from 'vitest'
import { amountFinanced, balanceAfter, carValue, leasePayment, mfToApr, payment } from './car-loan-calculator'

describe('car loan', () => {
  it('annuity reference: $30,000 at 6% for 60 months = $579.98', () => {
    expect(payment(30000, 6, 60)).toBeCloseTo(579.98, 2)
    expect(payment(12000, 0, 48)).toBe(250)
  })
  it('balance reaches zero at the end', () => {
    expect(balanceAfter(30000, 6, 60, 60)).toBeCloseTo(0, 4)
    expect(balanceAfter(30000, 6, 60, 0)).toBeCloseTo(30000)
  })
  it('amount financed with trade-in tax credit', () => {
    const r = amountFinanced({ price: 35000, taxPct: 7, fees: 500, down: 3000, tradeIn: 8000, tradeOwed: 2000, rebate: 1000, taxCredit: true })
    expect(r.tax).toBeCloseTo(1890)
    expect(r.financed).toBeCloseTo(35000 + 1890 + 500 - 3000 - 1000 - 6000)
  })
  it('lease payment reference', () => {
    // cap 30000, residual 60% of 32000 = 19200, MF .0025, 36 mo
    const l = leasePayment({ capCost: 30000, residualPct: 60, msrp: 32000, moneyFactor: 0.0025, months: 36, taxPct: 0, acqFee: 0, capReduction: 0, dispositionFee: 0 })
    expect(l.depreciation).toBeCloseTo(300)
    expect(l.rent).toBeCloseTo(123)
    expect(l.monthly).toBeCloseTo(423)
    expect(mfToApr(0.0025)).toBeCloseTo(6)
  })
  it('depreciation curve', () => {
    expect(carValue(30000, 12)).toBeCloseTo(24000)
    expect(carValue(30000, 24)).toBeCloseTo(20400)
  })
})
