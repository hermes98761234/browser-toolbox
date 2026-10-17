import { describe, expect, it } from 'vitest'
import { analyze, repair, SAMPLES, weld } from './stl-repair-checker'
import { sampleTorus } from './stl-viewer'

describe('stl-repair-checker', () => {
  it('clean cube is watertight, genus 0, volume 8000', () => {
    const r = analyze(weld(SAMPLES.clean.make()))
    expect(r.watertight).toBe(true)
    expect(r.genus).toBe(0)
    expect(r.euler).toBe(2)
    expect(r.volume).toBeCloseTo(8000, 6)
    expect(r.area).toBeCloseTo(2400, 6)
  })
  it('torus has genus 1', () => {
    const r = analyze(weld(sampleTorus(30, 10, 24, 12)))
    expect(r.watertight).toBe(true)
    expect(r.genus).toBe(1)
  })
  it('finds holes and flipped faces, repair closes them', () => {
    const m = weld(SAMPLES.holes.make())
    const r = analyze(m)
    expect(r.holes.length).toBe(2)
    expect(r.holes.map((h) => h.length).sort()).toEqual([4, 8])
    expect(r.flippedEdges.length).toBeGreaterThan(0)
    const fixed = repair(m)
    expect(fixed.filledHoles).toBe(2)
    const r2 = analyze(fixed.mesh)
    expect(r2.watertight).toBe(true)
    expect(r2.volume).toBeCloseTo(8000, 6)
  })
  it('detects non-manifold shared edge', () => {
    const r = analyze(weld(SAMPLES.nonmanifold.make()))
    expect(r.nonManifoldEdges.length).toBe(1)
    expect(r.components).toBe(2)
  })
  it('re-orients an inside-out mesh', () => {
    const m = weld(SAMPLES.inverted.make())
    expect(analyze(m).volume).toBeCloseTo(-8000, 6)
    const r = repair(m)
    expect(r.flippedFaces).toBe(12)
    expect(analyze(r.mesh).volume).toBeCloseTo(8000, 6)
  })
  it('drops degenerate and duplicate faces', () => {
    const base = [...SAMPLES.clean.make()]
    const pos = new Float32Array([...base, ...base.slice(0, 9), 0, 0, 0, 1, 1, 1, 2, 2, 2])
    const m = weld(pos)
    const r = analyze(m)
    expect(r.duplicates.length).toBe(1)
    expect(r.degenerate.length).toBe(1)
    expect(analyze(repair(m).mesh).watertight).toBe(true)
  })
})
