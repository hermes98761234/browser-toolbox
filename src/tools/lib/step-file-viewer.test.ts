import { describe, expect, it } from 'vitest'
import { bspline, geometry, headerInfo, lengthUnit, parseStep, partReps, sampleStep, structure } from './step-file-viewer'

// fan over the outer contour is enough to count faces in tests
const fan = (c: [number, number][]) => c.slice(2).map((_, i) => [0, i + 1, i + 2])

describe('STEP reader', () => {
  const f = parseStep(sampleStep())
  it('parses the sample without errors', () => {
    expect(f.errors).toEqual([])
    expect(f.counts.get('ADVANCED_FACE')).toBe(8 + 5)
    expect(headerInfo(f).schema).toContain('AUTOMOTIVE_DESIGN')
    expect(lengthUnit(f)).toEqual({ name: 'mm', metres: 0.001 })
  })
  it('builds the assembly tree with placements', () => {
    const s = structure(f)
    expect(s.roots).toHaveLength(1)
    expect(s.roots[0].name).toBe('Bracket assembly')
    expect(s.roots[0].children.map((c) => c.name)).toEqual(['Base plate 80x50x8', 'Locating pin D12', 'Locating pin D12'])
    const m = s.roots[0].children[2].m
    expect([m[12], m[13], m[14]]).toEqual([60, 25, -6])
  })
  it('evaluates part geometry', () => {
    const s = structure(f)
    const plate = s.roots[0].children[0].pd
    const reps = s.shapeOf.get(plate)!.flatMap((r) => partReps(f, r))
    const g = geometry(f, reps, fan)
    expect(g.faces.planar).toBe(6)
    expect(g.faces.cylinder).toBe(2)
    expect(g.lines.length).toBe(12 + 4 + 2) // box edges, hole circles, seams
    expect(g.vertices.length).toBe(8 + 4)
  })
  it('parses strings, enums, typed values and complex entities', () => {
    const t = `ISO-10303-21;\nHEADER;\nFILE_NAME('a;b''c','',(''),(''),'','','');\nENDSEC;\nDATA;\n#1=( LENGTH_UNIT() NAMED_UNIT(*) CONVERSION_BASED_UNIT('INCH',#2) );\n#2=LENGTH_MEASURE_WITH_UNIT(LENGTH_MEASURE(25.4),#3);\n/* comment; */\n#3=( LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI.,.METRE.) );\n#4=COORDINATES_LIST('',3,((0.,0.,0.),(1.,0.,0.),(0.,1.,0.)));\n#5=TRIANGULATED_FACE('',#4,0,(),$,(),((1,2,3)));\nENDSEC;\nEND-ISO-10303-21;`
    const p = parseStep(t)
    expect(p.errors).toEqual([])
    expect(headerInfo(p).name).toBe("a;b'c")
    expect(lengthUnit(p).name).toBe('in')
    const g = geometry(p, [5], fan)
    expect(g.tris).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0])
  })
  it('B-spline with clamped knots interpolates end points and matches a quadratic Bezier', () => {
    const pts = bspline(2, [[0, 0, 0], [1, 2, 0], [2, 0, 0]], [3, 3], [0, 1], null, 2)
    expect(pts[0]).toEqual([0, 0, 0])
    expect(pts[1][0]).toBeCloseTo(1)
    expect(pts[1][1]).toBeCloseTo(1)
    expect(pts[2]).toEqual([2, 0, 0])
  })
  it('rejects non-STEP input', () => {
    expect(() => parseStep('hello')).toThrow()
  })
})
