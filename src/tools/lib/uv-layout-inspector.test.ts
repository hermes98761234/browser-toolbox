import { describe, expect, it } from 'vitest'
import { analyze, islands, rasterOverlap, singular, triArea3, triAreaUv, weightedPercentile } from './uv-layout-inspector'

// Unit quad in 3D (z=0) split into two triangles, mapped to UV square [0,s]².
function quad(s: number, ox = 0, oy = 0, px = 0) {
  const pos = [px, 0, 0, px + 1, 0, 0, px + 1, 1, 0, px, 0, 0, px + 1, 1, 0, px, 1, 0]
  const uv = [ox, oy, ox + s, oy, ox + s, oy + s, ox, oy, ox + s, oy + s, ox, oy + s]
  return { pos, uv }
}
const mesh = (...qs: { pos: number[]; uv: number[] }[]) => ({ pos: new Float32Array(qs.flatMap((q) => q.pos)), uv: new Float32Array(qs.flatMap((q) => q.uv)) })

describe('uv-layout-inspector', () => {
  it('computes areas', () => {
    expect(triArea3([0, 0, 0, 2, 0, 0, 0, 3, 0], 0)).toBeCloseTo(3)
    expect(triAreaUv([0, 0, 1, 0, 0, 1], 0)).toBeCloseTo(0.5)
    expect(triAreaUv([0, 0, 0, 1, 1, 0], 0)).toBeCloseTo(-0.5)
  })
  it('singular values of a uniform scale and of a stretch', () => {
    const [a, b] = singular([0, 0, 0, 1, 0, 0, 0, 1, 0], 0, [0, 0, 0.5, 0, 0, 0.5], 0)
    expect(a).toBeCloseTo(0.5)
    expect(b).toBeCloseTo(0.5)
    const [c, d] = singular([0, 0, 0, 1, 0, 0, 0, 1, 0], 0, [0, 0, 0.8, 0, 0, 0.2], 0)
    expect(c / d).toBeCloseTo(4)
  })
  it('finds islands and overlaps', () => {
    const m = mesh(quad(0.4, 0, 0, 0), quad(0.4, 0.5, 0.5, 2))
    const r = analyze(m, 256)
    expect(islands(m).count).toBe(2)
    expect(r.overlapTris).toBe(0)
    expect(r.coverage).toBeCloseTo(0.32, 2)
    expect(r.density[0]).toBeCloseTo(1)
    expect(r.aniso[0]).toBeCloseTo(1)
    const o = mesh(quad(0.5, 0, 0, 0), quad(0.5, 0.25, 0.25, 2))
    const ro = rasterOverlap(o, 256)
    expect(Array.from(ro.overlap).every((x) => x === 1)).toBe(true)
  })
  it('does not count shared diagonals as overlap', () => {
    const r = analyze(mesh(quad(1)), 128)
    expect(r.overlapTris).toBe(0)
    expect(r.coverage).toBeCloseTo(1, 2)
  })
  it('flags density differences', () => {
    const r = analyze(mesh(quad(0.2, 0, 0, 0), quad(0.4, 0.5, 0, 2)), 128)
    expect(r.density[2] / r.density[0]).toBeCloseTo(4)
    expect(weightedPercentile([1, 2, 3], [1, 1, 1], 0.5)).toBe(2)
  })
})
