import { describe, expect, it } from 'vitest'
import { bricksPerM2, estimate, wallAreas, type Options, type Wall } from './brick-wall-estimator'

const opts: Options = { brick: { l: 215, w: 102.5, h: 65 }, joint: 10, type: 'half', waste: 5, mortarWaste: 0, cement: 1, sand: 4, tiesPerM2: 2.5, bagKg: 25 }
const wall: Wall = { id: 'w', name: 'Front', length: 10, height: 2.5, count: 1, openings: [{ id: 'o', label: 'Window', w: 1.2, h: 1.2, count: 2 }] }

describe('brick-wall-estimator', () => {
  it('uses the classic 60 bricks per m² for UK bricks', () => {
    expect(bricksPerM2(215, 65, 10)).toBeCloseTo(59.259, 3)
  })
  it('subtracts openings', () => {
    const a = wallAreas(wall)
    expect(a.gross).toBe(25)
    expect(a.openings).toBeCloseTo(2.88, 9)
    expect(a.net).toBeCloseTo(22.12, 9)
  })
  it('estimates bricks, mortar and materials', () => {
    const e = estimate([wall], opts)
    expect(e.bricks).toBeCloseTo(22.12 * 59.259259, 3)
    expect(e.bricksOrder).toBe(Math.ceil(e.bricks * 1.05))
    const perM2Mortar = 0.1025 - 59.259259 * 0.215 * 0.1025 * 0.065
    expect(e.mortarWet).toBeCloseTo(22.12 * perM2Mortar, 6)
    expect(e.cementKg).toBeCloseTo((e.mortarWet * 1.33 * 1440) / 5, 6)
    expect(e.lintels[0].length).toBe(1.5)
    expect(e.ties).toBe(0)
  })
  it('doubles bricks and adds ties for cavity walls', () => {
    const e = estimate([wall], { ...opts, type: 'cavity' })
    expect(e.perM2).toBeCloseTo(118.52, 2)
    expect(e.ties).toBe(Math.ceil(22.12 * 2.5) + 2 * 2 * 4)
  })
})
