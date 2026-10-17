import { describe, expect, it } from 'vitest'
import { concrete, cutList, layout, shade, type Params } from './pergola-designer'

const P: Params = {
  length: 3600, width: 3000, height: 2450, maxPostSpacing: 2400, post: '6x6', beam: '2x10', doubleBeam: true, beamOverhang: 450,
  rafter: '2x8', rafterSpacing: 400, rafterOverhang: 300, slats: true, slat: '2x2', slatSpacing: 150, braces: false, footingDepth: 900,
}

describe('pergola', () => {
  it('counts members', () => {
    const m = layout(P)
    expect(m.filter((x) => x.kind === 'Post')).toHaveLength(6) // 2 spans → 3 posts per side
    expect(m.filter((x) => x.kind === 'Beam')).toHaveLength(4)
    const beamLen = 3600 + 140 + 900
    expect(m.find((x) => x.kind === 'Beam')!.len).toBe(beamLen)
    expect(m.filter((x) => x.kind === 'Rafter')).toHaveLength(Math.floor((beamLen - 38) / 400) + 1)
  })
  it('cut list picks fitting stock', () => {
    const rows = cutList(layout(P))
    const post = rows.find((r) => r.kind === 'Post')!
    expect(post.len).toBe(3350)
    expect(post.stock).toBe(3658)
    expect(post.pieces).toBe(6)
    const raf = rows.find((r) => r.kind === 'Rafter')!
    expect(raf.stock).toBeGreaterThanOrEqual(raf.len)
    for (const r of rows) expect(r.pieces * r.stock).toBeGreaterThanOrEqual(r.len * r.qty)
  })
  it('shade and concrete', () => {
    expect(shade({ ...P, slats: false })).toBeCloseTo(38 / 400)
    expect(concrete(4, 1000)).toBeCloseTo(4 * Math.PI * 0.0225)
  })
})
