import { describe, expect, it } from 'vitest'
import { analyze, gridCube, weld } from './stl-repair-checker'
import { compact, drill, hollow, icosphere, samplePawn, subdivide, volumeArea } from './hollow-shell-maker'

describe('hollow-shell-maker', () => {
  it('mitered offset turns a 20 mm cube into a 16 mm cavity for a 2 mm wall', () => {
    const cube = weld(new Float32Array(gridCube(4, 20).flat()))
    const h = hollow(cube, 2)
    const inner = volumeArea(h.work.verts, h.work.faces, (f) => h.work.kind[f] === 1).volume
    expect(inner).toBeCloseTo(-(16 ** 3), 3)
    expect(h.folded).toBe(0)
    const m = compact(h.work)
    expect(analyze(m).watertight).toBe(true)
    expect(analyze(m).volume).toBeCloseTo(8000 - 4096, 3)
  })

  it('hollows a sphere close to the analytic shell volume', () => {
    const s = icosphere(20, 4)
    const h = hollow(s, 2)
    const v = volumeArea(h.work.verts, h.work.faces).volume
    const exact = (4 / 3) * Math.PI * (20 ** 3 - 18 ** 3)
    expect(Math.abs(v - exact) / exact).toBeLessThan(0.02)
  })

  it('drills a watertight drain hole', () => {
    const s = icosphere(20, 4)
    const h = hollow(s, 2)
    const before = volumeArea(h.work.verts, h.work.faces).volume
    const err = drill(h.work, { p: [0, 0, -20], n: [0, 0, -1], r: 2.5 }, 2)
    expect(err).toBeNull()
    const m = compact(h.work)
    const rep = analyze(m)
    expect(rep.boundaryEdges.length).toBe(0)
    expect(rep.flippedEdges.length).toBe(0)
    expect(rep.nonManifoldEdges.length).toBe(0)
    // cavity is now connected to the outside: genus 1 shell
    expect(rep.components).toBe(1)
    const hole = Math.PI * 2.5 ** 2 * 2
    expect(Math.abs(before - rep.volume - hole) / hole).toBeLessThan(0.35)
  })

  it('two holes on the pawn stay watertight', () => {
    const h = hollow(samplePawn(), 1.5)
    expect(drill(h.work, { p: [0, 0, 0], n: [0, 0, -1], r: 2 }, 1.5)).toBeNull()
    expect(drill(h.work, { p: [8, 0, 0], n: [0, 0, -1], r: 1.5 }, 1.5)).toBeNull()
    expect(analyze(compact(h.work)).watertight).toBe(true)
  })

  it('subdivision keeps volume of a cube', () => {
    const cube = weld(new Float32Array(gridCube(1, 10).flat()))
    const m = subdivide(cube)
    expect(m.faces.length).toBe(cube.faces.length * 4)
    expect(Math.abs(volumeArea(m.verts, m.faces).volume)).toBeCloseTo(1000, 6)
  })
})
