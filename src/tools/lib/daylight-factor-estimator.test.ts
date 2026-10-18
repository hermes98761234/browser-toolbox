import { describe, expect, it } from 'vitest'
import { averageDF, depthCriterion, ffPerp, grid, irc, irCoefC, skyComponent, stats, surfaces, type Room } from './daylight-factor-estimator'

const room: Room = { W: 4, D: 5, H: 2.7, wins: [{ w: 2, h: 1.5, sill: 0.9, x: 1 }], rFloor: 0.3, rWall: 0.6, rCeil: 0.8, T: 0.7, frame: 0.8, M: 0.92, obst: 0, wp: 0.85 }

describe('daylight factor estimator', () => {
  it('surface areas and area-weighted reflectance', () => {
    const s = surfaces(room)
    expect(s.total).toBeCloseTo(2 * 20 + 2 * 9 * 2.7)
    expect(s.gross).toBeCloseTo(3)
    expect(s.glazedNet).toBeCloseTo(2.4)
    expect(s.Ravg).toBeCloseTo((20 * 0.3 + 20 * 0.8 + (48.6 - 3) * 0.6 + 3 * 0.1) / 88.6, 10)
  })
  it('BRE average DF matches a hand calculation', () => {
    const s = surfaces(room)
    const hand = (0.7 * 2.4 * 90 * 0.92) / (88.6 * (1 - s.Ravg ** 2))
    expect(averageDF(room)).toBeCloseTo(hand, 10)
    expect(averageDF(room)).toBeGreaterThan(1.5)
    expect(averageDF(room)).toBeLessThan(4)
    // an obstruction of 30° reduces θ from 90 to 60
    expect(averageDF({ ...room, obst: 30 })).toBeCloseTo((averageDF(room) * 60) / 90, 10)
  })
  it('perpendicular form factor limits', () => {
    expect(ffPerp(1e6, 1e6, 1)).toBeCloseTo(0.25, 4)
    expect(ffPerp(0, 1, 1)).toBe(0)
  })
  it('numeric sky component matches the analytic form factor for a uniform sky', () => {
    const r: Room = { ...room, wins: [{ w: 2, h: 1.2, sill: 0.85, x: 0 }] }
    const sc = skyComponent(r, 0, 1.5, 60, 'uniform')
    expect(sc).toBeCloseTo(ffPerp(2, 1.2, 1.5) * 100, 1)
  })
  it('sky component falls with distance and obstruction', () => {
    const near = skyComponent(room, 2, 1), far = skyComponent(room, 2, 4)
    expect(near).toBeGreaterThan(far)
    expect(skyComponent({ ...room, obst: 40 }, 2, 4)).toBeLessThan(far)
  })
  it('IRC and grid statistics are plausible', () => {
    expect(irCoefC(0)).toBe(39)
    expect(irCoefC(25)).toBeCloseTo(28)
    const ic = irc(room)
    expect(ic).toBeGreaterThan(0.2)
    expect(ic).toBeLessThan(1.5)
    const g = grid(room, 12, 10)
    const st = stats(g, room)
    expect(st.uniformity).toBeGreaterThan(0)
    expect(st.uniformity).toBeLessThan(1)
    // the grid mean should be in the same ballpark as the BRE average formula
    expect(st.mean / averageDF(room)).toBeGreaterThan(0.5)
    expect(st.mean / averageDF(room)).toBeLessThan(2)
  })
  it('room depth criterion', () => {
    expect(depthCriterion(room).ok).toBe(true)
    expect(depthCriterion({ ...room, D: 12 }).ok).toBe(false)
  })
})
