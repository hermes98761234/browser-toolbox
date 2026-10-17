import { describe, expect, it } from 'vitest'
import { filamentGrams, moveTime, parseGcode, SAMPLE_CNC, samplePrint } from './g-code-previewer'

const opt = { rapidFeed: 6000, accel: 0, defaultFeed: 1000 }

describe('g-code-previewer', () => {
  it('computes trapezoidal move times', () => {
    expect(moveTime(100, 50, 0)).toBe(2)
    expect(moveTime(100, 50, 1000)).toBeCloseTo(2 + 0.05, 9)
    expect(moveTime(1, 50, 1000)).toBeCloseTo(2 * Math.sqrt(1 / 1000), 9)
  })
  it('parses lines, layers, extrusion and time', () => {
    const r = parseGcode('G90\nM82\nG92 E0\nG0 X0 Y0 Z0.2\nG1 X10 E1 F600\nG1 Y10 E2\nG0 Z0.4\nG1 X0 E3\n', opt)
    expect(r.hasExtrusion).toBe(true)
    expect(r.layers.length).toBe(2)
    expect(r.layers[0].z).toBeCloseTo(0.2, 9)
    expect(r.cut.length / 6).toBe(3)
    expect(r.filament).toBeCloseTo(3, 9)
    expect(r.pathLength).toBeCloseTo(30, 9)
    // 30 mm at 10 mm/s + travel 0.2 at 100 mm/s + initial travel ~0.2
    expect(r.time).toBeCloseTo(3 + 0.2 / 100 + 0.2 / 100, 6)
  })
  it('handles relative moves, inches and arcs', () => {
    const r = parseGcode('G20 G91\nG1 X1 F10\nG90\nG2 X1 Y0 I-0.5 J0\n', opt)
    expect(r.layers.length).toBe(1)
    expect(r.cut[3]).toBeCloseTo(25.4, 9)
    // full circle of radius 12.7 mm
    expect(r.pathLength).toBeCloseTo(25.4 + 2 * Math.PI * 12.7, 1)
    const rr = parseGcode('G1 X10 Y0 F100\nG3 X0 Y10 R10\n', opt)
    expect(rr.pathLength).toBeCloseTo(10 + 5 * Math.PI, 1) // quarter circle, R = 10
  })
  it('parses the samples', () => {
    const p = parseGcode(samplePrint(), { ...opt, accel: 1000 })
    expect(p.layers.length).toBe(60)
    expect(p.filament).toBeGreaterThan(100)
    const c = parseGcode(SAMPLE_CNC, opt)
    expect(c.hasExtrusion).toBe(false)
    expect(c.layers.length).toBe(6) // 3 pocket passes + 3 hole passes, in program order
    expect(c.bounds!.max[0]).toBeCloseTo(4.5 * 25.4, 6)
  })
  it('computes filament mass', () => {
    expect(filamentGrams(1000, 1.75, 1.24)).toBeCloseTo(2.9825, 3)
  })
})
