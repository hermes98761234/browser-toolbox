import { describe, expect, it } from 'vitest'
import { bounds, hit, moveItem, simplify, snapAngle, widthAt, type Item } from './interactive-whiteboard'

describe('interactive-whiteboard', () => {
  const pen: Item = { id: 'a', kind: 'pen', color: '#000', size: 4, pts: [0, 0, 0.5, 100, 0, 0.5, 100, 100, 0.5] }
  it('hit-tests strokes, rects and ellipses', () => {
    expect(hit(pen, 50, 3, 2)).toBe(true)
    expect(hit(pen, 50, 30, 2)).toBe(false)
    const r: Item = { id: 'r', kind: 'rect', color: '#000', size: 3, fill: false, x1: 0, y1: 0, x2: 200, y2: 100 }
    expect(hit(r, 100, 1, 2)).toBe(true)
    expect(hit(r, 100, 50, 2)).toBe(false)
    expect(hit({ ...r, fill: true }, 100, 50, 2)).toBe(true)
    const e: Item = { id: 'e', kind: 'ellipse', color: '#000', size: 2, fill: false, x1: 0, y1: 0, x2: 200, y2: 100 }
    expect(hit(e, 200, 50, 2)).toBe(true)
    expect(hit(e, 100, 50, 2)).toBe(false)
  })
  it('moves items and computes bounds', () => {
    const m = moveItem(pen, 10, 20)
    expect(bounds(m)).toEqual({ x: 10, y: 20, w: 100, h: 100 })
  })
  it('simplifies strokes but keeps the ends', () => {
    const pts: number[] = []
    for (let i = 0; i <= 100; i++) pts.push(i * 0.5, 0, 0.5)
    const s = simplify(pts, 2)
    expect(s.length).toBeLessThan(pts.length / 3)
    expect(s.slice(-3)).toEqual([50, 0, 0.5])
  })
  it('pressure widens the line; angle snapping', () => {
    expect(widthAt(4, 1)).toBeGreaterThan(widthAt(4, 0.2))
    const [x, y] = snapAngle(0, 0, 100, 3)
    expect(y).toBeCloseTo(0)
    expect(x).toBeCloseTo(Math.hypot(100, 3))
  })
})
