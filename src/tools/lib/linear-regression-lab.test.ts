import { describe, expect, it } from 'vitest'
import { ANSCOMBE, DELIVERY, design, fitOls, houseSample, normInv, parseTable, predict } from './linear-regression-lab'

describe('linear regression lab', () => {
  // Montgomery, Peck & Vining, "Introduction to Linear Regression Analysis", delivery time data (Ex. 3.1)
  const f = fitOls(design(parseTable(DELIVERY), 'time', ['cases', 'distance']))
  it('matches the textbook coefficients and standard errors', () => {
    expect(f.coefs[0].b).toBeCloseTo(2.34123, 4)
    expect(f.coefs[1].b).toBeCloseTo(1.61591, 4)
    expect(f.coefs[2].b).toBeCloseTo(0.014385, 5)
    expect(f.coefs[0].se).toBeCloseTo(1.09673, 4)
    expect(f.coefs[1].se).toBeCloseTo(0.17073, 4)
    expect(f.coefs[2].se).toBeCloseTo(0.003613, 5)
    expect(f.sigma ** 2).toBeCloseTo(10.6239, 3)
    expect(f.r2).toBeCloseTo(0.9596, 4)
    expect(f.adjR2).toBeCloseTo(0.9559, 4)
    expect(f.F).toBeCloseTo(261.24, 1)
  })
  it('reproduces the influence diagnostics for observation 9', () => {
    expect(f.lev[8]).toBeCloseTo(0.49829, 4)
    expect(f.cook[8]).toBeCloseTo(3.4188, 2) // textbook 3.41835 from rounded inputs
    expect(f.coefs[1].vif).toBeCloseTo(3.118, 2)
    expect(f.lev.reduce((a, b) => a + b, 0)).toBeCloseTo(3, 8)
  })
  it('sequential ANOVA sums to the regression SS', () => {
    const ss = f.anova.filter((a) => a.term !== 'Residuals').reduce((s, a) => s + a.ss, 0)
    expect(ss).toBeCloseTo(f.ssr, 6)
    expect(f.ssr).toBeCloseTo(5550.81, 1) // textbook 5550.8166 from rounded coefficients
    expect(f.sse).toBeCloseTo(233.7317, 2)
  })
  it('gives textbook confidence and prediction intervals', () => {
    // x0 = (1, 8, 275): yhat 19.22, 95% CI [17.66, 20.78], PI [12.28, 26.16]
    const p = predict(f, [1, 8, 275])
    expect(p.yhat).toBeCloseTo(19.22, 2)
    expect(p.ci[0]).toBeCloseTo(17.66, 1)
    expect(p.ci[1]).toBeCloseTo(20.78, 1)
    expect(p.pi[0]).toBeCloseTo(12.28, 1)
    expect(p.pi[1]).toBeCloseTo(26.16, 1)
  })
  it('fits Anscombe I', () => {
    const a = fitOls(design(parseTable(ANSCOMBE), 'y', ['x']))
    expect(a.coefs[0].b).toBeCloseTo(3.0001, 3)
    expect(a.coefs[1].b).toBeCloseTo(0.5001, 3)
    expect(a.r2).toBeCloseTo(0.6665, 3)
    expect(a.coefs[1].p).toBeCloseTo(0.00217, 4)
  })
  it('dummy-codes text columns', () => {
    const d = design(parseTable(houseSample()), 'price_k', ['sqft', 'neighborhood'])
    expect(d.names).toEqual(['(Intercept)', 'sqft', 'neighborhood[Riverside]', 'neighborhood[Suburb]'])
    const h = fitOls(d)
    expect(h.coefs[1].b).toBeGreaterThan(0.1)
    expect(h.coefs[3].b).toBeLessThan(-20)
  })
  it('rejects collinear designs', () => {
    expect(() => fitOls(design(parseTable('y,a,b\n1,1,2\n2,2,4\n3,3,6\n5,4,8'), 'y', ['a', 'b']))).toThrow(/collinear/)
  })
  it('normal quantiles', () => {
    expect(normInv(0.975)).toBeCloseTo(1.959964, 5)
    expect(normInv(0.01)).toBeCloseTo(-2.326348, 5)
  })
})
