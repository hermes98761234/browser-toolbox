import { describe, expect, it } from 'vitest'
import { analyze, estimate, fmtDuration, type Costs, type Settings } from './print-cost-estimator'
import { sampleCube } from './stl-viewer'

const S: Settings = { layer: 0.2, line: 0.4, walls: 2, topBottom: 4, infill: 20, supports: true, supportDensity: 15 }
const C: Costs = { filamentPerKg: 20, density: 1.24, diameter: 1.75, speed: 60, power: 120, kwh: 0.2, wearPerHour: 0, laborPerJob: 0, failure: 0, markup: 0, copies: 1 }

describe('print cost', () => {
  it('analyzes a 20 mm cube', () => {
    const g = analyze(sampleCube(20), S)
    expect(g.volume).toBeCloseTo(8000)
    expect(g.area).toBeCloseTo(2400)
    expect(g.height).toBe(20)
    // 4 walls × 400 mm² × 0.8 mm + top & bottom 2 × 400 × 0.8 mm
    expect(g.thickArea).toBeCloseTo(4 * 400 * 0.8 + 2 * 400 * 0.8)
    expect(g.footprint).toBeCloseTo(400)
    expect(g.overhang).toBe(0)
  })
  it('estimates mass and filament length', () => {
    const g = analyze(sampleCube(20), S)
    const e = estimate(g, S, C)
    const plastic = 1920 + (8000 - 1920) * 0.2
    expect(e.plastic).toBeCloseTo(plastic)
    expect(e.grams).toBeCloseTo((plastic / 1000) * 1.24)
    expect(e.meters).toBeCloseTo(plastic / (Math.PI * 0.875 ** 2) / 1000)
    expect(e.material).toBeCloseTo((e.grams / 1000) * 20)
    expect(e.hours).toBeGreaterThan(0.1)
  })
  it('formats duration', () => {
    expect(fmtDuration(1.5)).toBe('1h 30m')
    expect(fmtDuration(25)).toBe('1d 1h 0m')
  })
})
