import { describe, expect, it } from 'vitest'
import { body, checkSetup, screenSize, targets, type Opts } from './desk-ergonomics-calculator'

const O: Opts = { stature: 175, shoe: 2.5, keyboard: 2.5, diagonal: 27, aspect: [16, 9], bifocal: false, laptopOnly: false }

describe('desk ergonomics', () => {
  it('scales body dimensions with stature', () => {
    const b = body(175)
    expect(b.popliteal).toBeCloseTo(43.4, 1)
    expect(b.elbowStanding).toBeCloseTo(110.25, 2)
    expect(body(160).eyeSeated / body(160).stature).toBeCloseTo(0.447, 5)
  })
  it('computes screen size from diagonal', () => {
    const s = screenSize(27, [16, 9])
    expect(s.w).toBeCloseTo(59.77, 1)
    expect(s.h).toBeCloseTo(33.62, 1)
  })
  it('gives plausible targets for a 175 cm adult', () => {
    const t = targets(O)
    expect(t.seatIdeal).toBeCloseTo(45.9, 1)
    expect(t.deskSit).toBeGreaterThan(64)
    expect(t.deskSit).toBeLessThan(72)
    expect(t.deskStand).toBeCloseTo(110.25, 1)
    expect(t.monitorTopSit).toBeCloseTo(45.9 + 78.225 - 3, 1)
    expect(t.distanceIdeal).toBeGreaterThan(55)
    expect(t.distanceIdeal).toBeLessThan(75)
    expect(t.gazeDown).toBeGreaterThan(5)
    expect(targets({ ...O, bifocal: true }).monitorTopSit).toBeLessThan(t.monitorTopSit)
  })
  it('suggests a footrest for a standard 74 cm desk', () => {
    const t = targets(O)
    const f = checkSetup(t, O, 74, 46, 120)
    expect(f.seatForDesk).toBeCloseTo(74 + 2.5 - 23.975, 2)
    expect(f.footrest).toBeCloseTo(f.seatForDesk - t.seatIdeal, 5)
    expect(f.checks[0].ok).toBe(false)
    const g = checkSetup(t, O, t.deskSit, t.seatIdeal, t.monitorTopSit)
    expect(g.checks.every((c) => c.ok)).toBe(true)
  })
})
