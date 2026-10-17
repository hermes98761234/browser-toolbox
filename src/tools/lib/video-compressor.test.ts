import { describe, expect, it } from 'vitest'
import { autoHeight, bpp, grade, kbpsForCrf, kbpsForTarget, scaleTo, sizeFor } from './video-compressor'

describe('video compressor planning', () => {
  it('computes bitrate for a target size', () => {
    // 25 MB in 120 s with 96 kbps audio and 4 % overhead: 25e6*8*0.96/120/1000 = 1600 kbps total
    expect(kbpsForTarget(25e6, 120, 96)).toBe(1504)
    expect(kbpsForTarget(25e6, 0, 96)).toBe(0)
    expect(sizeFor(1504, 96, 120)).toBeCloseTo(25e6, -3)
  })
  it('scales to even sizes without upscaling', () => {
    expect(scaleTo(1920, 1080, 720)).toEqual([1280, 720])
    expect(scaleTo(1080, 1920, 480)).toEqual([270, 480])
    expect(scaleTo(640, 360, 1080)).toEqual([640, 360])
  })
  it('picks a sensible resolution', () => {
    // 1500 kbps at 30 fps: 1080p = 0.024 bpp (too low), 720p = 0.054 → 720
    expect(autoHeight(1500, 1920, 1080, 30)).toBe(720)
    expect(autoHeight(8000, 1920, 1080, 30)).toBe(1080)
    expect(autoHeight(50, 1920, 1080, 30)).toBe(144)
    expect(bpp(1000, 1000, 100, 10)).toBe(1)
  })
  it('maps CRF to bitrate', () => {
    expect(kbpsForCrf(23, 1280, 720, 30)).toBe(2765)
    expect(kbpsForCrf(29, 1280, 720, 30)).toBe(1382)
    expect(grade(0.1)[0]).toBe('Excellent')
    expect(grade(0.01)[1]).toBe('bad')
  })
})
