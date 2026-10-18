import { describe, expect, it } from 'vitest'
import { coverage, dropMask, faceToMask, hitTest, maskBox, redact, resizeTo, type Mask } from './face-blur-redactor'

const M: Mask = { id: 'a', cx: 0.5, cy: 0.5, rx: 0.2, ry: 0.3 }

describe('face blur redactor', () => {
  it('computes feathered coverage', () => {
    expect(coverage(50, 50, M, 100, 100, 0.2)).toBe(1)
    expect(coverage(69.9, 50, M, 100, 100, 0)).toBe(1)
    expect(coverage(71, 50, M, 100, 100, 0)).toBe(0)
    const mid = coverage(72, 50, M, 100, 100, 0.2) // d = 1.1 → halfway through the ring
    expect(mid).toBeCloseTo(0.5, 5)
    expect(coverage(75, 50, M, 100, 100, 0.2)).toBe(0)
  })
  it('boxes, drops, resizes and hit-tests', () => {
    expect(maskBox(M, 100, 100)).toEqual({ x: 30, y: 20, w: 40, h: 60 })
    expect(maskBox(M, 100, 100, 0.5)).toEqual({ x: 20, y: 10, w: 60, h: 80 })
    const d = dropMask(200, 100, 400, 200, 0.1, 'x')
    expect(d.cx).toBe(0.5)
    expect(d.ry * 200).toBeCloseTo(20)
    expect(d.rx * 400).toBeCloseTo(16)
    expect(hitTest([M], 50, 50, 100, 100, 5)?.part).toBe('body')
    expect(hitTest([M], 50 + 20 * Math.SQRT1_2, 50 + 30 * Math.SQRT1_2, 100, 100, 5)?.part).toBe('handle')
    expect(hitTest([M], 5, 5, 100, 100, 5)).toBeNull()
    const r = resizeTo(M, 50 + 10 * Math.SQRT1_2, 50 + 10 * Math.SQRT1_2, 100, 100)
    expect(r.rx).toBeCloseTo(0.1)
    expect(r.ry).toBeCloseTo(0.1)
  })
  it('pads detector boxes', () => {
    const m = faceToMask({ x: 40, y: 40, width: 20, height: 20 }, 100, 100, 0.25)
    expect(m.rx).toBeCloseTo(0.125)
    expect(m.cx).toBeCloseTo(0.5)
  })
  it('destroys pixels inside and leaves far pixels alone', () => {
    const W = 40, H = 40
    const data = new Uint8ClampedArray(W * H * 4)
    for (let i = 0; i < W * H; i++) data.set([(i * 37) % 256, (i * 91) % 256, (i * 13) % 256, 255], i * 4)
    const orig = data.slice()
    redact({ data, width: W, height: H }, [{ id: 'm', cx: 0.5, cy: 0.5, rx: 0.25, ry: 0.25 }], { style: 'solid', strength: 0.2, feather: 0.2, color: '#ff0000' })
    const at = (x: number, y: number) => [...data.subarray((y * W + x) * 4, (y * W + x) * 4 + 3)]
    expect(at(20, 20)).toEqual([255, 0, 0])
    expect(at(0, 0)).toEqual([...orig.subarray(0, 3)])
    redact({ data, width: W, height: H }, [{ id: 'm', cx: 0.25, cy: 0.25, rx: 0.2, ry: 0.2 }], { style: 'pixelate', strength: 0.5, feather: 0, color: '#000' })
    expect(at(39, 39)).toEqual([...orig.subarray((39 * W + 39) * 4, (39 * W + 39) * 4 + 3)])
  })
})
