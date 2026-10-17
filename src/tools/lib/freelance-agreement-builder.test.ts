import { describe, expect, it } from 'vitest'
import { numberSections, payment, render, winAnsi, wrap } from './freelance-agreement-builder'

describe('render', () => {
  it('substitutes and branches', () => {
    expect(render('Hi {{a.b}}!', { a: { b: 'Ann' } })).toBe('Hi Ann!')
    expect(render('{{#if x}}yes{{else}}no{{/if}}', { x: 0 })).toBe('no')
    expect(render('{{#unless x}}A{{/unless}}', { x: false })).toBe('A')
    expect(render('{{#each l}}{{@number}}.{{name}}{{#if extra}}+{{/if}};{{/each}}', { l: [{ name: 'a' }, { name: 'b', extra: 1 }], extra: 0 })).toBe('1.a;2.b+;')
    expect(render('{{#each l}}- {{this}}\n{{/each}}', { l: ['a', 'b'] })).toBe('- a\n- b\n')
    expect(render('{{#each l}}x{{else}}none{{/each}}', { l: [] })).toBe('none')
    expect(render('{{#eq t "hourly"}}H{{else}}F{{/eq}}', { t: 'hourly' })).toBe('H')
    expect(render('{{#if a}}{{#if b}}AB{{else}}A{{/if}}{{/if}}', { a: 1, b: 0 })).toBe('A')
    expect(() => render('{{#if a}}x', {})).toThrow(/Unclosed/)
  })
  it('numbers sections', () => {
    expect(numberSections('# T\n\n\n\n## A\ntext  \n## B')).toBe('# T\n\n## 1. A\ntext\n## 2. B')
  })
})

describe('payment', () => {
  it('computes totals', () => {
    const base = { fixed: 4000, rate: 85, hours: 40, depositPct: 30, milestones: [{ name: 'a', amount: 1500, due: '' }, { name: 'b', amount: 2500.5, due: '' }] }
    expect(payment({ ...base, type: 'fixed' })).toEqual({ total: 4000, deposit: 1200, balance: 2800 })
    expect(payment({ ...base, type: 'hourly' })).toEqual({ total: 3400, deposit: 1020, balance: 2380 })
    expect(payment({ ...base, type: 'milestones', depositPct: 0 })).toEqual({ total: 4000.5, deposit: 0, balance: 4000.5 })
  })
  it('wraps and sanitises', () => {
    expect(wrap('aa bb cc dd', 5, (s) => s.length)).toEqual(['aa bb', 'cc dd'])
    expect(winAnsi('Café — “ok” Київ ≈')).toBe('Café — “ok” ???? ~')
  })
})
