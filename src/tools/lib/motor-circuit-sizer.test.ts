import { describe, expect, it } from 'vitest'
import { egc, feeder, flc, hpValue, sizeMotor, stdDown, stdUp, type MotorInputs } from './motor-circuit-sizer'

const base: MotorInputs = { phase: 3, volts: 460, hp: '10', type: 'sq', nameplate: 13, sf115: true, rise40: false, material: 'cu', insulation: 75, termination: 75, ambient: 30, ccc: 3, lengthFt: 100 }

describe('NEC table lookups', () => {
  it('Table 430.250 and 430.248 values', () => {
    expect(flc(3, '10', 460)).toBe(14)
    expect(flc(3, '25', 230)).toBe(68)
    expect(flc(3, '100', 208)).toBe(273)
    expect(flc(3, '3', 115)).toBeNaN()
    expect(flc(1, '1', 115)).toBe(16)
    expect(flc(1, '5', 230)).toBe(28)
  })
  it('standard sizes and grounding', () => {
    expect(stdUp(24.5)).toBe(25)
    expect(stdUp(36)).toBe(40)
    expect(stdDown(212)).toBe(200)
    expect(egc(35, 'cu')).toBe('10 AWG')
    expect(egc(175, 'cu')).toBe('6 AWG')
    expect(egc(15, 'al')).toBe('12 AWG')
  })
  it('parses horsepower strings', () => {
    expect(hpValue('7-1/2')).toBe(7.5)
    expect(hpValue('1/3')).toBeCloseTo(1 / 3)
  })
})

describe('worked examples', () => {
  it('10 hp, 460 V, 3-phase squirrel cage', () => {
    const r = sizeMotor(base)
    expect(r.flc).toBe(14)
    expect(r.condReq).toBe(17.5)
    expect(r.cond.gauge?.size).toBe('14 AWG')
    const itb = r.ocpd.find((o) => o.d === 'itb')!
    expect(itb.calc).toBe(35)
    expect(itb.std).toBe(35)
    expect(r.ocpd.find((o) => o.d === 'td')!.std).toBe(25) // 24.5 A → 25 A
    expect(r.ocpd.find((o) => o.d === 'ntd')!.std).toBe(45) // 42 A → 45 A
    expect(r.overload.amps).toBeCloseTo(16.25) // 125 % of 13 A nameplate
    expect(r.disconnect).toBeCloseTo(16.1)
  })
  it('25 hp, 230 V, 3-phase: 4 AWG Cu at 75 °C and 175 A breaker', () => {
    const r = sizeMotor({ ...base, volts: 230, hp: '25', nameplate: 64, sf115: false })
    expect(r.condReq).toBe(85)
    expect(r.cond.gauge?.size).toBe('4 AWG')
    expect(r.ocpd.find((o) => o.d === 'itb')!.std).toBe(175)
    expect(r.overload.amps).toBeCloseTo(73.6) // 115 % of 64 A
    expect(r.egc).toBe('6 AWG')
  })
  it('60 °C terminations push the size up', () => {
    const r = sizeMotor({ ...base, volts: 230, hp: '25', termination: 60 })
    expect(r.cond.gauge?.size).toBe('3 AWG')
  })
  it('Design B energy efficient instantaneous trip is 1100 %', () => {
    const r = sizeMotor({ ...base, type: 'designB' })
    expect(r.ocpd.find((o) => o.d === 'inst')!.calc).toBe(154)
  })
  it('feeder for three motors (430.24 / 430.62)', () => {
    // 460 V: 10 hp (14 A), 15 hp (21 A), 25 hp (34 A); ITB branch protection 35, 60, 90 A
    const f = feeder([14, 21, 34], [35, 60, 90])
    expect(f.ampacity).toBeCloseTo(14 + 21 + 34 * 1.25)
    expect(f.ocpdMax).toBe(90 + 14 + 21)
    expect(f.ocpdStd).toBe(125)
  })
})
