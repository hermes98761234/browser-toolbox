import { describe, expect, it } from 'vitest'
import { boardFeet, buildParts, cutList, DADO, TENON, totals, type Params } from './furniture-project-modeler'

const shelf: Params = { kind: 'shelf', w: 800, h: 1800, d: 300, t: 18, shelves: 4, back: true, doors: 0, legs: 60, top: 30, apron: 90, overhang: 30, joint: 'butt' }
const table: Params = { ...shelf, kind: 'table', w: 1400, h: 750, d: 800, joint: 'mortise' }

describe('furniture-project-modeler', () => {
  it('bookshelf parts and dado allowance', () => {
    const p = buildParts(shelf)
    expect(p.filter((x) => x.name === 'Shelf')).toHaveLength(4)
    expect(p.find((x) => x.name === 'Shelf')!.size[0]).toBe(800 - 36)
    const d = buildParts({ ...shelf, joint: 'dado' })
    expect(d.find((x) => x.name === 'Shelf')!.size[0]).toBe(800 - 36 + 2 * DADO(18))
  })
  it('table aprons include tenons', () => {
    const p = buildParts(table)
    expect(p.filter((x) => x.name === 'Leg')).toHaveLength(4)
    expect(p.find((x) => x.name === 'Leg')!.size[1]).toBe(720)
    expect(p.find((x) => x.name === 'Long apron')!.size[0]).toBe(1400 - 60 - 120 + 2 * TENON)
  })
  it('cut list groups identical parts', () => {
    const rows = cutList(buildParts(shelf))
    const sides = rows.find((r) => r.name === 'Side')!
    expect(sides).toMatchObject({ qty: 2, length: 1800, width: 300, thick: 18 })
    expect(rows.find((r) => r.name === 'Shelf')!.qty).toBe(4)
  })
  it('board feet and totals', () => {
    expect(boardFeet(12 * 25.4, 12 * 25.4, 25.4)).toBeCloseTo(1, 10)
    const t = totals([{ name: 'a', qty: 2, length: 1000, width: 500, thick: 18, role: 'panel' }])
    expect(t.area).toBeCloseTo(1, 10)
    expect(t.edge).toBe(2)
  })
})
