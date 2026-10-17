import { describe, expect, it } from 'vitest'
import { bbox, buildDieline, cutFold, dielineSvg, easeFold, polyArea, validate, type Params } from './packaging-dieline-folder'

const P: Params = { style: 'rte', W: 60, D: 40, H: 100, glue: 15, tuck: 15, dust: 25 }

describe('packaging dieline', () => {
  it('builds a reverse tuck end with 13 panels', () => {
    const d = buildDieline(P)
    expect(d.length).toBe(13)
    expect(d.find((p) => p.id === 'closeTop')!.parent).toBe('back')
    expect(d.find((p) => p.id === 'closeBottom')!.parent).toBe('front')
    expect(buildDieline({ ...P, style: 'ste' }).find((p) => p.id === 'closeBottom')!.parent).toBe('back')
    expect(buildDieline({ ...P, style: 'sleeve' }).length).toBe(5)
  })
  it('has the expected flat size', () => {
    const b = bbox(buildDieline(P))
    expect(b.w).toBeCloseTo(2 * 40 + 2 * 60 + 15)
    expect(b.h).toBeCloseTo(100 + 2 * (40 + 15))
  })
  it('every child hinge is a fold line', () => {
    const d = buildDieline(P)
    const { fold, cut } = cutFold(d)
    expect(fold.length).toBe(d.length - 1)
    expect(cut.length).toBeGreaterThan(20)
  })
  it('board area is the sum of panel areas', () => {
    const d = buildDieline({ ...P, style: 'sleeve' })
    const walls = d.filter((p) => p.id !== 'glue').reduce((a, p) => a + polyArea(p.poly), 0)
    expect(walls).toBeCloseTo(2 * (60 + 40) * 100)
  })
  it('fold phases ease 0 → 1', () => {
    expect(easeFold(0, [0.2, 0.4])).toBe(0)
    expect(easeFold(0.3, [0.2, 0.4])).toBeCloseTo(0.5)
    expect(easeFold(1, [0.2, 0.4])).toBe(1)
  })
  it('validates inputs and writes SVG in mm', () => {
    expect(validate(P)).toEqual([])
    expect(validate({ ...P, dust: 40 }).length).toBe(1)
    const svg = dielineSvg(buildDieline(P), P)
    expect(svg).toContain('width="235.0mm"')
    expect(svg).toContain('class="fold"')
  })
})
