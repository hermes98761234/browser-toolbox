import { describe, expect, it } from 'vitest'
import { buildTree, parseRows } from './org-chart-maker'
import { chain, forceLayout, parents, radialLayout, sampleOrg, subtreeIds } from './3d-org-explorer'

const tree = (csv: string) => buildTree(parseRows(csv.split('\n').map((l) => l.split(','))))

describe('3d-org-explorer', () => {
  const t = tree('id,name,title,manager,department\n1,A,CEO,,X\n2,B,VP,1,X\n3,C,VP,1,Y\n4,D,Eng,2,X\n5,E,Eng,2,X')
  it('lays out a cone tree by depth with wedges by leaf count', () => {
    const p = radialLayout(t.roots, 3, 2)
    expect(p.get('1')!.map((v) => Math.abs(v))).toEqual([0, 0, 0])
    expect(p.get('4')![1]).toBe(-4)
    expect(Math.hypot(p.get('2')![0], p.get('2')![2])).toBeCloseTo(3)
    // B has 2 leaves, C has 1 → B's wedge is 2/3 of the circle, centred at 2π/3
    expect(Math.atan2(p.get('2')![2], p.get('2')![0])).toBeCloseTo((2 * Math.PI) / 3)
  })
  it('keeps depth levels in the force layout and separates siblings', () => {
    const p = forceLayout(t.roots, 80, 3, 2)
    expect(p.get('5')![1]).toBe(-4)
    const a = p.get('4')!, b = p.get('5')!
    expect(Math.hypot(a[0] - b[0], a[2] - b[2])).toBeGreaterThan(0.5)
  })
  it('walks chains and subtrees', () => {
    const par = parents(t.roots)
    expect(chain(t.byId, par, '5').map((n) => n.name)).toEqual(['A', 'B', 'E'])
    expect([...subtreeIds(t.byId.get('2')!)].sort()).toEqual(['2', '4', '5'])
  })
  it('generates a consistent sample company', () => {
    const csv = sampleOrg()
    expect(csv).toBe(sampleOrg())
    const s = tree(csv)
    expect(s.roots.length).toBe(1)
    expect(s.byId.size).toBeGreaterThan(100)
    expect(s.problems.missingManager).toEqual([])
    expect(s.problems.duplicates).toEqual([])
  })
})
