import { describe, expect, it } from 'vitest'
import { buildUtm, lint, normalize, parseUtm } from './utm-link-builder'

const O = { lower: true, space: '-' as const, strip: false }

describe('utm-link-builder', () => {
  it('normalises values', () => {
    expect(normalize('  Spring Sale 2025 ', O)).toBe('spring-sale-2025')
    expect(normalize('Black Friday!', { lower: false, space: '_', strip: true })).toBe('Black_Friday')
  })
  it('builds URLs keeping params and hash', () => {
    expect(buildUtm('example.com/shop?ref=1#top', { utm_source: 'Google', utm_medium: 'cpc', utm_campaign: 'Spring Sale' }, O)).toBe(
      'https://example.com/shop?ref=1&utm_source=google&utm_medium=cpc&utm_campaign=spring-sale#top',
    )
    expect(buildUtm('https://a.io/?utm_source=old', { utm_source: 'new' }, O)).toBe('https://a.io/?utm_source=new')
    expect(buildUtm('not a url', { utm_source: 'x' }, O)).toBeNull()
  })
  it('parses tagged URLs', () => {
    const p = parseUtm('https://a.io/p?x=1&utm_source=fb&utm_campaign=c%201')
    expect(p?.utm).toEqual({ utm_source: 'fb', utm_campaign: 'c 1' })
    expect(p?.base).toBe('https://a.io/p?x=1')
    expect(p?.other).toBe(1)
  })
  it('lints', () => {
    expect(lint({ utm_source: 'x', utm_medium: 'cpc', utm_campaign: 'c' }, 'u')).toEqual([])
    expect(lint({ utm_source: 'X', utm_medium: 'weird', utm_campaign: 'c' }, 'u').length).toBe(2)
  })
})
