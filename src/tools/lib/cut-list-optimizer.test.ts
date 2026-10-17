import { describe, expect, it } from 'vitest'
import { optimize, type Part, type Stock } from './cut-list-optimizer'

const sheet: Stock = { id: 's', name: 'Ply', w: 2440, h: 1220, qty: 10 }
const part = (p: Partial<Part>): Part => ({ id: 'p', name: 'P', w: 600, h: 400, qty: 1, rotate: true, ...p })

const overlaps = (a: { x: number; y: number; w: number; h: number }, b: typeof a, k: number) =>
  a.x < b.x + b.w + k - 1e-9 && b.x < a.x + a.w + k - 1e-9 && a.y < b.y + b.h + k - 1e-9 && b.y < a.y + a.h + k - 1e-9

describe('cut list optimizer', () => {
  it('perfect tiling with zero kerf uses one sheet with no waste', () => {
    const r = optimize([sheet], [part({ w: 1220, h: 610, qty: 4 })], 0)
    expect(r.sheets.length).toBe(1)
    expect(r.waste).toBeCloseTo(0)
  })
  it('kerf prevents a perfect fit and parts never overlap (incl. kerf)', () => {
    const r = optimize([sheet], [part({ w: 1220, h: 610, qty: 4, rotate: false })], 3)
    expect(r.sheets.length).toBe(4) // 1220 + 3 + 1220 > 2440 and 610 + 3 + 610 > 1220
    const r2 = optimize([sheet], [part({ qty: 20 }), part({ id: 'q', w: 300, h: 250, qty: 15 })], 3.2)
    for (const s of r2.sheets) {
      for (let i = 0; i < s.parts.length; i++) {
        const a = s.parts[i]
        expect(a.x + a.w).toBeLessThanOrEqual(s.w + 1e-9)
        expect(a.y + a.h).toBeLessThanOrEqual(s.h + 1e-9)
        for (let j = i + 1; j < s.parts.length; j++) expect(overlaps(a, s.parts[j], 3.2)).toBe(false)
      }
    }
    expect(r2.sheets.reduce((a, s) => a + s.parts.length, 0)).toBe(35)
  })
  it('rotation and unplaceable parts', () => {
    const r = optimize([{ ...sheet, w: 1000, h: 300 }], [part({ w: 250, h: 900 })], 0)
    expect(r.sheets[0].parts[0].rotated).toBe(true)
    const u = optimize([sheet], [part({ w: 3000, h: 100 })], 0)
    expect(u.unplaced.length).toBe(1)
  })
  it('1D boards as strips (first-fit with kerf)', () => {
    const board: Stock = { id: 'b', name: '2x4', w: 2400, h: 1, qty: 10 }
    const r = optimize([board], [part({ w: 1200, h: 1, qty: 4, rotate: false })], 3)
    expect(r.sheets.length).toBe(4) // 1200+3+1200 > 2400 so one per board
    const r2 = optimize([board], [part({ w: 1198, h: 1, qty: 4, rotate: false })], 3)
    expect(r2.sheets.length).toBe(2)
  })
  it('respects stock quantity', () => {
    const r = optimize([{ ...sheet, qty: 1 }], [part({ w: 2000, h: 1000, qty: 2 })], 0)
    expect(r.sheets.length).toBe(1)
    expect(r.unplaced.length).toBe(1)
  })
})
