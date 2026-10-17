import { describe, expect, it } from 'vitest'
import { DEFAULT_OPTS, process } from './duplicate-line-remover'

const o = DEFAULT_OPTS

describe('duplicate-line-remover', () => {
  it('dedupes keeping first order', () => {
    const r = process('b\na\nb\n\nc\na\n', o)
    expect(r.output).toBe('b\na\nc')
    expect(r.total).toBe(5)
    expect(r.removed).toBe(2)
    expect(r.dupGroups).toBe(2)
  })
  it('trim and case options', () => {
    expect(process(' A\na ', { ...o, ignoreCase: true }).output).toBe('A')
    expect(process(' A\na ', o).output).toBe('A\na')
    expect(process('x  y\nx y', { ...o, collapseSpaces: true }).output).toBe('x  y')
  })
  it('keep last, modes and sorts', () => {
    expect(process('a\nb\na', { ...o, keep: 'last' }).output).toBe('b\na')
    expect(process('a\nb\na', { ...o, mode: 'duplicates' }).output).toBe('a')
    expect(process('a\nb\na', { ...o, mode: 'uniques' }).output).toBe('b')
    expect(process('a\nb\na', { ...o, mode: 'count', sort: 'count' }).output).toBe('2\ta\n1\tb')
    expect(process('item10\nitem2\nitem1', { ...o, sort: 'natural' }).output).toBe('item1\nitem2\nitem10')
    expect(process('item10\nitem2', { ...o, sort: 'az' }).output).toBe('item10\nitem2')
  })
})
