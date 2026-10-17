import { describe, expect, it } from 'vitest'
import { L_PER_FT3, bagLitres, containerLitres, mixLines, soilNeeded, type Container } from './soil-mix-calculator'

const base: Container = { id: 'x', name: 'x', shape: 'rect', a: 0, b: 0, c: 0, h: 0, qty: 1 }

describe('soil-mix-calculator', () => {
  it('computes shape volumes', () => {
    expect(containerLitres({ ...base, a: 100, b: 50, h: 40 }, false)).toBeCloseTo(200) // 100×50×40 cm
    expect(containerLitres({ ...base, a: 96, b: 48, h: 12 }, true)).toBeCloseTo(32 * L_PER_FT3, 3) // 8×4×1 ft bed = 32 ft³
    expect(containerLitres({ ...base, shape: 'cyl', a: 30, h: 30 }, false)).toBeCloseTo(21.206, 2)
    // frustum equals cylinder when both diameters are equal
    expect(containerLitres({ ...base, shape: 'roundTaper', a: 30, b: 30, h: 30 }, false)).toBeCloseTo(21.206, 2)
    expect(containerLitres({ ...base, shape: 'roundTaper', a: 30, b: 20, h: 25 }, false)).toBeCloseTo((Math.PI * 25 / 12) * (900 + 600 + 400) / 1000, 6)
    expect(containerLitres({ ...base, shape: 'squareTaper', a: 20, b: 0, h: 30 }, false)).toBeCloseTo(4) // pyramid 20²×30/3
    expect(containerLitres({ ...base, shape: 'gallon', a: 5 }, false)).toBeCloseTo(18.927, 2)
  })
  it('splits a mix into bags and cost', () => {
    const lines = mixLines(300, [
      { id: 'a', name: 'Compost', parts: 1, bag: 50, unit: 'L', price: 8 },
      { id: 'b', name: 'Coir', parts: 1, bag: 1, unit: 'ft3', price: 12 },
      { id: 'c', name: 'Vermiculite', parts: 1, bag: 100, unit: 'L', price: 20 },
    ])
    expect(lines[0].litres).toBeCloseTo(100)
    expect(lines[0].bags).toBe(2)
    expect(lines[1].bags).toBe(4) // 100 L / 28.3 L
    expect(lines[2].bags).toBe(1)
    expect(lines.reduce((a, l) => a + l.cost, 0)).toBe(16 + 48 + 20)
    expect(bagLitres(8, 'qt')).toBeCloseTo(8.81, 2)
    expect(soilNeeded(100, 90, 10)).toBeCloseTo(99)
  })
})
