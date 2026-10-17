import { describe, expect, it } from 'vitest'
import { applyRatio, centerCrop, moveRect, outputSize, resizeRect } from './image-cropper'

describe('image-cropper', () => {
  it('centres the largest crop of a ratio', () => {
    expect(centerCrop(1000, 500, 1)).toEqual({ x: 250, y: 0, w: 500, h: 500 })
    expect(centerCrop(1000, 500, 4)).toEqual({ x: 0, y: 125, w: 1000, h: 250 })
  })
  it('re-applies a ratio inside bounds', () => {
    const r = applyRatio({ x: 0, y: 0, w: 400, h: 100 }, 1, 1000, 1000)
    expect(r.w).toBeCloseTo(200)
    expect(r.h).toBeCloseTo(200)
    expect(r.x).toBeCloseTo(100)
    expect(r.y).toBe(0)
  })
  it('moves within the image', () => {
    expect(moveRect({ x: 10, y: 10, w: 100, h: 100 }, 1000, -50, 500, 500)).toEqual({ x: 400, y: 0, w: 100, h: 100 })
  })
  it('resizes with and without ratio', () => {
    expect(resizeRect({ x: 0, y: 0, w: 100, h: 100 }, 'se', 50, 0, 1, 1000, 1000)).toEqual({ x: 0, y: 0, w: 150, h: 150 })
    expect(resizeRect({ x: 0, y: 0, w: 100, h: 100 }, 'se', 5000, 0, 1, 1000, 300)).toEqual({ x: 0, y: 0, w: 300, h: 300 })
    expect(resizeRect({ x: 100, y: 100, w: 100, h: 100 }, 'nw', 20, 20, null, 1000, 1000)).toEqual({ x: 120, y: 120, w: 80, h: 80 })
    const e = resizeRect({ x: 100, y: 100, w: 160, h: 90 }, 'e', 160, 0, 16 / 9, 1000, 1000)
    expect(e.w).toBeCloseTo(320)
    expect(e.h).toBeCloseTo(180)
    expect(e.y).toBeCloseTo(55)
  })
  it('computes output size', () => {
    expect(outputSize({ x: 0, y: 0, w: 4000, h: 2000 }, null, 2000)).toEqual([2000, 1000])
    expect(outputSize({ x: 0, y: 0, w: 400, h: 200 }, [1080, 1080], 0)).toEqual([1080, 1080])
  })
})
