import { describe, expect, it } from 'vitest'
import { classify, groupItems, normalize, parseLine, sectionRank, singular, toText, type Store } from './grocery-list-sorter'

describe('grocery-list-sorter', () => {
  it('singularises and normalises', () => {
    expect(singular('tomatoes')).toBe('tomato')
    expect(singular('berries')).toBe('berry')
    expect(singular('cookies')).toBe('cookie')
    expect(singular('glass')).toBe('glass')
    expect(normalize('Crème Fraîche!')).toBe('creme fraiche')
  })
  it('parses quantities', () => {
    expect(parseLine('2 x milk')).toEqual({ name: 'milk', qty: '2 x' })
    expect(parseLine('- 500 g flour')).toEqual({ name: 'flour', qty: '500 g' })
    expect(parseLine('eggs x12')).toEqual({ name: 'eggs', qty: '×12' })
    expect(parseLine('rice (1kg)')).toEqual({ name: 'rice', qty: '1kg' })
    expect(parseLine('[ ] bananas')).toEqual({ name: 'bananas', qty: '' })
    expect(parseLine('   ')).toBeNull()
  })
  it('classifies with longest keyword match', () => {
    expect(classify('Peanut butter')).toBe('breakfast')
    expect(classify('butter')).toBe('dairy')
    expect(classify('Cherry tomatoes')).toBe('produce')
    expect(classify('olive oil')).toBe('baking')
    expect(classify('vanilla ice cream')).toBe('frozen')
    expect(classify('dog food')).toBe('pet')
    expect(classify('eggplant')).toBe('produce')
    expect(classify('chocolate cookies')).toBe('snacks')
    expect(classify('widget')).toBe('other')
    expect(classify('widget', { widget: 'household' })).toBe('household')
  })
  it('groups in store order with other last', () => {
    const st: Store = { id: 's', name: 'S', order: ['dairy', 'produce'], labels: { dairy: 'Aisle 9' } }
    expect(sectionRank(st, 'other')).toBeGreaterThan(sectionRank(st, 'pet'))
    const g = groupItems([{ id: '1', name: 'apples', qty: '', done: false }, { id: '2', name: 'milk', qty: '2', done: false }, { id: '3', name: 'zzz', qty: '', done: false }, { id: '4', name: 'yogurt', qty: '', done: true }], st, {})
    expect(g.map((x) => x.section)).toEqual(['dairy', 'produce', 'other'])
    expect(g[0].items.map((i) => i.name)).toEqual(['milk', 'yogurt'])
    expect(toText(g, st)).toContain('Dairy & eggs (Aisle 9)\n☐ milk — 2')
    expect(toText(g, st)).not.toContain('yogurt')
  })
})
