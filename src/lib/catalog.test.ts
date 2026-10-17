import { describe, expect, it } from 'vitest'
import { DEFAULT_FILTERS, filterTools, filtersToQuery, kindOf, pageList, paginate, queryToFilters, roundRobin } from './catalog'
import { CAT_STYLE, CATS, TOOLS } from './data'

const none = { fav: [], recent: [] }

describe('catalog', () => {
  it('has 1000 tools in 40 categories with unique slugs', () => {
    expect(TOOLS).toHaveLength(1000)
    expect(CATS).toHaveLength(40)
    expect(new Set(TOOLS.map((t) => t.slug)).size).toBe(1000)
    for (const c of CATS) expect(CAT_STYLE[c.id], c.name).toBeTruthy()
  })
  it('classifies tool types from names', () => {
    expect(kindOf('Compound Interest Calculator')).toBe('calculator')
    expect(kindOf('Expense Tracker')).toBe('tracker')
    expect(kindOf('Offline Currency Converter')).toBe('converter')
    expect(kindOf('Pomodoro Timer')).toBe('timer')
    const kinds = new Set(TOOLS.map((t) => t.kind))
    expect(kinds.size).toBeGreaterThanOrEqual(10)
  })
  it('round-trips filters through the query string', () => {
    const f = { ...DEFAULT_FILTERS, q: 'pdf', cat: 12, kind: 'editor' as const, dim: '3D' as const, status: 'ready' as const, page: 3, sort: 'az' as const }
    expect(queryToFilters(filtersToQuery(f))).toEqual(f)
    expect(filtersToQuery(DEFAULT_FILTERS)).toBe('')
  })
  it('filters by category, dimension, search and status', () => {
    const ready = (s: string) => s === 'expense-tracker'
    expect(filterTools(TOOLS, { ...DEFAULT_FILTERS, cat: 1 }, ready, none).every((t) => t.cat === 1)).toBe(true)
    expect(filterTools(TOOLS, { ...DEFAULT_FILTERS, dim: '3D' }, ready, none).every((t) => t.dim === '3D')).toBe(true)
    expect(filterTools(TOOLS, { ...DEFAULT_FILTERS, q: 'mortgage' }, ready, none).map((t) => t.slug)).toContain('mortgage-comparison-tool')
    expect(filterTools(TOOLS, { ...DEFAULT_FILTERS, status: 'ready' }, ready, none).map((t) => t.slug)).toEqual(['expense-tracker'])
    expect(filterTools(TOOLS, DEFAULT_FILTERS, ready, none)[0].slug).toBe('expense-tracker')
  })
  it('mixes categories in featured order', () => {
    const rr = roundRobin(TOOLS)
    expect(rr).toHaveLength(1000)
    expect(rr[0].cat).not.toBe(rr[1].cat)
  })
  it('paginates 50 per page', () => {
    const { items, pages } = paginate(TOOLS, 2)
    expect(items).toHaveLength(50)
    expect(pages).toBe(20)
    expect(pageList(10, 20)).toEqual([1, 0, 8, 9, 10, 11, 12, 0, 20])
  })
})
