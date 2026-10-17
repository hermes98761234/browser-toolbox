import { describe, expect, it } from 'vitest'
import { applyCase, applyVars, count, decode, expand, parse, parseVars, tidy } from './ad-copy-variants'

describe('ad-copy-variants', () => {
  it('parses and counts nested spintax', () => {
    const { seq, error } = parse('{Save|Get} {10|20}% {today|{this|next} week}')
    expect(error).toBe('')
    expect(count(seq)).toBe(2 * 2 * 3)
    const all = expand(seq, 100)
    expect(all).toHaveLength(12)
    expect(all).toContain('Get 20% next week')
  })
  it('decodes every index to a distinct variant', () => {
    const { seq } = parse('{a|b|c}{1|2}')
    expect(Array.from({ length: 6 }, (_, k) => decode(seq, k)).sort()).toEqual(['a1', 'a2', 'b1', 'b2', 'c1', 'c2'])
  })
  it('handles escapes, empty options and errors', () => {
    expect(expand(parse('Price \\{low\\} {great |}deal!').seq, 10).sort()).toEqual(['Price {low} deal!', 'Price {low} great deal!'])
    expect(parse('{a|b').error).toMatch(/closing/)
    expect(parse('a}b').error).toMatch(/Unexpected/)
    expect(tidy('Hello  world , ok')).toBe('Hello world, ok')
  })
  it('samples uniformly without duplicates when huge', () => {
    const { seq } = parse('{a|b|c|d|e|f|g|h|i|j}'.repeat(6))
    expect(count(seq)).toBe(1e6)
    const s = expand(seq, 200, 42)
    expect(s.length).toBe(200)
    expect(new Set(s).size).toBe(200)
  })
  it('applies variables and case', () => {
    expect(applyVars('Try {{Brand}} {{ x }}', parseVars('brand = Acme\nfoo=bar'))).toBe('Try Acme {{ x }}')
    expect(applyCase('save big on the best shoes in town', 'title')).toBe('Save Big on the Best Shoes in Town')
    expect(applyCase('iPhone deals', 'title')).toBe('iPhone Deals')
  })
})
