import { describe, expect, it } from 'vitest'
import { autoBalance, compute, necOptional, type Load } from './panel-load-calculator'

const L = (id: string, va: number, conn: string, extra: Partial<Load> = {}): Load => ({ id, name: id, kind: 'Other', va, qty: 1, conn, demand: 100, continuous: false, ...extra })

describe('panel load', () => {
  it('split-phase legs', () => {
    const r = compute([L('a', 1200, 'A'), L('b', 4800, 'AB')], 'split')
    expect(r.phaseVA.A).toBe(3600)
    expect(r.phaseVA.B).toBe(2400)
    expect(r.amps).toBeCloseTo(30)
    expect(r.service).toBe(60)
  })
  it('continuous 125% and motor 25%', () => {
    const r = compute([L('ev', 9600, 'AB', { continuous: true }), L('m', 2000, 'AB', { kind: 'Motor' })], 'split')
    expect(r.sizing).toBeCloseTo(12000 + 2000 + 500)
  })
  it('3-phase balanced load', () => {
    const r = compute([L('m', 36000, 'ABC')], '208')
    expect(r.phaseAmps.A).toBeCloseTo(100)
    expect(r.imbalance).toBe(0)
  })
  it('auto-balance evens out legs', () => {
    const loads = [L('1', 1500, 'A'), L('2', 1500, 'A'), L('3', 1000, 'A'), L('4', 1000, 'A')]
    const r = compute(autoBalance(loads, 'split'), 'split')
    expect(r.phaseVA.A).toBeCloseTo(2500)
    expect(r.phaseVA.B).toBeCloseTo(2500)
  })
  it('NEC optional method', () => {
    const r = necOptional([L('g', 30000, 'AB'), L('h', 10000, 'AB', { kind: 'Heating' }), L('c', 5000, 'AB', { kind: 'Cooling' })])
    expect(r.va).toBe(10000 + 8000 + 10000)
    expect(r.amps).toBeCloseTo(28000 / 240)
  })
})
