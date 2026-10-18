import { describe, expect, it } from 'vitest'
import { collisions, dropZ, fitsOpening, litres, outside, packContainer, toItems, TRUNKS, trunkDims, type Luggage } from './trunk-cargo-loader'

const lug = (name: string, l: number, w: number, h: number, qty = 1, soft = false): Luggage => ({ id: name, name, l, w, h, kg: 10, qty, soft, fragile: false, color: '#888' })

describe('trunk-cargo-loader', () => {
  it('dimensions and volume', () => {
    const t = TRUNKS[1]
    expect(trunkDims(t, true).L).toBe(t.L + t.folded)
    expect(litres(1000, 1000, 400)).toBe(400)
  })
  it('opening check uses the two smallest dimensions', () => {
    expect(fitsOpening({ l: 750, w: 500, h: 300, soft: false }, 1000, 450)).toBe(true)
    expect(fitsOpening({ l: 760, w: 530, h: 610, soft: false }, 1000, 450)).toBe(false)
    expect(fitsOpening({ l: 600, w: 480, h: 480, soft: true }, 1000, 450)).toBe(true) // squeezes to 432
  })
  it('soft items shrink for packing', () => {
    expect(toItems([lug('d', 600, 300, 300, 1, true)])[0]).toMatchObject({ l: 540, w: 270, h: 270, stackable: true })
  })
  it('packs suitcases into a hatchback and reports leftovers', () => {
    const t = trunkDims(TRUNKS[1], false)
    const r = packContainer({ ...t, payload: 1e6 }, toItems([lug('L', 750, 500, 300, 2), lug('C', 550, 400, 230, 2)]))
    expect(r.placed.length + r.unplaced.reduce((a, b) => a + b, 0)).toBe(4)
    expect(r.placed.length).toBeGreaterThanOrEqual(3)
    expect(collisions(r.placed)).toEqual([])
    expect(r.placed.every((p) => !outside(p, t.L, t.W, t.H))).toBe(true)
    const big = packContainer({ ...t, payload: 1e6 }, toItems([lug('X', 1300, 400, 300)]))
    expect(big.placed.length).toBe(0)
  })
  it('collisions and gravity drop', () => {
    const a = { item: 0, x: 0, y: 0, z: 0, l: 100, w: 100, h: 100 }
    const b = { item: 0, x: 50, y: 50, z: 0, l: 100, w: 100, h: 50 }
    expect(collisions([a, b])).toEqual([[0, 1]])
    expect(dropZ({ ...b, z: 500 }, [a])).toBe(100)
    expect(dropZ({ ...b, x: 200, z: 500 }, [a])).toBe(0)
  })
})
