import { describe, expect, it } from 'vitest'
import { analyze, buildFormula, splitStarter, waterForHydration } from './sourdough-hydration-calculator'

describe('sourdough-hydration-calculator', () => {
  it('splits starter', () => {
    expect(splitStarter(100, 100)).toEqual({ flour: 50, water: 50 })
    const s = splitStarter(150, 50)
    expect(s.flour).toBeCloseTo(100)
    expect(s.water).toBeCloseTo(50)
  })
  it('builds a formula that adds up', () => {
    const f = buildFormula({ dough: 1000, hydration: 75, salt: 2, starter: 20, starterHyd: 100, inclusions: 0, flours: [{ name: 'Bread', pct: 80 }, { name: 'Whole wheat', pct: 20 }] })
    expect(f.totalFlour).toBeCloseTo(1000 / 1.77, 6)
    expect(f.dough).toBeCloseTo(1000, 6)
    expect(f.starter).toBeCloseTo(0.2 * f.totalFlour)
    expect(f.addFlour + f.starterFlour).toBeCloseTo(f.totalFlour)
    expect(f.addWater + f.starterWater).toBeCloseTo(0.75 * f.totalFlour)
    expect(f.flours[1].g).toBeCloseTo(0.2 * f.addFlour)
    expect(f.prefermented).toBeCloseTo(0.1)
    expect(f.valid).toBe(true)
    expect(buildFormula({ dough: 1000, hydration: 40, salt: 2, starter: 150, starterHyd: 100, inclusions: 0, flours: [] }).valid).toBe(false)
  })
  it('analyses a recipe', () => {
    const a = analyze({ flour: 450, water: 325, starter: 100, starterHyd: 100, salt: 10, otherLiquid: 0 })
    expect(a.totalFlour).toBe(500)
    expect(a.hydration).toBeCloseTo(75)
    expect(a.naiveHydration).toBeCloseTo(72.22, 2)
    expect(a.saltPct).toBeCloseTo(2)
    expect(a.starterPct).toBeCloseTo(20)
    expect(waterForHydration({ flour: 450, water: 325, starter: 100, starterHyd: 100, salt: 10, otherLiquid: 0 }, 80)).toBeCloseTo(25)
  })
})
