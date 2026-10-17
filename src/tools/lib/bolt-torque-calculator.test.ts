import { describe, expect, it } from 'vitest'
import { equivalentK, GRADES, stressArea, THREADS, torqueLong, torqueShort } from './bolt-torque-calculator'

const th = (id: string) => THREADS.find((t) => t.id === id)!

describe('bolt torque', () => {
  it('stress areas match ISO 898-1 / ASME B1.1 tables', () => {
    expect(stressArea(th('M10×1.5'))).toBeCloseTo(58.0, 0)
    expect(stressArea(th('M12×1.75'))).toBeCloseTo(84.3, 0)
    expect(stressArea(th('M24×3'))).toBeCloseTo(353, 0)
    expect(stressArea(th('1/2-13 UNC')) / 645.16).toBeCloseTo(0.1419, 3)
    expect(stressArea(th('1/4-28 UNF')) / 645.16).toBeCloseTo(0.0364, 3)
  })
  it('short-form torque', () => {
    const F = 0.75 * 580 * stressArea(th('M10×1.5'))
    expect(F).toBeCloseTo(25230, -2)
    expect(torqueShort(0.2, F, 10)).toBeCloseTo(50.5, 0)
  })
  it('long-form torque splits and is consistent with K', () => {
    const t = th('M10×1.5')
    const r = torqueLong(t, 25000, 0.14, 0.14)
    expect(r.pitch + r.thread + r.head).toBeCloseTo(r.total)
    expect(r.total).toBeGreaterThan(44)
    expect(r.total).toBeLessThan(52)
    expect(equivalentK(t, 0.14, 0.14)).toBeCloseTo(r.total / 25000 / 0.01, 3)
  })
  it('grade proof strengths', () => {
    expect(GRADES.find((g) => g.id === '8.8')!.proof(20)).toBe(600)
    expect(GRADES.find((g) => g.id === 'SAE5')!.proof(12.7)).toBeCloseTo(586, 0)
  })
})
