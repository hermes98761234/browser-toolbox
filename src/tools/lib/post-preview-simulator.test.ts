import { describe, expect, it } from 'vitest'
import { countChars, cropRect, tokens, truncate } from './post-preview-simulator'

describe('countChars', () => {
  it('counts graphemes and weights URLs', () => {
    expect(countChars('héllo 👍🏽')).toBe(7)
    expect(countChars('see https://example.com/a/very/long/path/indeed', 23)).toBe(4 + 23)
  })
})

describe('truncate', () => {
  it('keeps short text', () => expect(truncate('short', 10)).toEqual({ shown: 'short', cut: false }))
  it('cuts at a word boundary', () => expect(truncate('the quick brown fox jumps', 17)).toEqual({ shown: 'the quick brown', cut: true }))
  it('cuts by lines', () => expect(truncate('a\nb\nc\nd', 100, 2)).toEqual({ shown: 'a\nb', cut: true }))
})

describe('cropRect', () => {
  it('centres a square crop in a landscape image', () => expect(cropRect(400, 200, 1)).toEqual({ x: 100, y: 0, w: 200, h: 200 }))
  it('clamps the focus to the image', () => expect(cropRect(400, 200, 1, 0, 0.5)).toEqual({ x: 0, y: 0, w: 200, h: 200 }))
  it('wide crop of a portrait image', () => expect(cropRect(300, 600, 2, 0.5, 1)).toEqual({ x: 0, y: 450, w: 300, h: 150 }))
})

describe('tokens', () => {
  it('finds tags, mentions and urls', () => {
    expect(tokens('Hi @ann see #news at https://x.io').map((t) => t.kind)).toEqual(['text', 'mention', 'text', 'tag', 'text', 'url'])
  })
})
