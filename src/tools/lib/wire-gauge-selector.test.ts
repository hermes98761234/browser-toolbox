import { describe, expect, it } from 'vitest'
import { evaluate, fillFactor, nextStd, tempFactor, type Inputs } from './wire-gauge-selector'

const base: Inputs = { amps: 16, continuous: true, material: 'cu', insulation: 90, terminal: 75, ambientC: 30, conductors: 3, volts: 120, phase: 1, lengthFt: 50, maxDrop: 3 }

describe('wire-gauge-selector', () => {
  it('looks up correction factors', () => {
    expect(tempFactor(40, 90)).toBe(0.91)
    expect(tempFactor(36, 75)).toBe(0.88)
    expect(tempFactor(58, 60)).toBe(0)
    expect(fillFactor(3)).toBe(1)
    expect(fillFactor(6)).toBe(0.8)
    expect(fillFactor(12)).toBe(0.5)
    expect(nextStd(41)).toBe(45)
  })
  it('sizes a 16 A continuous 120 V branch circuit at 12 AWG', () => {
    const r = evaluate(base)
    expect(r.design).toBe(20)
    expect(r.ocpd).toBe(20)
    expect(r.pick?.g.size).toBe('12 AWG')
    const row = r.rows.find((x) => x.g.size === '12 AWG')!
    expect(row.drop).toBeCloseTo((2 * 50 * 1.93 * 16) / 1000, 9)
  })
  it('applies ambient and fill derating', () => {
    const r = evaluate({ ...base, amps: 40, continuous: false, ambientC: 40, conductors: 6, lengthFt: 20 })
    expect(r.forAmpacity?.g.size).toBe('8 AWG')
  })
  it('upsizes for voltage drop', () => {
    const r = evaluate({ ...base, lengthFt: 150 })
    expect(r.forAmpacity?.g.size).toBe('12 AWG')
    expect(r.pick?.g.size).toBe('6 AWG') // 8 AWG gives 3.06 %, 6 AWG 1.96 %
  })
})
