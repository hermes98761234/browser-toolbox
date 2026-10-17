import { describe, expect, it } from 'vitest'
import { analyze, parseObj, readiness, sampleHollow, sampleObj, shells, toObj, weld } from './mesh-repair-checker'
import { SAMPLES } from './stl-repair-checker'

describe('mesh repair checker', () => {
  it('parses OBJ polygons, slashes and negative indices', () => {
    const soup = parseObj('v 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nf 1/1/1 2/2/1 3/3/1 4/4/1\nf -4 -2 -1')
    expect(soup.length).toBe(27)
    expect(() => parseObj('v 0 0 0\nf 1 2 3')).toThrow()
  })
  it('round-trips through OBJ', () => {
    const m = weld(SAMPLES.clean.make())
    const back = weld(parseObj(toObj(m)))
    expect(back.faces.length).toBe(m.faces.length)
    expect(analyze(back).volume).toBeCloseTo(8000, 6)
  })
  it('counts shells, per-shell volume and flipped faces', () => {
    const m = weld(parseObj(sampleObj()))
    const { shells: sh } = shells(m)
    expect(sh).toHaveLength(3)
    const [main, second, debris] = sh
    expect(main.closed).toBe(false)
    expect(main.flipped).toBe(4)
    expect(second.closed).toBe(true)
    expect(second.volume).toBeCloseTo(3375, 6)
    expect(debris.role).toBe('debris')
  })
  it('recognises a cavity as valid and an inside-out cube as flipped', () => {
    const h = shells(weld(sampleHollow()))
    expect(h.shells.map((s) => s.role).sort()).toEqual(['body', 'void'])
    expect(h.shells.reduce((a, s) => a + s.flipped, 0)).toBe(0)
    const total = h.shells.reduce((a, s) => a + s.volume, 0)
    expect(total).toBeCloseTo(27000 - 8000, 6)
    const inv = shells(weld(SAMPLES.inverted.make()))
    expect(inv.shells[0].flipped).toBe(12)
    expect([...inv.faceSign].every((x) => x === -1)).toBe(true)
  })
  it('produces readiness checks', () => {
    const m = weld(sampleHollow())
    const c = readiness(analyze(m), shells(m).shells, [220, 220, 250], 1)
    expect(c.filter((x) => x.level === 'fail')).toHaveLength(0)
    const big = readiness(analyze(m), shells(m).shells, [20, 20, 20], 1)
    expect(big.find((x) => x.name.startsWith('Fits'))!.level).toBe('fail')
  })
})
