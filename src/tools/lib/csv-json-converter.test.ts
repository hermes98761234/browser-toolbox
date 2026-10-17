import { describe, expect, it } from 'vitest'
import { csvToRecords, detectDelimiter, flatten, jsonToRecords, parseCsv, recordsToCsv, recordsToXml, typed, unflatten, xmlName } from './csv-json-converter'

describe('csv', () => {
  it('parses quotes, escaped quotes, newlines and CRLF', () => {
    expect(parseCsv('a,b\r\n"x, y","say ""hi"""\n"multi\nline",3\n')).toEqual([['a', 'b'], ['x, y', 'say "hi"'], ['multi\nline', '3']])
  })
  it('detects delimiters', () => {
    expect(detectDelimiter('a;b;c\n1;2;3')).toBe(';')
    expect(detectDelimiter('a\tb\n1\t2')).toBe('\t')
    expect(detectDelimiter('"x,y";b\n1;2')).toBe(';')
  })
  it('types values', () => {
    expect([typed('42'), typed('-1.5e3'), typed('007'), typed('TRUE'), typed(''), typed('abc')]).toEqual([42, -1500, '007', true, null, 'abc'])
  })
  it('csv → nested records', () => {
    expect(csvToRecords('id,user.name,tags.0\n1,Ann,x', { delim: ',', header: true, typed: true, nest: true })).toEqual([{ id: 1, user: { name: 'Ann' }, tags: ['x'] }])
  })
})

describe('flatten', () => {
  it('round-trips', () => {
    const o = { a: { b: 1, c: [1, { d: 2 }] }, e: 'x' }
    const f = flatten(o)
    expect(f).toEqual({ 'a.b': 1, 'a.c.0': 1, 'a.c.1.d': 2, e: 'x' })
    expect(unflatten(f)).toEqual(o)
  })
  it('joins primitive arrays', () => {
    expect(flatten({ t: ['a', 'b'] }, ';')).toEqual({ t: 'a;b' })
  })
})

describe('output', () => {
  it('json → csv with union columns and escaping', () => {
    const rows = jsonToRecords('{"items":[{"a":1,"b":"x,y"},{"a":2,"c":true}]}')
    expect(recordsToCsv(rows, { delim: ',', header: true, joinArrays: '' })).toBe('a,b,c\n1,"x,y",\n2,,true')
  })
  it('xml output', () => {
    expect(recordsToXml([{ name: 'A&B', 'first name': 'x', tags: ['p', 'q'] }], 'rows', 'row', '')).toBe(
      '<?xml version="1.0" encoding="UTF-8"?><rows><row><name>A&amp;B</name><first_name>x</first_name><tags>p</tags><tags>q</tags></row></rows>',
    )
    expect(xmlName('1st')).toBe('_1st')
  })
})
