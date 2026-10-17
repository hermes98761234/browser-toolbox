import { describe, expect, it } from 'vitest'
import { docsToYaml, fixWhitespace, jsonErrorPos, parseYaml, resolvePlain, toYaml, type Json } from './yaml-validator'

const one = (t: string) => {
  const r = parseYaml(t)
  if (!r.ok) throw new Error(JSON.stringify(r.issues))
  return r.docs[0]
}

describe('yaml-validator parser', () => {
  it('resolves core-schema scalars', () => {
    expect(resolvePlain('~')).toBe(null)
    expect(resolvePlain('True')).toBe(true)
    expect(resolvePlain('0x1F')).toBe(31)
    expect(resolvePlain('0o17')).toBe(15)
    expect(resolvePlain('-1.5e3')).toBe(-1500)
    expect(resolvePlain('.inf')).toBe(Infinity)
    expect(resolvePlain('1.2.3')).toBe('1.2.3')
  })

  it('parses nested mappings and sequences', () => {
    const v = one(`name: app
version: 3
tags: [a, "b c", 1]
server:
  host: localhost   # comment
  ports:
    - 80
    - 443
items:
- id: 1
  ok: true
- id: 2
  meta: {x: 1, y: null}
`)
    expect(v).toEqual({
      name: 'app', version: 3, tags: ['a', 'b c', 1],
      server: { host: 'localhost', ports: [80, 443] },
      items: [{ id: 1, ok: true }, { id: 2, meta: { x: 1, y: null } }],
    })
  })

  it('handles block scalars with chomping', () => {
    const v = one(`lit: |
  line 1
  line 2

fold: >
  a
  b

  c
strip: |-
  x
keep: |+
  y

end: 1
`) as Record<string, Json>
    expect(v.lit).toBe('line 1\nline 2\n')
    expect(v.fold).toBe('a b\nc\n')
    expect(v.strip).toBe('x')
    expect(v.keep).toBe('y\n\n')
    expect(v.end).toBe(1)
  })

  it('handles quotes, escapes and multi-line plain scalars', () => {
    const v = one(`a: "tab\\there \\u00e9"
b: 'it''s'
c: this is
  folded text
d: "multi
  line"
`) as Record<string, Json>
    expect(v.a).toBe('tab\there é')
    expect(v.b).toBe("it's")
    expect(v.c).toBe('this is folded text')
    expect(v.d).toBe('multi line')
  })

  it('supports anchors, aliases and merge keys', () => {
    const v = one(`base: &b
  x: 1
  y: 2
derived:
  <<: *b
  y: 3
list: [*b]
`) as Record<string, Json>
    expect(v.derived).toEqual({ x: 1, y: 3 })
    expect(v.list).toEqual([{ x: 1, y: 2 }])
  })

  it('parses nested sequences and multiple documents', () => {
    expect(one('- - a\n  - b\n- c\n')).toEqual([['a', 'b'], 'c'])
    const r = parseYaml('---\na: 1\n---\n- x\n...\n')
    expect(r.docs).toEqual([{ a: 1 }, ['x']])
  })

  it('reports errors with line numbers', () => {
    const bad = parseYaml('a: 1\n  b: 2\n')
    expect(bad.ok).toBe(false)
    expect(bad.issues[0].line).toBe(2)
    const tab = parseYaml('a:\n\tb: 1\n')
    expect(tab.issues[0].message).toMatch(/Tab/)
    const dup = parseYaml('a: 1\na: 2\n')
    expect(dup.ok).toBe(false)
    expect(dup.issues.some((i) => /Duplicate/.test(i.message))).toBe(true)
    expect(parseYaml('a: [1, 2\n').ok).toBe(false)
    expect(parseYaml('a: "open\n').ok).toBe(false)
  })

  it('warns about YAML 1.1 booleans and trailing whitespace', () => {
    const r = parseYaml('country: NO \n')
    expect(r.ok).toBe(true)
    expect(r.issues.map((i) => i.message).join()).toMatch(/Norway/)
    expect(r.issues.map((i) => i.message).join()).toMatch(/Trailing/)
  })
})

describe('yaml-validator emitter', () => {
  const samples: Json[] = [
    { a: 1, b: 'two', c: [1, 2, { d: null, e: [true, false] }], f: {}, g: [], h: '' },
    [[1, 2], [3, [4]], { k: 'v' }],
    { s: 'line1\nline2\n', t: 'x\n', u: 'no newline\nhere', w: 'trailing\n\n' },
    { tricky: ['yes', 'no', '123', '- dash', 'a: b', '#x', ' lead', 'true', 'null', '@at', 'it\'s', 'quote"'] },
    { 'key with space': 1, '1': 'num key', '': 'empty' },
  ]
  for (const [i, s] of samples.entries()) {
    it(`round-trips sample ${i}`, () => {
      for (const ind of [2, 4]) expect(one(toYaml(s, ind))).toEqual(s)
    })
  }
  it('emits readable YAML', () => {
    expect(toYaml({ a: { b: [1, 2] } })).toBe('a:\n  b:\n    - 1\n    - 2\n')
    expect(toYaml([{ a: 1, b: 2 }])).toBe('- a: 1\n  b: 2\n')
    expect(docsToYaml([{ a: 1 }, 2])).toBe('---\na: 1\n---\n2\n')
  })
  it('fixes whitespace and locates JSON errors', () => {
    expect(fixWhitespace('a:\r\n\tb: 1  \n')).toBe('a:\n  b: 1\n')
    expect(jsonErrorPos('{\n  "a": x\n}', 'Unexpected token x at position 9')).toEqual({ line: 2, col: 8 })
  })
})
