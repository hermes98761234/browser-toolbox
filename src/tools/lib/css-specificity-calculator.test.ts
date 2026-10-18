import { describe, expect, it } from 'vitest'
import { breakdown, cmp, extractSelectors, parseSelectorList, SelectorError, specificity, splitList, type Spec } from './css-specificity-calculator'

const sp = (s: string): Spec => specificity(parseSelectorList(s)[0])

describe('specificity basics (Selectors 4 examples)', () => {
  it.each([
    ['*', [0, 0, 0]],
    ['li', [0, 0, 1]],
    ['ul li', [0, 0, 2]],
    ['ul ol+li', [0, 0, 3]],
    ['h1 + *[rel=up]', [0, 1, 1]],
    ['ul ol li.red', [0, 1, 3]],
    ['li.red.level', [0, 2, 1]],
    ['#x34y', [1, 0, 0]],
    ['#s12:not(FOO)', [1, 0, 1]],
    ['.foo :is(.bar, #baz)', [1, 1, 0]],
    ['a:hover::before', [0, 1, 2]],
    ['a:hover:before', [0, 1, 2]],
    ['p::first-line', [0, 0, 2]],
    ['svg|circle', [0, 0, 1]],
    ['*|*', [0, 0, 0]],
    ['[data-x="a b" i]', [0, 1, 0]],
    ['button:not([disabled]):focus-visible', [0, 2, 1]],
  ] as [string, Spec][])('%s → %j', (sel, exp) => expect(sp(sel)).toEqual(exp))
})

describe('functional pseudo-classes', () => {
  it(':where is zero, :is/:not/:has take the max argument', () => {
    expect(sp(':where(#a, .b) p')).toEqual([0, 0, 1])
    expect(sp(':is(p, .x, #y)')).toEqual([1, 0, 0])
    expect(sp(':not(.a, div.b)')).toEqual([0, 1, 1])
    expect(sp('article:has(> img, figure .caption)')).toEqual([0, 1, 2])
    expect(sp(':is(:not(#a), .b)')).toEqual([1, 0, 0])
  })
  it(':nth-child(An+B of S) adds the most specific S', () => {
    expect(sp('li:nth-child(2n+1)')).toEqual([0, 1, 1])
    expect(sp('li:nth-child(2n of .important, #top)')).toEqual([1, 1, 1])
    expect(sp('tr:nth-last-child(odd of :not(.hidden))')).toEqual([0, 2, 1])
    expect(() => parseSelectorList('li:nth-child(foo)')).toThrow(SelectorError)
  })
  it('other functional pseudo-classes count as one class', () => {
    expect(sp(':lang(en)')).toEqual([0, 1, 0])
    expect(sp(':dir(rtl) p')).toEqual([0, 1, 1])
    expect(sp('::slotted(span.x)')).toEqual([0, 1, 2])
    expect(sp(':host(.dark)')).toEqual([0, 2, 0])
  })
  it(':is is forgiving, :not is not', () => {
    expect(sp(':is(.ok, 1bad%, #id)')).toEqual([1, 0, 0])
    expect(() => parseSelectorList(':not(.a, %)')).toThrow(SelectorError)
  })
})

describe('parsing', () => {
  it('splits lists and records combinators', () => {
    const l = parseSelectorList('nav > ul li + li ~ a, .x || td, a')
    expect(l).toHaveLength(3)
    expect(l[0].combinators).toEqual(['>', ' ', '+', '~'])
    expect(l[1].combinators).toEqual(['||'])
  })
  it('handles escapes and comments', () => {
    expect(sp('.md\\:flex')).toEqual([0, 1, 0])
    expect(sp('#\\31 23')).toEqual([1, 0, 0])
    expect(sp('div /* c */ > p')).toEqual([0, 0, 2])
  })
  it('rejects invalid selectors with a position', () => {
    for (const bad of ['div >', '.', '#', 'a[href', 'p.x span]', ':is(a', 'a, ,b', '.a#']) expect(() => parseSelectorList(bad), bad).toThrow(SelectorError)
    try { parseSelectorList('div ! p') } catch (e) { expect((e as SelectorError).pos).toBe(4) }
  })
  it('type selectors must come first', () => {
    expect(() => parseSelectorList('.a div')).not.toThrow()
    expect(() => parseSelectorList('.adiv')).not.toThrow()
  })
  it('breakdown explains each part', () => {
    const b = breakdown(parseSelectorList('a#x.y:where(.z)')[0])
    expect(b.map((p) => p.kind)).toEqual(['type', 'id', 'class', 'pseudo-class'])
    expect(b[3].spec).toEqual([0, 0, 0])
  })
})

describe('comparison & stylesheet extraction', () => {
  it('compares column by column', () => {
    expect(cmp([1, 0, 0], [0, 99, 99])).toBeGreaterThan(0)
    expect(cmp([0, 2, 0], [0, 1, 50])).toBeGreaterThan(0)
    expect(cmp([0, 1, 1], [0, 1, 1])).toBe(0)
  })
  it('splitList ignores commas inside parens and strings', () => {
    expect(splitList('a, :is(b, c), [x=","]')).toEqual(['a', ':is(b, c)', '[x=","]'])
  })
  it('extracts selectors from nested CSS, skipping keyframes', () => {
    const css = `/* hi, there */\n.a, .b { color: red }\n@media (min-width: 600px) {\n  #main > p { margin: 0 }\n}\n@keyframes spin { from { x: 1 } 50% { x: 2 } to { x: 3 } }\n.card { & .title { font-weight: 700 } }`
    const got = extractSelectors(css)
    expect(got.map((g) => g.selector)).toEqual(['.a', '.b', '#main > p', '.card', '& .title'])
    expect(got[2].line).toBe(4)
    expect(got[2].context).toBe('@media (min-width: 600px)')
  })
})
