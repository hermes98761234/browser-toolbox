import { describe, expect, it } from 'vitest'
import { apply, decodeStepString, frame, GeometryBuilder, IfcModel, loadIfc, mul, parseArgs, properties, readUnits } from './bim-model-viewer'
import { sampleIfc } from './bim-model-viewer-sample'

const wrap = (data: string) => `ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION((''),'2;1');\nFILE_NAME('t.ifc','',('me'),(''),'','app','');\nFILE_SCHEMA(('IFC2X3'));\nENDSEC;\nDATA;\n${data}\nENDSEC;\nEND-ISO-10303-21;`
const close = (a: number[], b: number[]) => a.forEach((x, i) => expect(x).toBeCloseTo(b[i], 6))

describe('STEP parsing', () => {
  it('parses typed values, lists, enums, refs, nulls and escapes', () => {
    const v = parseArgs("'It''s',#12,(1.,-2.5E-1,3),.T.,.ELEMENT.,$,*,IFCLABEL('x'),(),'\\X2\\00E9\\X0\\t\\X\\E9'")
    expect(v[0]).toBe("It's")
    expect(v[1]).toEqual({ ref: 12 })
    expect(v[2]).toEqual([1, -0.25, 3])
    expect(v[3]).toBe(true)
    expect(v[4]).toEqual({ enum: 'ELEMENT' })
    expect(v[5]).toBe(null)
    expect(v[6]).toBe('*')
    expect(v[7]).toEqual({ t: 'IFCLABEL', v: 'x' })
    expect(v[8]).toEqual([])
    expect(v[9]).toBe('été')
    expect(decodeStepString('\\S\\a')).toBe('á')
  })
  it('indexes entities lazily, handles multi-line records, comments and ; inside strings', () => {
    const m = new IfcModel(wrap("/* c */ #1=IFCCARTESIANPOINT((1.,2.,3.));\n#2 = IFCWALL('g;id',$,\n 'Wall (a)',$,$,$,$,$);\n#3=IFCDIRECTION((0.,0.,1.));"))
    expect(m.size).toBe(3)
    expect(m.schema).toBe('IFC2X3')
    expect(m.header.app).toBe('app')
    expect(m.typeOf(2)).toBe('IFCWALL')
    expect(m.get(2)!.args[2]).toBe('Wall (a)')
    expect(m.get(1)!.args[0]).toEqual([1, 2, 3])
    expect(m.rooted(2)).toBe(true)
    expect(m.rooted(1)).toBe(false)
  })
})

describe('placement maths', () => {
  it('frame builds a right-handed basis', () => {
    const M = frame([0, 0, 1], [0, 1, 0], [10, 0, 0])
    close(apply(M, 1, 0, 0), [10, 1, 0])
    close(apply(M, 0, 1, 0), [9, 0, 0])
  })
  it('composes IfcLocalPlacement chains (rotation then translation)', () => {
    const m = new IfcModel(wrap([
      '#1=IFCCARTESIANPOINT((100.,0.,0.));', '#2=IFCDIRECTION((0.,0.,1.));', '#3=IFCDIRECTION((0.,1.,0.));',
      '#4=IFCAXIS2PLACEMENT3D(#1,#2,#3);', '#5=IFCLOCALPLACEMENT($,#4);',
      '#6=IFCCARTESIANPOINT((10.,0.,5.));', '#7=IFCAXIS2PLACEMENT3D(#6,$,$);', '#8=IFCLOCALPLACEMENT(#5,#7);',
    ].join('\n')))
    const gb = new GeometryBuilder(m, readUnits(m))
    // parent rotated 90° about Z and moved to x=100; child offset (10,0,5) in parent axes → (100, 10, 5)
    close(apply(gb.placement({ ref: 8 }), 0, 0, 0), [100, 10, 5])
    close(apply(gb.placement({ ref: 8 }), 1, 0, 0), [100, 11, 5])
  })
  it('matrix multiply is associative with apply', () => {
    const A = frame([1, 0, 0], [0, 1, 0], [1, 2, 3]), B = frame([0, 0, 1], [1, 1, 0], [4, 0, 0])
    const p = apply(B, 1, 2, 3)
    close(apply(mul(A, B), 1, 2, 3), apply(A, ...p))
  })
})

describe('sample house', () => {
  const lm = loadIfc(sampleIfc())
  it('reads millimetre units', () => {
    expect(lm.units.lengthScale).toBe(0.001)
    expect(lm.storeys.map((s) => s.elevation)).toEqual([0, 3])
  })
  it('builds the spatial tree Project → Site → Building → 2 storeys', () => {
    const p = lm.tree[0]
    expect(p.type).toBe('IFCPROJECT')
    const b = p.children[0].children[0]
    expect(b.type).toBe('IFCBUILDING')
    expect(b.children.map((c) => c.name)).toEqual(['Ground floor', 'First floor'])
    expect(b.children[0].children.length).toBeGreaterThan(10)
  })
  it('builds geometry for every element except the revolved washbasin', () => {
    const bad = lm.elements.filter((e) => e.geom.status === 'unsupported' || e.geom.status === 'partial')
    expect(bad.map((e) => e.name)).toEqual(['Washbasin'])
    expect(bad[0].geom.issues[0]).toContain('IfcRevolvedAreaSolid')
    const wall = lm.elements.find((e) => e.name === 'GF south wall')!
    const pos = wall.geom.parts[0].pos
    const xs = [], ys = [], zs = []
    for (let i = 0; i < pos.length; i += 3) { xs.push(pos[i]); ys.push(pos[i + 1]); zs.push(pos[i + 2]) }
    expect(Math.min(...xs)).toBeCloseTo(0, 5)
    expect(Math.max(...xs)).toBeCloseTo(10, 5)
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(0.25, 5)
    expect(Math.max(...zs)).toBeCloseTo(2.8, 5)
    // 4 cap triangles + 8 side triangles
    expect(pos.length / 9).toBe(12)
  })
  it('places mapped windows on rotated walls and keeps the slab void', () => {
    const w = lm.elements.filter((e) => e.type === 'IFCWINDOW')
    expect(w.length).toBe(13)
    const east = w.find((x) => x.storey !== null && x.geom.parts[0].pos[0] > 9.5)!
    expect(east).toBeTruthy()
    expect(w[0].geom.parts.length).toBe(2)
    expect(w[0].geom.parts[1].color?.[3]).toBeCloseTo(0.4, 5)
    const slab = lm.elements.find((e) => e.name === 'First floor slab')!
    expect(slab.geom.status).toBe('ok')
    expect(slab.geom.tris).toBeGreaterThan(12)
  })
  it('collects property sets, quantities and type properties', () => {
    const wall = lm.elements.find((e) => e.name === 'GF south wall')!
    const ps = properties(lm.model, lm.rel, lm.units, wall.id)
    expect(ps.map((g) => g.name)).toEqual(['Attributes', 'Pset_WallCommon', 'Qto_WallBaseQuantities'])
    expect(ps[1].rows).toContainEqual(['FireRating', 'REI 60'])
    expect(ps[2].rows).toContainEqual(['Length', '10000 mm'])
    const win = lm.elements.find((e) => e.type === 'IFCWINDOW')!
    const wp = properties(lm.model, lm.rel, lm.units, win.id)
    expect(wp.some((g) => g.name === 'Pset_WindowCommon (type)')).toBe(true)
  })
})
