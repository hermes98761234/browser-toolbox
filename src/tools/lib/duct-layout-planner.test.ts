import { describe, expect, it } from 'vitest'
import { attachment, equivDiameter, fittings, frictionPer100, paths, runLength, segmentFlows, type Run } from './duct-layout-planner'

const R = (id: string, pts: [number, number, number][], cfm = 0, d = 8): Run => ({ id, name: id, kind: 'supply', shape: 'round', d, w: 0, h: 0, cfm, pts })

describe('duct layout planner', () => {
  const trunk = R('t', [[0, 8, 0], [20, 8, 0], [20, 8, 10]], 100, 10)
  const br = R('b', [[10, 8, 0], [10, 8, 5], [10, 7, 5]], 150, 6)
  const runs = [trunk, br]
  it('measures lengths', () => {
    expect(runLength(trunk)).toBe(30)
    expect(runLength(br)).toBe(6)
  })
  it('finds tee attachments', () => {
    const a = attachment(br, runs)!
    expect(a.parent).toBe('t')
    expect(a.seg).toBe(0)
    expect(a.t).toBeCloseTo(0.5)
    expect(attachment(trunk, runs)).toBeNull()
  })
  it('counts fittings', () => {
    const f = fittings(runs)
    expect(f.elbow90).toBe(2)
    expect(f.tees).toBe(1)
    expect(f.terminals).toBe(2)
    expect(f.collars).toBe(1)
  })
  it('accumulates airflow downstream to upstream', () => {
    const fl = segmentFlows(runs)
    expect(fl.get('t')).toEqual([250, 100])
    expect(fl.get('b')).toEqual([150, 150])
  })
  it('friction chart values', () => {
    // 100 cfm in 6" ≈ 0.10 in.wg/100 ft; 1000 cfm in 14" ≈ 0.11
    expect(frictionPer100(100, 6)).toBeCloseTo(0.1, 1)
    expect(frictionPer100(1000, 14)).toBeCloseTo(0.11, 1)
    expect(equivDiameter(12, 8)).toBeCloseTo(10.7, 1)
  })
  it('computes total effective length per terminal', () => {
    const p = paths(runs)
    const pb = p.find((x) => x.run === 'b')!
    expect(pb.length).toBeCloseTo(16)
    // 16 ft + elbow 10 + tee branch 25 + terminal 15
    expect(pb.tel).toBeCloseTo(66)
    const pt = p.find((x) => x.run === 't')!
    expect(pt.tel).toBeCloseTo(30 + 10 + 15)
  })
})
