import { describe, expect, it } from 'vitest'
import { adjustment, conduitArea, fill, fillLimit, maxSameSize, pack, smallestSize, WIRES, type Conductor } from './conduit-fill-calculator'

const w = (size: string, qty: number, type = 'THHN / THWN-2'): Conductor => ({ id: size + qty, type, size, qty, od: 0, ccc: true })

describe('conduit-fill-calculator', () => {
  it('matches NEC Table 4 areas', () => {
    expect(conduitArea('EMT', '1/2')).toBe(0.304)
    expect(conduitArea('EMT', '3/4')).toBe(0.533)
    expect(conduitArea('RMC', '2')).toBe(3.408)
    expect(conduitArea('PVC Sch 80', '1/2')).toBe(0.217)
    expect(conduitArea('PVC Sch 40', '1')).toBe(0.832)
  })
  it('applies Table 1 limits', () => {
    expect([fillLimit(1), fillLimit(2), fillLimit(3), fillLimit(9, true)]).toEqual([0.53, 0.31, 0.4, 0.6])
    const r = fill([w('12', 4)], 'EMT', '1/2')
    expect(r.fill).toBeCloseTo(0.0532 / 0.304, 6)
    expect(r.ok).toBe(true)
    expect(fill([w('12', 10)], 'EMT', '1/2').ok).toBe(false)
  })
  it('reproduces Annex C maximum counts', () => {
    expect(maxSameSize('EMT', '1/2', WIRES['THHN / THWN-2'][1])).toBe(9)
    expect(maxSameSize('EMT', '1/2', WIRES['THHN / THWN-2'][0])).toBe(12)
    expect(maxSameSize('EMT', '3/4', WIRES['THHN / THWN-2'][1])).toBe(16)
    expect(smallestSize([w('3/0', 3), w('6', 1)], 'EMT')).toBe('2')
  })
  it('derates and packs', () => {
    expect([adjustment(3), adjustment(4), adjustment(9), adjustment(12), adjustment(50)]).toEqual([1, 0.8, 0.7, 0.5, 0.35])
    const p = pack(1, [0.3, 0.3, 0.3])
    expect(p.every((c) => !c.bad && Math.hypot(c.x, c.y) + c.r <= 1 + 1e-9)).toBe(true)
    expect(pack(1, [0.6, 0.6]).some((c) => c.bad)).toBe(true)
  })
})
