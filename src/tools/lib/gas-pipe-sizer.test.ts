import { describe, expect, it } from 'vitest'
import { capacity, GAS, qHigh, qLow, sizeSystem, table, type Pressure, type Section } from './gas-pipe-sizer'

const LOW: Pressure = { mode: 'low', dropInWc: 0.5, inletPsig: 2, dropPsi: 1 }
const near = (a: number, b: number, tol = 0.02) => expect(Math.abs(a / b - 1)).toBeLessThan(tol)

describe('gas pipe sizer', () => {
  it('reproduces published Schedule 40 natural-gas table entries (0.5 in w.c. drop)', () => {
    near(qLow(0.622, 10, 0.5, 0.6094), 172) // 1/2 in, 10 ft
    near(qLow(0.824, 10, 0.5, 0.6094), 360) // 3/4 in, 10 ft
    near(qLow(1.049, 10, 0.5, 0.6094), 678) // 1 in, 10 ft
    near(qLow(1.049, 100, 0.5, 0.6094), 195) // 1 in, 100 ft
  })
  it('propane at 11 in w.c. with 0.5 in drop, in kBtu/h', () => {
    near((capacity(0.622, 10, 'lp', LOW) * GAS.lp.btuPerCf) / 1000, 291, 0.03) // 1/2 in sch 40, 10 ft
  })
  it('high-pressure equation is self-consistent', () => {
    const q = qHigh(1.049, 50, 16.7, 15.7, 0.6094, 0.9992)
    expect(q).toBeCloseTo(2237 * 1.049 ** 2.623 * (((16.7 ** 2 - 15.7 ** 2) * 0.9992) / (0.6094 * 50)) ** 0.541, 6)
    expect(capacity(1.049, 50, 'ng', { mode: 'high', dropInWc: 0, inletPsig: 2, dropPsi: 1 })).toBeCloseTo(q, 6)
    // capacity scales as L^-0.541
    expect(qLow(1, 40, 0.5, 0.6094) / qLow(1, 10, 0.5, 0.6094)).toBeCloseTo(4 ** -0.541, 9)
  })
  it('longest-length vs branch-length sizing on a small house', () => {
    const secs: Section[] = [
      { id: 'a', name: 'Main', parent: 'meter', length: 10, appliance: '', btu: 0 },
      { id: 'b', name: 'To furnace', parent: 'a', length: 15, appliance: 'Furnace', btu: 100000 },
      { id: 'c', name: 'Main 2', parent: 'a', length: 20, appliance: '', btu: 0 },
      { id: 'd', name: 'To range', parent: 'c', length: 30, appliance: 'Range', btu: 65000 },
      { id: 'e', name: 'To dryer', parent: 'c', length: 5, appliance: 'Dryer', btu: 35000 },
    ]
    const L = sizeSystem(secs, 'ng', 'steel', LOW, 'longest')
    expect(L.longest).toBe(60)
    expect(L.rows.find((r) => r.id === 'a')!.cfh).toBeCloseTo(200)
    expect(L.rows.every((r) => r.Lsize === 60)).toBe(true)
    // 200 cfh at 60 ft: 1 in carries ~258 cfh, 3/4 ~137
    expect(L.rows.find((r) => r.id === 'a')!.size).toBe('1')
    const B = sizeSystem(secs, 'ng', 'steel', LOW, 'branch')
    expect(B.rows.find((r) => r.id === 'b')!.Lsize).toBe(25)
    expect(B.rows.find((r) => r.id === 'e')!.Lsize).toBe(35)
    expect(B.rows.find((r) => r.id === 'd')!.critical).toBe(true)
    expect(B.rows.find((r) => r.id === 'b')!.critical).toBe(false)
    // branch method never needs a larger pipe than longest-length
    B.rows.forEach((r, i) => expect(r.D).toBeLessThanOrEqual(L.rows[i].D))
  })
  it('detects loops and builds a monotone table', () => {
    const bad = sizeSystem([{ id: 'x', name: 'X', parent: 'y', length: 5, appliance: '', btu: 1 }, { id: 'y', name: 'Y', parent: 'x', length: 5, appliance: '', btu: 1 }], 'ng', 'steel', LOW, 'longest')
    expect(bad.errors.length).toBeGreaterThan(0)
    const t = table('steel', 'ng', LOW)
    for (const r of t) for (let i = 1; i < r.caps.length; i++) expect(r.caps[i]).toBeLessThan(r.caps[i - 1])
  })
})
