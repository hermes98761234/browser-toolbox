import { describe, expect, it } from 'vitest'
import { optimize, type Placed } from './sheet-cut-planner'

const overlap = (a: Placed, b: Placed, k: number) => a.x < b.x + b.w + k - 1e-9 && b.x < a.x + a.w + k - 1e-9 && a.y < b.y + b.h + k - 1e-9 && b.y < a.y + a.h + k - 1e-9

describe('sheet cut planner', () => {
  it('fits 4 quarters exactly with zero kerf', () => {
    const p = optimize([{ label: 'Q', w: 500, h: 500, qty: 4, rotate: true }], { sheetW: 1000, sheetH: 1000, kerf: 0, trim: 0, rotate: true }, 5)
    expect(p.sheets).toHaveLength(1)
    expect(p.waste).toBeCloseTo(0)
  })
  it('kerf forces one part per sheet when parts fill the sheet exactly', () => {
    const p = optimize([{ label: 'Q', w: 500, h: 500, qty: 4, rotate: true }], { sheetW: 1000, sheetH: 1000, kerf: 3, trim: 0, rotate: true }, 5)
    expect(p.sheets.length).toBe(4) // 500 + 3 + 500 > 1000
  })
  it('respects grain lock, bounds and kerf spacing', () => {
    const o = { sheetW: 2440, sheetH: 1220, kerf: 3.2, trim: 10, rotate: true }
    const parts = [
      { label: 'Side', w: 720, h: 560, qty: 4, rotate: true },
      { label: 'Shelf', w: 762, h: 540, qty: 4, rotate: false },
      { label: 'Rail', w: 764, h: 100, qty: 6, rotate: true },
    ]
    const p = optimize(parts, o, 10)
    expect(p.unplaced).toHaveLength(0)
    const all = p.sheets.flatMap((s) => s.placed)
    expect(all).toHaveLength(14)
    for (const s of p.sheets) {
      for (const a of s.placed) {
        expect(a.x).toBeGreaterThanOrEqual(10)
        expect(a.x + a.w).toBeLessThanOrEqual(2430 + 1e-6)
        expect(a.y + a.h).toBeLessThanOrEqual(1210 + 1e-6)
        if (a.label === 'Shelf') expect(a.rotated).toBe(false)
        for (const b of s.placed) if (a !== b) expect(overlap(a, b, 3.2)).toBe(false)
      }
    }
  })
  it('reports parts that are too big', () => {
    const p = optimize([{ label: 'Huge', w: 3000, h: 100, qty: 1, rotate: true }], { sheetW: 2440, sheetH: 1220, kerf: 3, trim: 0, rotate: true }, 1)
    expect(p.unplaced).toHaveLength(1)
  })
})
