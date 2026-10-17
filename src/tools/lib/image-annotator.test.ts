import { describe, expect, it } from 'vitest'
import { arrowHead, bounds, hit, move, nextStep, pixelate, segDist, type Shape } from './image-annotator'

const sh = (p: Partial<Shape>): Shape => ({ id: 'a', kind: 'rect', x1: 10, y1: 10, x2: 110, y2: 60, color: '#f00', width: 4, ...p })

describe('image-annotator', () => {
  it('measures distance to segments', () => {
    expect(segDist(5, 5, 0, 0, 10, 0)).toBe(5)
    expect(segDist(-3, 4, 0, 0, 10, 0)).toBe(5)
  })
  it('hit-tests outlines, lines and fills', () => {
    const r = sh({})
    expect(hit(r, 10, 30, 3)).toBe(true) // on the left edge
    expect(hit(r, 60, 35, 3)).toBe(false) // hollow centre
    expect(hit(sh({ kind: 'pixelate' }), 60, 35, 3)).toBe(true)
    expect(hit(sh({ kind: 'arrow', x1: 0, y1: 0, x2: 100, y2: 100 }), 50, 52, 3)).toBe(true)
    expect(hit(sh({ kind: 'ellipse', x1: 0, y1: 0, x2: 100, y2: 50 }), 100, 25, 2)).toBe(true)
    expect(hit(sh({ kind: 'ellipse', x1: 0, y1: 0, x2: 100, y2: 50 }), 50, 25, 2)).toBe(false)
  })
  it('normalises bounds and moves shapes', () => {
    expect(bounds(sh({ x1: 50, x2: 10 }))).toEqual({ x: 10, y: 10, w: 40, h: 50 })
    const m = move(sh({ kind: 'pen', pts: [[0, 0], [5, 5]] }), 2, 3)
    expect(m.pts).toEqual([[2, 3], [7, 8]])
    expect(bounds(m)).toEqual({ x: 2, y: 3, w: 5, h: 5 })
  })
  it('builds arrowheads at the tip', () => {
    const h = arrowHead(0, 0, 100, 0, 4)
    expect(h[0]).toEqual([100, 0])
    expect(h[1][0]).toBeLessThan(100)
    expect(h[1][1]).toBeCloseTo(-h[2][1])
  })
  it('pixelates by block averages', () => {
    const d = new Uint8ClampedArray([0, 0, 0, 255, 100, 100, 100, 255, 200, 0, 0, 255, 0, 0, 0, 255])
    pixelate(d, 2, 2, 2)
    expect([...d.slice(0, 4)]).toEqual([75, 25, 25, 255])
    expect([...d.slice(12, 16)]).toEqual([75, 25, 25, 255])
  })
  it('numbers steps', () => {
    expect(nextStep([sh({ kind: 'step', n: 2 }), sh({ kind: 'step', n: 5 })])).toBe(6)
    expect(nextStep([])).toBe(1)
  })
})
