import { describe, expect, it } from 'vitest'
import { align, bestShift, downsample, gainFor, schedule, toGray } from './plant-growth-timelapse'

const W = 96, H = 72
const pattern = (x: number, y: number) => 128 + 60 * Math.sin(x * 0.21) * Math.cos(y * 0.17) + 40 * Math.sin((x + 2 * y) * 0.09) + (x > 40 && x < 60 && y > 20 && y < 50 ? 50 : 0)
function img(sx: number, sy: number, bright = 0) {
  const g = new Float32Array(W * H)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) g[y * W + x] = pattern(x - sx, y - sy) + bright
  return g
}

describe('timelapse alignment', () => {
  it('finds a known translation (and ignores a brightness change)', () => {
    const ref = img(0, 0)
    const moved = img(5, -3, 25) // content moved right 5, up 3 → shift back by (-5, +3)
    expect(bestShift(ref, moved, W, H, 8)).toEqual([-5, 3])
    expect(align(ref, moved, W, H, 10)).toEqual([-5, 3])
  })
  it('zero shift for identical frames', () => {
    const ref = img(0, 0)
    expect(align(ref, ref, W, H, 6)).toEqual([0, 0])
  })
  it('gray conversion, downsampling and gain', () => {
    expect(toGray([255, 255, 255, 255, 0, 0, 0, 255], 2, 1)[0]).toBeCloseTo(255, 6)
    const d = downsample(new Float32Array([1, 3, 5, 7]), 2, 2, 2)
    expect(d.g[0]).toBe(4)
    expect(gainFor(120, 100)).toBeCloseTo(1.2, 9)
    expect(gainFor(100, 0)).toBe(1)
  })
  it('schedule with holds and fades', () => {
    const s = schedule(3, 2, 1, 3)
    expect(s.length).toBe(3 * 2 + 2 * 1 + 3)
    expect(s[2]).toEqual({ a: 0, b: 1, t: 0.5 })
    expect(s.at(-1)).toEqual({ a: 2, b: 2, t: 0 })
  })
})
