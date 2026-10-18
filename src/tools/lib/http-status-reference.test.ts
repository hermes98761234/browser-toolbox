import { describe, expect, it } from 'vitest'
import { catOf, rfcUrl, search, STATUSES } from './http-status-reference'

describe('http status dataset', () => {
  it('has unique codes and all core RFC 9110 codes', () => {
    const codes = STATUSES.map((s) => s.code)
    expect(new Set(codes).size).toBe(codes.length)
    for (const c of [100, 101, 200, 201, 204, 206, 301, 302, 304, 307, 308, 400, 401, 403, 404, 405, 409, 413, 415, 422, 429, 500, 502, 503, 504]) expect(codes).toContain(c)
  })
  it('every entry is well-formed', () => {
    for (const s of STATUSES) {
      expect(s.name.length).toBeGreaterThan(1)
      expect(s.summary.length).toBeGreaterThan(10)
      expect(s.fixes.length).toBeGreaterThan(0)
      if (s.official) expect(s.ref).toMatch(/^\d{4} [\d.]+$/)
    }
  })
  it('maps RFC 9110 sections', () => {
    expect(STATUSES.find((s) => s.code === 404)!.ref).toBe('9110 15.5.5')
    expect(STATUSES.find((s) => s.code === 503)!.ref).toBe('9110 15.6.4')
    expect(rfcUrl('9110 15.5.5')).toBe('https://www.rfc-editor.org/rfc/rfc9110#section-15.5.5')
  })
  it('searches by code, class and words', () => {
    expect(search('404')[0].code).toBe(404)
    expect(search('5xx').every((s) => catOf(s.code) === '5xx')).toBe(true)
    expect(search('rate limit')[0].code).toBe(429)
    expect(search('teapot').map((s) => s.code)).toContain(418)
    expect(search('gatway timeout')[0].code).toBe(504)
  })
})
