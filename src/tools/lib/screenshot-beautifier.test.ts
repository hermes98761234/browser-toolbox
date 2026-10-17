import { describe, expect, it } from 'vitest'
import { gradientLine, layout } from './screenshot-beautifier'

describe('screenshot-beautifier layout', () => {
  it('pads and adds bar', () => {
    expect(layout(800, 600, 50, 'mac')).toEqual({ W: 900, H: 734, x: 50, y: 50, w: 800, h: 634, bar: 34 })
  })
  it('forces aspect ratio', () => {
    const l = layout(800, 600, 50, 'none', 16 / 9)
    expect(l.H).toBe(700)
    expect(l.W).toBe(1244)
    expect(l.x).toBe(222)
    const sq = layout(1000, 400, 0, 'none', 1)
    expect([sq.W, sq.H, sq.y]).toEqual([1000, 1000, 300])
  })
  it('gradient line spans the box', () => {
    const [x0, y0, x1, y1] = gradientLine(90, 200, 100)
    expect([x0, y0, x1, y1].map((v) => Math.round(v))).toEqual([0, 50, 200, 50])
    const d = gradientLine(180, 200, 100).map((v) => Math.round(v) + 0)
    expect(d).toEqual([100, 0, 100, 100])
  })
})
