import { describe, expect, it } from 'vitest'
import { BOXES, boxFill, maxConductors } from './box-fill-calculator'

describe('box fill', () => {
  it('matches table 314.16(A) max conductor counts', () => {
    const v = (name: string) => BOXES.find((b) => b[1].startsWith(name))![2]
    expect(maxConductors(v('4 × 2⅛ in square'), '14')).toBe(15)
    expect(maxConductors(v('4 × 2⅛ in square'), '12')).toBe(13)
    expect(maxConductors(v('3 × 2 × 3½'), '14')).toBe(9)
    expect(maxConductors(v('4 × 1½ in round'), '6')).toBe(3)
  })
  it('computes a typical switch box', () => {
    // two 14/2 NM cables: 4 insulated conductors, 2 grounds, clamps, one switch
    const r = boxFill({ wires: [{ gauge: '14', qty: 4, kind: 'terminated' }], egc: true, egcGauge: '14', isoEgc: false, isoGauge: '14', clamps: true, fittings: 0, devices: [{ gangs: 1, gauge: '14' }] })
    // 4 + 1 (EGC) + 1 (clamps) + 2 (device) = 8 × 2.00
    expect(r.required).toBe(16)
  })
  it('uses the largest conductor for clamps and fittings; loops count twice; pigtails zero', () => {
    const r = boxFill({ wires: [{ gauge: '14', qty: 2, kind: 'terminated' }, { gauge: '12', qty: 1, kind: 'loop' }, { gauge: '12', qty: 3, kind: 'internal' }], egc: false, egcGauge: '14', isoEgc: false, isoGauge: '14', clamps: true, fittings: 1, devices: [] })
    expect(r.largest).toBe('12')
    expect(r.required).toBeCloseTo(2 * 2 + 2 * 2.25 + 2.25 + 2.25)
  })
})
