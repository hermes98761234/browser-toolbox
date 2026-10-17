import { describe, expect, it } from 'vitest'
import { axleLoads, bestShift, cargoCg, lever, type Vehicle } from './axle-load-calculator'

const rigid: Vehicle = { kind: 'rigid', wb: 5, fifth: 0, kp: 0, deck: 1, deckLen: 7, tare: [4000, 3000], limits: [7100, 11500], gvw: 18000 }
const semi: Vehicle = { kind: 'semi', wb: 4, fifth: 3.5, kp: 8, deck: -1, deckLen: 13.6, tare: [5000, 3000, 6000], limits: [7500, 11500, 24000], gvw: 40000 }

describe('axle-load-calculator', () => {
  it('lever arm split', () => {
    expect(lever(1000, 2, 5)).toEqual([600, 400])
    expect(lever(1000, 6, 5)).toEqual([-200, 1200]) // behind the rear axle lifts the front
  })
  it('rigid truck', () => {
    // 6000 kg centred 4 m behind steer axle (deck 1 + at 2 + len 2/2)
    const l = axleLoads(rigid, [{ name: 'a', kg: 6000, at: 2, len: 2 }])
    expect(l[0]).toBeCloseTo(4000 + 6000 * (1 / 5), 9)
    expect(l[1]).toBeCloseTo(3000 + 6000 * (4 / 5), 9)
    expect(l[0] + l[1]).toBeCloseTo(13000, 9)
  })
  it('semi-trailer kingpin transfer', () => {
    // 20000 kg with CG 4 m behind kingpin: trailer axles 10000, kingpin 10000 → steer 10000·0.5/4, drive 10000·3.5/4
    const l = axleLoads(semi, [{ name: 'a', kg: 20000, at: 3, len: 4 }])
    expect(l[2]).toBeCloseTo(16000, 9)
    expect(l[0]).toBeCloseTo(5000 + 1250, 9)
    expect(l[1]).toBeCloseTo(3000 + 8750, 9)
  })
  it('cg and best shift', () => {
    expect(cargoCg([{ name: 'a', kg: 1000, at: 0, len: 2 }, { name: 'b', kg: 1000, at: 4, len: 2 }])).toBe(3)
    // a heavy load at the very front overloads the steer axle; the optimiser moves it back
    const d = bestShift(rigid, [{ name: 'a', kg: 9000, at: 0, len: 1 }])
    expect(d).toBeGreaterThan(0)
    const l = axleLoads(rigid, [{ name: 'a', kg: 9000, at: d, len: 1 }])
    expect(Math.max(l[0] / 7100, l[1] / 11500)).toBeLessThan(1)
  })
})
