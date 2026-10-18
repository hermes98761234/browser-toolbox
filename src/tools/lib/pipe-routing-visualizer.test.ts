import { describe, expect, it } from 'vitest'
import { feetInches, fittings, groupFittings, iso, parseSteps, pipeTakeoff, vertices, type Run } from './pipe-routing-visualizer'

const run = (id: string, start: [number, number, number], steps: string, extra: Partial<Run> = {}): Run => ({ id, name: id, system: 'cold', material: 'Copper', size: '1/2', start, steps, ...extra })

describe('pipe routing', () => {
  it('parses and merges steps', () => {
    expect(parseSteps('U8 e2.5').steps).toEqual([{ d: 'U', l: 8 }, { d: 'E', l: 2.5 }])
    expect(parseSteps('X3').error).toMatch(/Bad step/)
    const v = vertices(run('a', [0, 0, 0], 'E2 E3 U4'))
    expect(v.pts).toEqual([[0, 0, 0], [5, 0, 0], [5, 4, 0]])
    expect(vertices(run('a', [0, 0, 0], 'E2 W1')).error).toMatch(/doubles back/)
  })
  it('inserts elbows, tees, couplings and caps', () => {
    const main = run('a', [0, 0, 0], 'E12 U4')
    const branch = run('b', [6, 0, 0], 'S3', { size: '3/8' })
    const f = groupFittings(fittings([main, branch]))
    const q = (t: string) => f.filter((x) => x.type.startsWith(t)).reduce((a, x) => a + x.qty, 0)
    expect(q('90° elbow')).toBe(1)
    expect(q('Tee')).toBe(1)
    expect(f.find((x) => x.type.startsWith('Tee'))!.type).toContain('1/2×3/8')
    expect(q('Coupling')).toBe(1) // 12 ft of 10-ft stock copper
    expect(q('Stub-out')).toBe(3) // main start, main end, branch end
  })
  it('tee at an elbow replaces the elbow; takeoff sums lengths', () => {
    const main = run('a', [0, 0, 0], 'E4 U4')
    const b = run('b', [4, 0, 0], 'S2')
    const f = fittings([main, b])
    expect(f.filter((x) => x.type.includes('elbow')).length).toBe(0)
    expect(f.filter((x) => x.type.startsWith('Tee')).length).toBe(1)
    const t = pipeTakeoff([main, b], 0)
    expect(t[0].length).toBe(10)
    expect(t[0].sticks).toBe(1)
  })
  it('formats and projects', () => {
    expect(feetInches(4.5)).toBe(`4'-6"`)
    expect(iso([0, 1, 0])).toEqual([0, -1])
  })
})
