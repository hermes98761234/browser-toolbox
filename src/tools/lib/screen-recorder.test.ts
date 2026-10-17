import { describe, expect, it } from 'vitest'
import { bytes, clock, extFor, fileName, mbPerMinute, pickMime, rms } from './screen-recorder'

describe('screen-recorder', () => {
  it('picks the first supported mime', () => {
    expect(pickMime((m) => m === 'video/webm')).toBe('video/webm')
    expect(pickMime(() => false)).toBe('')
    expect(extFor('video/mp4;codecs=avc1')).toBe('mp4')
  })
  it('estimates size', () => {
    expect(mbPerMinute(2.5, 128)).toBeCloseTo(19.71, 2)
  })
  it('formats time and bytes', () => {
    expect(clock(75.4)).toBe('1:15')
    expect(clock(3725)).toBe('1:02:05')
    expect(bytes(2097152)).toBe('2.0 MB')
    expect(bytes(2048)).toBe('2 KB')
  })
  it('names files and measures level', () => {
    expect(fileName(new Date(2026, 9, 7, 4, 5, 9))).toBe('screen-2026-10-07_04-05-09.webm')
    expect(rms([128, 128])).toBe(0)
    expect(rms([255, 1])).toBeCloseTo(0.992, 2)
  })
})
