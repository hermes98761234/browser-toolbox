import { describe, expect, it } from 'vitest'
import { analyze, duration, graphemes, syllables, words } from './word-counter-pro'

describe('word counter', () => {
  it('counts words with the segmenter', () => {
    expect(words("Hello, world! It's a fine-day.")).toHaveLength(6)
    expect(words('  ')).toHaveLength(0)
    expect(words('Привіт світе')).toHaveLength(2)
  })
  it('counts graphemes, not code units', () => {
    expect(graphemes('👍🏽a')).toBe(2)
    expect(graphemes('é')).toBe(1)
  })
  it('analyzes text', () => {
    const t = analyze('The cat sat on the mat. The cat was happy!\n\nA new paragraph here.')
    expect(t.words).toBe(14)
    expect(t.sentences).toBe(3)
    expect(t.paragraphs).toBe(2)
    expect(t.unique).toBe(11)
    expect(t.keywords[0]).toMatchObject({ word: 'cat', count: 2 })
    expect(t.flesch).toBeGreaterThan(80)
  })
  it('estimates syllables', () => {
    expect(syllables('cat')).toBe(1)
    expect(syllables('happy')).toBe(2)
    expect(syllables('reading')).toBe(2)
    expect(syllables('make')).toBe(1)
  })
  it('formats durations', () => {
    expect(duration(0.5)).toBe('30 s')
    expect(duration(3.25)).toBe('3 min 15 s')
    expect(duration(75)).toBe('1 h 15 min')
  })
})
