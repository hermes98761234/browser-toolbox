import { describe, expect, it } from 'vitest'
import { fromMm, modelToReal, nearestScale, parseScale, realToModel, rescale, rulerTicks, toMm } from './model-scale-converter'

describe('model scale', () => {
  it('converts', () => {
    expect(realToModel(toMm(1.8, 'm'), 87)).toBeCloseTo(20.69, 2)
    expect(fromMm(modelToReal(100, 35), 'm')).toBeCloseTo(3.5, 10)
    expect(fromMm(realToModel(toMm(6, 'ft'), 12), 'in')).toBeCloseTo(6, 10) // 1:12 → 1 ft = 1 in
    expect(rescale(72, 48)).toBeCloseTo(1.5, 10)
  })
  it('parses scales', () => {
    expect(parseScale('1:87')).toBe(87)
    expect(parseScale('1/35')).toBe(35)
    expect(parseScale('2:1')).toBe(0.5)
    expect(parseScale('0.01')).toBeCloseTo(100, 10)
    expect(parseScale('abc')).toBeNull()
    expect(nearestScale(86).n).toBe(87)
  })
  it('ruler ticks', () => {
    const t = rulerTicks(87, 'm', 200) // 200 mm at 1:87 = 17.4 m real
    expect(t[0]).toMatchObject({ pos: 0, level: 0, label: '0' })
    const one = t.find((x) => x.label === '1')!
    expect(one.pos).toBeCloseTo(1000 / 87, 8)
    expect(t[t.length - 1].pos).toBeLessThanOrEqual(200 + 1e-9)
  })
})
