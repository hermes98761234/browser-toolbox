import { describe, expect, it } from 'vitest'
import { BREEDS, cutList, design, plyArea, type Options } from './dog-house-builder'

const O: Options = { roof: 'gable', pitch: 30, overhang: 2, ply: 0.75, raise: 4, climate: 'mild', porch: false }
const lab = BREEDS.find((b) => b.name.startsWith('Labrador'))!.dog

describe('dog house rules', () => {
  it('Labrador mild climate', () => {
    const d = design(lab, O)
    expect(d.inD).toBe(37.5) // 30 × 1.25
    expect(d.inW).toBe(37.5)
    expect(d.inH).toBe(36) // 30 × 1.2
    expect(d.doorH).toBe(18) // max(0.75 × 23 = 17.25, 0.6 × 30 = 18)
    expect(d.doorW).toBe(12.5) // 10 × 1.25
    expect(d.outW).toBe(39)
    expect(d.rise).toBeCloseTo(19.5 * Math.tan(Math.PI / 6), 6)
    expect(d.doorOffset).toBe(0)
  })
  it('cold climate is snugger with an offset door', () => {
    const c = design(lab, { ...O, climate: 'cold' })
    expect(c.inD).toBeLessThan(37.5)
    expect(c.doorOffset).toBeGreaterThan(0)
    expect(c.doorOffset + c.doorW / 2).toBeLessThanOrEqual(c.inW / 2)
  })
  it('cut list areas', () => {
    const d = design(lab, O)
    const { panels, sticks } = cutList(d, O)
    expect(panels.find((p) => p.name === 'Floor')).toMatchObject({ w: 39, h: 39 })
    const roof = panels.find((p) => p.name === 'Roof panel')!
    expect(roof.qty).toBe(2)
    expect(roof.h).toBeCloseTo(19.5 / Math.cos(Math.PI / 6) + 2, 6)
    expect(plyArea(panels)).toBeGreaterThan(40)
    expect(sticks.length).toBeGreaterThan(2)
    const shed = cutList(design(lab, { ...O, roof: 'shed', pitch: 10 }), { ...O, roof: 'shed', pitch: 10 })
    expect(shed.panels.filter((p) => p.name.startsWith('Roof')).length).toBe(1)
  })
})
