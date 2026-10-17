import { describe, expect, it } from 'vitest'
import { explain, runRegex } from './regex-tester'

describe('runRegex', () => {
  it('finds global matches with groups and indices', () => {
    const r = runRegex('(?<y>\\d{4})-(\\d{2})', 'g', 'a 2026-10 b 1999-01', null, 100)
    expect(r.hits.map((h) => h.text)).toEqual(['2026-10', '1999-01'])
    expect(r.hits[0].groups).toEqual([{ name: 'y', value: '2026', start: 2, end: 6 }, { name: '', value: '10', start: 7, end: 9 }])
  })
  it('handles empty matches, errors, non-global and replace', () => {
    expect(runRegex('x*', 'g', 'ab', null, 100).hits).toHaveLength(3)
    expect(runRegex('(', 'g', 'ab', null, 100).error).toMatch(/Invalid|Unterminated/)
    expect(runRegex('\\w', '', 'ab', null, 100).hits).toHaveLength(1)
    expect(runRegex('(\\w+)@(\\w+)', 'g', 'me@x you@y', '$2:$1', 100).replaced).toBe('x:me y:you')
    expect(runRegex('a', 'g', 'aaaa', null, 2).truncated).toBe(true)
    expect(runRegex('(?:a)(b)(?=c)', 'g', 'abc', null, 9).hits[0].groups).toHaveLength(1)
  })
})

describe('explain', () => {
  it('describes tokens', () => {
    const t = explain('^(?<user>[\\w.]+)@\\w+\\.com$')
    expect(t.map((x) => x.src)).toEqual(['^', '(?<user>', '[\\w.]', '+', ')', '@', '\\w', '+', '\\.', 'com', '$'])
    expect(t[1].desc).toMatch(/named group “user”/)
    expect(explain('ab{2,3}?')[2].desc).toBe('previous item 2 to 3 times, as few as possible (lazy)')
    expect(explain('ab+').map((x) => x.src)).toEqual(['a', 'b', '+'])
  })
})
