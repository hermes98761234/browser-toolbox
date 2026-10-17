import { describe, expect, it } from 'vitest'
import { cleanText, segments, speakSeconds, wordAt, wordCount } from './text-to-speech-reader'

describe('text-to-speech-reader', () => {
  it('splits sentences with offsets', () => {
    const t = 'Hello there. Mr. Smith arrived at 5 p.m. today! Did he? Yes.\nNew line'
    const s = segments(t)
    expect(s.map((x) => x.text)).toEqual(['Hello there.', 'Mr. Smith arrived at 5 p.m. today!', 'Did he?', 'Yes.', 'New line'])
    for (const x of s) expect(t.slice(x.start, x.end)).toBe(x.text)
  })
  it('splits very long sentences', () => {
    const t = Array.from({ length: 60 }, (_, i) => `word${i}`).join(', ') + '.'
    const s = segments(t, 100)
    expect(s.length).toBeGreaterThan(3)
    for (const x of s) { expect(x.text.length).toBeLessThanOrEqual(100); expect(t.slice(x.start, x.end)).toBe(x.text) }
  })
  it('finds words and counts', () => {
    const t = 'Alice’s rabbit ran.'
    expect(wordAt(t, 2)).toEqual([0, 7])
    expect(wordAt(t, 9)).toEqual([8, 14])
    expect(wordCount(t)).toBe(3)
    expect(speakSeconds(165)).toBeCloseTo(60)
    expect(speakSeconds(165, 2)).toBeCloseTo(30)
  })
  it('cleans markup', () => {
    expect(cleanText('# Title\nSome **bold** and [link](http://x).', 'md')).toBe('Title.\nSome bold and link.')
    expect(cleanText('<p>Hi &amp; bye</p><script>x()</script>', 'html')).toBe('Hi & bye')
  })
})
