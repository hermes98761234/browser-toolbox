import { describe, expect, it } from 'vitest'
import { applyRule, pipeline, type Rule } from './regex-find-replace'

const R = (find: string, replace: string, flags = 'g', literal = false): Rule => ({ id: 'x', on: true, find, replace, flags, literal })

describe('regex find & replace', () => {
  it('matches native replace for standard tokens', () => {
    const cases: [string, string, string][] = [
      ['2026-10-17 and 2025-01-02', '(\\d{4})-(\\d{2})-(\\d{2})', '$3/$2/$1'],
      ['john smith', '(?<first>\\w+) (?<last>\\w+)', '$<last>, $<first>'],
      ['a.b.c', '\\.', '[$&]'],
      ['cost 5', '(\\d)', '$$$1'],
      ['abc', 'b', "<$`|$'>"],
    ]
    for (const [text, find, rep] of cases) expect(applyRule(text, R(find, rep)).text).toBe(text.replace(new RegExp(find, 'g'), rep))
  })
  it('supports case modifiers and counts', () => {
    const a = applyRule('hello world foo_bar', R('(\\w)(\\w*)', '\\u$1$2'))
    expect(a.text).toBe('Hello World Foo_bar')
    expect(a.count).toBe(3)
    expect(applyRule('snake_case_name', R('_(\\w)', '\\U$1')).text).toBe('snakeCaseName')
    expect(applyRule('Mixed CASE', R('.+', '\\L$&\\E!')).text).toBe('mixed case!')
    expect(applyRule('a,b', R(',', '\\n')).text).toBe('a\nb')
  })
  it('literal mode, errors and pipeline', () => {
    expect(applyRule('1+1=2', R('1+1', '$x', 'g', true)).text).toBe('$x=2')
    expect(applyRule('x', R('(', '')).error).not.toBe('')
    const p = pipeline('  a   b  \n\n\nc  ', [R('[ \\t]+$', '', 'gm'), R(' {2,}', ' '), R('\\n{3,}', '\n\n')])
    expect(p.text).toBe(' a b\n\nc')
    expect(p.counts).toEqual([2, 2, 1])
  })
})
