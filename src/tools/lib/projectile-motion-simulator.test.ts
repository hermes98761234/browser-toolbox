import { describe, expect, it } from 'vitest'
import { bestAngle, simulate, terminalVelocity, type Launch } from './projectile-motion-simulator'

const B: Launch = { v0: 30, angle: 40, h0: 0, mass: 0.145, diameter: 0.074, cd: 0.35, rho: 1.225, g: 9.81, wind: 0, drag: false }

describe('projectile', () => {
  it('matches vacuum closed form', () => {
    const f = simulate(B)
    const a = (40 * Math.PI) / 180
    expect(f.range).toBeCloseTo((30 * 30 * Math.sin(2 * a)) / 9.81, 3)
    expect(f.apex).toBeCloseTo((30 * Math.sin(a)) ** 2 / (2 * 9.81), 3)
    expect(f.time).toBeCloseTo((2 * 30 * Math.sin(a)) / 9.81, 3)
    expect(f.impactSpeed).toBeCloseTo(30, 3)
  })
  it('launch height in vacuum', () => {
    const f = simulate({ ...B, angle: 0, h0: 20 })
    expect(f.time).toBeCloseTo(Math.sqrt(40 / 9.81), 3)
    expect(f.range).toBeCloseTo(30 * Math.sqrt(40 / 9.81), 2)
  })
  it('drag shortens range and lowers the best angle', () => {
    const d = { ...B, drag: true }
    expect(simulate(d).range).toBeLessThan(simulate(B).range)
    expect(bestAngle(B)).toBeCloseTo(45, 1)
    expect(bestAngle({ ...d, v0: 50 })).toBeLessThan(43)
  })
  it('falls at terminal velocity', () => {
    const d = { ...B, drag: true, v0: 0, angle: -90, h0: 3000 }
    const f = simulate(d)
    expect(f.impactSpeed).toBeCloseTo(terminalVelocity(d), 1)
  })
  it('tailwind helps', () => {
    const d = { ...B, drag: true }
    expect(simulate({ ...d, wind: 5 }).range).toBeGreaterThan(simulate(d).range)
  })
})
