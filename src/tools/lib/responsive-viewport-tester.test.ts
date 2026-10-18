import { describe, expect, it } from 'vitest'
import { breakpoint, DEVICES, frameScale, mapScroll, normalizeUrl, oriented } from './responsive-viewport-tester'

describe('responsive-viewport-tester', () => {
  it('normalizes URLs', () => {
    expect(normalizeUrl('example.com')).toBe('https://example.com')
    expect(normalizeUrl('localhost:5173/app')).toBe('http://localhost:5173/app')
    expect(normalizeUrl('http://a.b/c')).toBe('http://a.b/c')
    expect(normalizeUrl('just words')).toBe('')
    expect(normalizeUrl('')).toBe('')
  })
  it('labels breakpoints', () => {
    expect(breakpoint(360)).toBe('xs')
    expect(breakpoint(768)).toBe('md')
    expect(breakpoint(1366)).toBe('xl')
    expect(breakpoint(1920)).toBe('2xl')
  })
  it('rotates only handheld devices', () => {
    const phone = DEVICES[0], laptop = DEVICES.find((d) => d.kind === 'laptop')!
    expect(oriented(phone, true)).toEqual([640, 360])
    expect(oriented(phone, false)).toEqual([360, 640])
    expect(oriented(laptop, false)).toEqual([laptop.w, laptop.h])
  })
  it('scales and maps scroll', () => {
    expect(frameScale(1000, 500, 1)).toBe(0.5)
    expect(frameScale(400, 500, 0.8)).toBe(0.8)
    expect(mapScroll(50, 100, 300)).toBe(150)
    expect(mapScroll(500, 100, 300)).toBe(300)
    expect(mapScroll(10, 0, 300)).toBe(0)
  })
})
