import { describe, expect, it } from 'vitest'
import { applyCombine, applyExplode, applyExtract, applySplit, fillTemplate, parseTemplate, run, splitValue, toTable } from './column-splitter'

const o = { sep: ',', regex: false, max: 0, fromRight: false, trim: true }
const t = toTable([['Name', 'Address'], ['Jane Doe', '12 Elm St, Springfield, IL 62704'], ['Li Wei', 'Main 5, Oslo']], true)

describe('splitValue', () => {
  it('splits plain, limited, from right, regex', () => {
    expect(splitValue('a, b, c', o)).toEqual(['a', 'b', 'c'])
    expect(splitValue('a,b,c,d', { ...o, max: 2 })).toEqual(['a', 'b,c,d'])
    expect(splitValue('a,b,c,d', { ...o, max: 2, fromRight: true })).toEqual(['a,b,c', 'd'])
    expect(splitValue('a1b22c', { ...o, sep: '\\d+', regex: true })).toEqual(['a', 'b', 'c'])
    expect(splitValue('x\ty', { ...o, sep: '\\t' })).toEqual(['x', 'y'])
    expect(splitValue('abc', { ...o, sep: '' })).toEqual(['abc'])
  })
})

describe('applySplit', () => {
  it('creates padded columns with names', () => {
    const r = applySplit(t, 'Address', o, 'Street, City, State')
    expect(r.header).toEqual(['Name', 'Street', 'City', 'State'])
    expect(r.rows[1]).toEqual(['Li Wei', 'Main 5', 'Oslo', ''])
  })
  it('keeps the original and right-aligns', () => {
    const r = applySplit(t, 'Name', { ...o, sep: ' ', fromRight: true, max: 2 }, '', true)
    expect(r.header).toEqual(['Name', 'Name_1', 'Name_2', 'Address'])
    expect(r.rows[0].slice(1, 3)).toEqual(['Jane', 'Doe'])
  })
  it('throws for a missing column', () => expect(() => applySplit(t, 'Nope', o)).toThrow(/not found/))
})

describe('explode / extract / combine', () => {
  it('explodes into rows', () => {
    const tt = toTable([['id', 'tags'], ['1', 'a;b'], ['2', '']], true)
    const r = applyExplode(tt, 'tags', { ...o, sep: ';' })
    expect(r.rows).toEqual([['1', 'a'], ['1', 'b'], ['2', '']])
  })
  it('extracts named groups', () => {
    const r = applyExtract(t, 'Address', '(?<state>[A-Z]{2}) (?<zip>\\d{5})')
    expect(r.header).toEqual(['Name', 'Address', 'state', 'zip'])
    expect(r.rows[0].slice(2)).toEqual(['IL', '62704'])
    expect(r.rows[1].slice(2)).toEqual(['', ''])
    expect(() => applyExtract(t, 'Address', '\\d+')).toThrow(/capture/)
  })
  it('templates with clean separators', () => {
    const tp = parseTemplate('<{A}, {B} - {C}>{{x}}')
    expect(tp.fields).toEqual(['A', 'B', 'C'])
    const get = (v: Record<string, string>) => (f: string) => v[f] ?? ''
    expect(fillTemplate(tp, get({ A: '1', B: '2', C: '3' }), true)).toBe('<1, 2 - 3>{x}')
    expect(fillTemplate(tp, get({ A: '', B: '2', C: '3' }), true)).toBe('<2 - 3>{x}')
    expect(fillTemplate(tp, get({ A: '1', B: '', C: '3' }), true)).toBe('<1 - 3>{x}')
    expect(fillTemplate(tp, get({ A: '1', B: '', C: '3' }), false)).toBe('<1,  - 3>{x}')
  })
  it('combine and pipeline', () => {
    const r = applyCombine(t, '{Name} <{Address}>', 'Label', true, true)
    expect(r.header).toEqual(['Label'])
    const p = run(t, [
      { kind: 'split', col: 'Name', o: { ...o, sep: ' ' }, names: 'First,Last', keep: false },
      { kind: 'combine', template: '{Last}, {First}', name: 'Sort name', clean: true, drop: false },
      { kind: 'split', col: 'Missing', o, names: '', keep: false },
    ])
    expect(p.table.rows[0][3]).toBe('Doe, Jane')
    expect(p.errors).toEqual([null, null, 'Column "Missing" not found'])
  })
})
