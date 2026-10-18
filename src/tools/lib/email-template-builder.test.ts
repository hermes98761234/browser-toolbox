import { describe, expect, it } from 'vitest'
import { extractFields, fill, mailto, missing, toHtml, toPlain } from './email-template-builder'

describe('email templates', () => {
  it('extracts unique fields with defaults, skipping built-ins', () => {
    const f = extractFields('Hi {{ name | there }}', 'On {{today}}, {{name}} owes {{amount}} for {{invoice no}}')
    expect(f).toEqual([{ name: 'name', def: 'there' }, { name: 'amount', def: '' }, { name: 'invoice no', def: '' }])
    expect(missing(f, { amount: '5' })).toEqual(['invoice no'])
  })
  it('fills values, defaults, built-ins and marks missing', () => {
    const now = new Date(2026, 9, 18)
    expect(fill('Hi {{name|there}}, {{x}} {{year}}', {}, now)).toBe('Hi there, {{x}} 2026')
    expect(fill('Hi {{name|there}}', { name: 'Ann' }, now)).toBe('Hi Ann')
    expect(fill('{{x}}', {}, now, (n) => `[${n}]`)).toBe('[x]')
    expect(fill('{{tomorrow}}', {}, now)).toBe('19 October 2026')
  })
  it('formats light markdown safely', () => {
    expect(toHtml('Hello **Ann** & *team*\nline 2\n\n- one\n- [two](https://e.x)')).toBe('<p>Hello <strong>Ann</strong> &amp; <em>team</em><br>line 2</p>\n<ul><li>one</li><li><a href="https://e.x">two</a></li></ul>')
    expect(toHtml('<script>')).toBe('<p>&lt;script&gt;</p>')
    expect(toHtml('[x](javascript:alert(1))')).not.toContain('href')
    expect(toPlain('**a** [b](https://c)\n- d')).toBe('a b (https://c)\n• d')
    expect(mailto('a@b.c', 'Hi there', 'x&y')).toBe('mailto:a@b.c?subject=Hi%20there&body=x%26y')
  })
})
