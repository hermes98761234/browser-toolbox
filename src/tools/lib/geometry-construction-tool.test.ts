import { describe, expect, it } from 'vitest'
import { CHALLENGES, dependents, describe as text, evaluate, intersections, nextName, type Obj, type PointVal } from './geometry-construction-tool'

const P = (id: string, x: number, y: number): Obj => ({ id, kind: 'point', name: id, parents: [], x, y })

describe('intersections', () => {
  it('line/line, line/circle, circle/circle', () => {
    expect(intersections({ type: 'line', p: { x: 0, y: 0 }, d: { x: 1, y: 1 }, kind: 'line' }, { type: 'line', p: { x: 0, y: 2 }, d: { x: 1, y: -1 }, kind: 'line' })).toEqual([{ x: 1, y: 1 }])
    const lc = intersections({ type: 'line', p: { x: -5, y: 0 }, d: { x: 1, y: 0 }, kind: 'line' }, { type: 'circle', c: { x: 0, y: 0 }, r: 2 })
    expect(lc.map((p) => +p.x.toFixed(9))).toEqual([-2, 2])
    const cc = intersections({ type: 'circle', c: { x: 0, y: 0 }, r: 2 }, { type: 'circle', c: { x: 2, y: 0 }, r: 2 })
    expect(cc[0].x).toBeCloseTo(1, 12)
    expect(cc[0].y).toBeCloseTo(Math.sqrt(3), 12)
    expect(cc[1].y).toBeCloseTo(-Math.sqrt(3), 12)
    // segment misses
    expect(intersections({ type: 'line', p: { x: 0, y: 0 }, d: { x: 1, y: 0 }, kind: 'segment' }, { type: 'line', p: { x: 3, y: -1 }, d: { x: 0, y: 1 }, kind: 'line' })).toEqual([])
    expect(intersections({ type: 'circle', c: { x: 0, y: 0 }, r: 1 }, { type: 'circle', c: { x: 5, y: 0 }, r: 1 })).toEqual([])
  })
})

describe('construction', () => {
  // Euclid I.1
  const objs: Obj[] = [
    P('A', 0, 0), P('B', 4, 0),
    { id: 'c1', kind: 'circle', name: 'c1', parents: ['A', 'B'] },
    { id: 'c2', kind: 'circle', name: 'c2', parents: ['B', 'A'] },
    { id: 'C', kind: 'intersect', name: 'C', parents: ['c1', 'c2'], branch: 0 },
    { id: 'tri', kind: 'polygon', name: 'poly1', parents: ['A', 'B', 'C'] },
    { id: 'ang', kind: 'angle', name: 'm1', parents: ['B', 'A', 'C'] },
    { id: 'pb', kind: 'bisector', name: 'p', parents: ['A', 'B'] },
    { id: 'M', kind: 'intersect', name: 'M', parents: ['pb', 'tri'], branch: 0 },
  ]
  it('evaluates dependent objects and measurements', () => {
    const v = evaluate(objs)
    const C = (v.get('C') as PointVal).p
    expect(C.x).toBeCloseTo(2, 12)
    expect(Math.abs(C.y)).toBeCloseTo(2 * Math.sqrt(3), 12)
    const tri = v.get('tri')
    expect(tri?.type === 'polygon' && tri.area).toBeCloseTo(4 * Math.sqrt(3), 10)
    const ang = v.get('ang')
    expect(ang?.type === 'measure' && ang.value).toBeCloseTo(60, 10)
    expect(v.get('M')).toBeNull() // polygons are not intersectable
  })
  it('updates when a free point moves', () => {
    const moved = objs.map((o) => (o.id === 'B' ? { ...o, x: 6 } : o))
    expect((evaluate(moved).get('C') as PointVal).p.x).toBeCloseTo(3, 12)
    expect([...dependents(objs, 'B')].sort()).toEqual(['B', 'C', 'M', 'ang', 'c1', 'c2', 'pb', 'tri'].sort())
  })
  it('protocol text and names', () => {
    expect(text(objs[4], objs)).toBe('intersection of c1 and c2')
    expect(nextName(objs, 'point')).toBe('D')
    expect(nextName(objs, 'circle')).toBe('c3')
  })
  it('challenge checker accepts a valid construction', () => {
    const ch = CHALLENGES.find((c) => c.id === 'equi')!
    const sol: Obj[] = [...ch.given, { id: 'k1', kind: 'circle', name: 'c1', parents: ['gA', 'gB'] }, { id: 'k2', kind: 'circle', name: 'c2', parents: ['gB', 'gA'] }, { id: 'X', kind: 'intersect', name: 'C', parents: ['k1', 'k2'], branch: 1 }]
    expect(ch.check(ch.given, evaluate(ch.given))).toBe(false)
    expect(ch.check(sol, evaluate(sol))).toBe(true)
    const pb = CHALLENGES.find((c) => c.id === 'perpbis')!
    const s2: Obj[] = [...pb.given, { id: 'k1', kind: 'circle', name: 'c1', parents: ['gA', 'gB'] }, { id: 'k2', kind: 'circle', name: 'c2', parents: ['gB', 'gA'] },
      { id: 'X', kind: 'intersect', name: 'C', parents: ['k1', 'k2'], branch: 0 }, { id: 'Y', kind: 'intersect', name: 'D', parents: ['k1', 'k2'], branch: 1 }, { id: 'l', kind: 'line', name: 'a', parents: ['X', 'Y'] }]
    expect(pb.check(s2, evaluate(s2))).toBe(true)
  })
})
