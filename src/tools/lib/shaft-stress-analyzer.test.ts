import { describe, expect, it } from 'vitest'
import { checkShaft, enduranceLimit, goodman, internal, reactions, sectionStress, shoulders } from './shaft-stress-analyzer'

const L = (x: number, fy = 0, fz = 0, torque = 0) => ({ x, fy, fz, torque, label: '' })

describe('shaft stress analyzer', () => {
  it('computes reactions and the mid-span moment PL/4', () => {
    const loads = [L(150, -1000)]
    const r = reactions(loads, 0, 300)
    expect(r.ay).toBeCloseTo(500)
    expect(r.by).toBeCloseTo(500)
    expect(Math.abs(internal(loads, 0, 300, 150).my)).toBeCloseTo(75000)
  })
  it('handles an overhung load', () => {
    const r = reactions([L(400, -1000)], 0, 300)
    expect(r.by).toBeCloseTo(4000 / 3)
    expect(r.ay).toBeCloseTo(-1000 / 3)
    expect(Math.abs(internal([L(400, -1000)], 0, 300, 300).my)).toBeCloseTo(100000, 3)
  })
  it('combines planes and carries torque between gears', () => {
    const loads = [L(100, -600, 800, 120), L(250, 0, 0, -120)]
    expect(internal(loads, 0, 300, 50).t).toBe(0)
    expect(internal(loads, 0, 300, 200).t).toBeCloseTo(120000)
    expect(internal(loads, 0, 300, 280).t).toBeCloseTo(0)
  })
  it('section stresses and von Mises', () => {
    const s = sectionStress(30, 75000, 100000)
    expect(s.sigma).toBeCloseTo(28.294, 2)
    expect(s.tau).toBeCloseTo(18.863, 2)
    expect(s.vm).toBeCloseTo(Math.sqrt(28.294 ** 2 + 3 * 18.863 ** 2), 1)
  })
  it('Marin factors match Shigley', () => {
    // Shigley ex. 6-8 style: Sut 690 machined ka = 4.51·690^-0.265 = 0.796; d=32 kb = 0.856
    const e = enduranceLimit(690, 32, 'machined', 0.5)
    expect(e.ka).toBeCloseTo(0.796, 2)
    expect(e.kb).toBeCloseTo(0.856, 2)
    expect(e.sePrime).toBe(345)
  })
  it('DE-Goodman matches a hand calculation', () => {
    // 1/n = 16/(π·40³)·(2·1.95·142000/205 + √3·1.66·124000/690) = 0.2561 → n = 3.905
    expect(goodman(40, 142000, 124000, 1.95, 1.66, 205, 690)).toBeCloseTo(3.905, 2)
  })
  it('finds shoulders and the critical location', () => {
    const segs = [{ len: 50, d: 30 }, { len: 200, d: 40 }, { len: 50, d: 30 }]
    expect(shoulders(segs).map((s) => s.x)).toEqual([50, 250])
    const r = checkShaft(segs, [L(150, -5000)], 25, 275, { name: '', sut: 630, sy: 530 }, 'machined', 0.99, 1.7, 1.5)
    expect(r.critical).not.toBeNull()
    expect(r.critical!.nf).toBeGreaterThan(0)
  })
})
