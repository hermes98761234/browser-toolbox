import { describe, expect, it } from 'vitest'
import { angles, contactRatio, gearProfile, geom, minTeeth, solveTrain, type GearIn } from './gear-train-designer'

describe('gear train designer', () => {
  it('computes standard gear geometry', () => {
    const g = geom(20, 2, 20)
    expect(g.r).toBe(20)
    expect(g.ra).toBe(22)
    expect(g.rf).toBe(17.5)
    expect(g.rb).toBeCloseTo(18.7939, 4)
    expect(minTeeth(20)).toBe(18)
    expect(minTeeth(14.5)).toBe(32)
  })
  it('matches the textbook contact ratio', () => {
    expect(contactRatio(20, 40, 2, 20)).toBeCloseTo(1.635, 2)
  })
  it('builds a closed outline within tip and root radii', () => {
    const p = gearProfile(20, 2, 20)
    const r = p.map(([x, y]) => Math.hypot(x, y))
    expect(Math.max(...r)).toBeCloseTo(22, 6)
    expect(Math.min(...r)).toBeCloseTo(17.5, 6)
    // tooth thickness at the pitch circle ≈ half the circular pitch
    const near = p.filter(([x, y]) => Math.abs(Math.hypot(x, y) - 20) < 0.15 && Math.abs(Math.atan2(y, x)) < 0.2)
    const span = Math.max(...near.map(([x, y]) => Math.atan2(y, x))) - Math.min(...near.map(([x, y]) => Math.atan2(y, x)))
    expect(span * 20).toBeCloseTo(Math.PI, 0)
  })
  it('solves a two-stage compound reduction', () => {
    const gears: GearIn[] = [
      { z: 12, m: 1, link: 'mesh', angle: 0 },
      { z: 48, m: 1, link: 'mesh', angle: 0 },
      { z: 15, m: 1.5, link: 'shaft', angle: 0 },
      { z: 45, m: 1.5, link: 'mesh', angle: 90 },
    ]
    const t = solveTrain(gears, 1200, 1, 1, 20)
    expect(t[1].rpm).toBe(-300)
    expect(t[3].rpm).toBe(100)
    expect(t[3].ratio).toBe(12)
    expect(t[3].torque).toBeCloseTo(12, 9)
    expect(t[1].center).toBe(30)
    expect(t[3].center).toBe(45)
    expect(t[3].x).toBeCloseTo(30, 9)
    expect(t[3].y).toBeCloseTo(45, 9)
    const a0 = angles(gears, t, 0), a1 = angles(gears, t, 0.1)
    expect(a1[1] - a0[1]).toBeCloseTo(-0.1 * 12 / 48, 9)
    expect(a1[3] - a0[3]).toBeCloseTo((0.1 * 12 / 48) * 15 / 45, 9)
  })
})
