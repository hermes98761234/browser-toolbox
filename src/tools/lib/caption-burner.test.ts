import { describe, expect, it } from 'vitest'
import { activeCues, blockTop, containerOf, coverage, plain, wrap } from './caption-burner'

const cues = [
  { id: '1', start: 0, end: 2, text: 'Hello' },
  { id: '2', start: 1.5, end: 3, text: 'World' },
]
describe('activeCues', () => {
  it('handles overlaps, end exclusive, offset', () => {
    expect(activeCues(cues, 1.6).map((c) => c.id)).toEqual(['1', '2'])
    expect(activeCues(cues, 2).map((c) => c.id)).toEqual(['2'])
    expect(activeCues(cues, 3)).toEqual([])
    expect(activeCues(cues, 3.2, 0.5).map((c) => c.id)).toEqual(['2'])
  })
})
describe('wrap', () => {
  const m = (s: string) => s.length * 10
  it('wraps greedily and keeps hard breaks', () => {
    expect(wrap('one two three four', 100, m)).toEqual(['one two', 'three four'])
    expect(wrap('a\nb c', 1000, m)).toEqual(['a', 'b c'])
    expect(wrap('<i>styled</i> {\\an8}text', 1000, m)).toEqual(['styled text'])
    expect(wrap('superlongword x', 50, m)).toEqual(['superlongword', 'x'])
  })
  it('plain decodes entities', () => expect(plain('a &amp; b')).toBe('a & b'))
})
describe('blockTop', () => {
  it('positions blocks', () => {
    expect(blockTop(2, 50, 1000, 'bottom', 10)).toBe(1000 - 100 - 100 + 25)
    expect(blockTop(2, 50, 1000, 'top', 10)).toBe(125)
    expect(blockTop(2, 50, 1000, 'middle', 10)).toBe(475)
  })
})
describe('misc', () => {
  it('coverage and container', () => {
    expect(coverage(cues, 6)).toEqual({ count: 2, spoken: 3.5, share: 3.5 / 6 })
    expect(containerOf('video/mp4;codecs=avc1.42E01F').ext).toBe('mp4')
    expect(containerOf('video/webm;codecs=vp9,opus').label).toBe('WebM · VP9')
  })
})
