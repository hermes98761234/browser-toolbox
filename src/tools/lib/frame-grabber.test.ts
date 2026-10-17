import { describe, expect, it } from 'vitest'
import { batchTimes, clock, frameAt, frameName, outSize, seekTime, timecode } from './frame-grabber'

describe('frame grabber maths', () => {
  it('frames and seek targets round-trip', () => {
    for (const fps of [24, 25, 29.97, 30, 60]) for (const n of [0, 1, 7, 123]) expect(frameAt(seekTime(n, fps), fps)).toBe(n)
  })
  it('timecode', () => {
    expect(timecode(0, 30)).toBe('00:00:00:00')
    expect(timecode(seekTime(30 * 75 + 12, 30), 30)).toBe('00:01:15:12')
    expect(clock(65.4321)).toBe('1:05.432')
    expect(clock(3725)).toBe('1:02:05.000')
  })
  it('batch schedules', () => {
    const s = batchTimes(0, 4, 'seconds', 1, 30)
    expect(s.map((t) => frameAt(t, 30))).toEqual([0, 30, 60, 90, 120])
    expect(batchTimes(0, 1, 'frames', 10, 30).map((t) => frameAt(t, 30))).toEqual([0, 10, 20, 30])
    const c = batchTimes(2, 6, 'count', 5, 25)
    expect(c.map((t) => frameAt(t, 25))).toEqual([50, 75, 100, 125, 150])
    expect(batchTimes(0, 100, 'frames', 1, 30, 50)).toHaveLength(50)
    expect(batchTimes(0, 5, 'seconds', 0, 30)).toEqual([])
  })
  it('names and sizes', () => {
    expect(frameName('My clip (1).mp4', 4.1, 30, 'png')).toBe('My_clip_1__f000123_00m04s100.png')
    expect(outSize(1920, 1080, 1280)).toEqual([1280, 720])
    expect(outSize(640, 360, 1280)).toEqual([640, 360])
  })
})
