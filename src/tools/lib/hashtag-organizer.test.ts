import { describe, expect, it } from 'vitest'
import { charCount, extractTags, formatTags, mulberry32, pickRotation, shuffle, tagIssues } from './hashtag-organizer'

describe('hashtags', () => {
  it('extracts from captions and lists', () => {
    expect(extractTags('Sunset walk #Travel #travel #beach_life, #café!! #2024')).toEqual(['Travel', 'beach_life', 'café', '2024'])
    expect(extractTags('food, foodie\nyummy  food')).toEqual(['food', 'foodie', 'yummy'])
    expect(extractTags('#київ #Київ')).toEqual(['київ'])
  })
  it('flags issues', () => {
    expect(tagIssues('2024')).toContain('numbers only — will not link')
    expect(tagIssues('travel')).toEqual([])
  })
  it('formats', () => {
    expect(formatTags(['a', 'b'], 'space')).toBe('#a #b')
    expect(formatTags(['a', 'b'], 'line')).toBe('#a\n#b')
    expect(formatTags(['a'], 'dots')).toBe('.\n.\n.\n#a')
    expect(charCount('#café 😀')).toBe(7)
  })
  it('rotates least-used first', () => {
    const r = mulberry32(1)
    const tags = ['a', 'b', 'c', 'd']
    const picked = pickRotation(tags, { a: 3, b: 0, c: 1, d: 0 }, 2, r)
    expect(picked.slice().sort()).toEqual(['b', 'd'])
    expect(pickRotation(tags, {}, 9, r)).toHaveLength(4)
    expect(shuffle([1, 2, 3, 4, 5], mulberry32(7)).sort()).toEqual([1, 2, 3, 4, 5])
  })
})
