import { describe, expect, it } from 'vitest'
import { fit, graphemes, measure, PLATFORMS, sms, stats, twitterLength } from './character-limit-checker'

const P = (id: string) => PLATFORMS.find((p) => p.id === id)!

describe('character-limit-checker', () => {
  it('counts grapheme clusters, not code units', () => {
    expect(graphemes('👨‍👩‍👧é🇺🇦')).toHaveLength(3)
    const s = stats('Hi 👋🏽 there')
    expect(s.graphemes).toBe(10)
    expect(s.utf16).toBe(13)
    expect(s.words).toBe(2)
    expect(s.emoji).toBe(1)
  })
  it('weights X posts like twitter-text', () => {
    expect(twitterLength('hello')).toBe(5)
    expect(twitterLength('see https://example.com/a/very/long/path')).toBe(4 + 23)
    expect(twitterLength('日本')).toBe(4)
    expect(twitterLength('👍🏽')).toBe(2)
  })
  it('detects SMS encoding and segments', () => {
    expect(sms('a'.repeat(160))).toMatchObject({ encoding: 'GSM-7', segments: 1 })
    expect(sms('a'.repeat(161))).toMatchObject({ encoding: 'GSM-7', segments: 2, perSegment: 153 })
    expect(sms('€').units).toBe(2)
    expect(sms('Привіт')).toMatchObject({ encoding: 'UCS-2', units: 6, segments: 1 })
    expect(sms('x'.repeat(71) + 'ї').segments).toBe(2)
  })
  it('measures per rule and fits text', () => {
    expect(measure('abc\nabcdef', P('gitbody')).used).toBe(6)
    const long = 'word '.repeat(20).trim()
    const t = fit(long, P('gah'), { words: true, ellipsis: true })
    expect(graphemes(t).length).toBeLessThanOrEqual(30)
    expect(t.endsWith('word…')).toBe(true)
    expect(fit('short', P('gah'))).toBe('short')
  })
})
