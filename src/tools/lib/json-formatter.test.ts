import { describe, expect, it } from 'vitest'
import { childPath, format, repair, stats, validate } from './json-formatter'

describe('json-formatter', () => {
  it('accepts valid JSON', () => {
    for (const t of ['{}', '[]', '0', '-1.5e3', '"a\\u00e9"', '{"a":[1,true,null,{"b":"c"}]}', ' \n [ 1 , 2 ] ']) expect(validate(t).ok).toBe(true)
  })
  it('reports errors with positions', () => {
    const e = validate('{\n  "a": 1,\n  "b" 2\n}').error!
    expect(e.line).toBe(3)
    expect(e.col).toBe(7)
    expect(e.msg).toMatch(/Expected ':'/)
    expect(validate('{"a":1,}').error!.msg).toMatch(/Trailing comma/)
    expect(validate('[1,2').error!.msg).toMatch(/Expected ','/)
    expect(validate("{'a':1}").error!.msg).toMatch(/double quotes/)
    expect(validate('{"a":01}').error!.msg).toMatch(/Leading zeros/)
    expect(validate('"abc').error!.msg).toMatch(/Unterminated/)
    expect(validate('[1] x').error!.msg).toMatch(/after the end/)
    expect(validate('').error!.msg).toMatch(/Empty/)
    expect(validate('{"a":NaN}').error!.msg).toMatch(/NaN/)
  })
  it('warns about duplicates and big integers', () => {
    const r = validate('{"a":1,"a":2,"n":12345678901234567890}')
    expect(r.ok).toBe(true)
    expect(r.warnings.length).toBe(2)
  })
  it('repairs JSON-like text', () => {
    const fixed = repair("// config\n{name: 'Ann', tags: ['x', 'y',], ok: True, n: None, /* c */ 'q': \"say \\\"hi\\\"\",}")
    expect(validate(fixed).ok).toBe(true)
    expect(JSON.parse(fixed)).toEqual({ name: 'Ann', tags: ['x', 'y'], ok: true, n: null, q: 'say "hi"' })
  })
  it('formats, sorts and counts', () => {
    expect(format({ b: 1, a: [1] }, 0, true)).toBe('{"a":[1],"b":1}')
    expect(format({ a: 1 }, 2)).toBe('{\n  "a": 1\n}')
    const s = stats({ a: [1, 'x', null, { b: false }] })
    expect(s).toMatchObject({ objects: 2, arrays: 1, keys: 2, depth: 3, numbers: 1, strings: 1, nulls: 1, bools: 1 })
    expect(childPath('$', 'a b')).toBe('$["a b"]')
    expect(childPath('$', 'ok')).toBe('$.ok')
    expect(childPath('$.a', 2)).toBe('$.a[2]')
  })
})
