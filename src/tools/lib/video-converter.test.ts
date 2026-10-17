import { describe, expect, it } from 'vitest'
import { clock, estimateBytes, outSize, placeRect, suggestKbps } from './video-converter'

describe('video-converter', () => {
  it('output sizes', () => {
    expect(outSize(1920, 1080, 720, 'orig')).toEqual([1280, 720])
    expect(outSize(1920, 1080, 0, 'orig')).toEqual([1920, 1080])
    expect(outSize(1920, 1080, 720, '9:16')).toEqual([720, 1280])
    expect(outSize(1920, 1080, 1080, '1:1')).toEqual([1080, 1080])
    expect(outSize(641, 361, 0, 'orig')).toEqual([642, 362])
  })
  it('places frames', () => {
    expect(placeRect(1920, 1080, 1080, 1080, 'contain')).toEqual([0, 236.25, 1080, 607.5])
    const [x, y, w, h] = placeRect(1920, 1080, 1080, 1080, 'cover')
    expect([Math.round(x), y, Math.round(w), h]).toEqual([-420, 0, 1920, 1080])
  })
  it('estimates', () => {
    expect(estimateBytes(2000, 128, 60)).toBe(15_960_000)
    expect(suggestKbps(1280, 720, 30)).toBe(2750)
    expect(clock(75.25)).toBe('1:15.3')
  })
})
