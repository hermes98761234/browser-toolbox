import { describe, expect, it } from 'vitest'
import { analyze, parseCookie, parseCsp, parseHeaders, SAMPLES } from './security-headers-analyzer'

describe('security-headers-analyzer', () => {
  it('parses headers, keeps the last response and multiple Set-Cookie', () => {
    const p = parseHeaders('HTTP/1.1 301 Moved\nLocation: /x\n\nHTTP/2 200\nSet-Cookie: a=1\nset-cookie: b=2\nX-Test: one\n  two\nnot a header')
    expect(p.status).toBe('HTTP/2 200')
    expect(p.headers.has('location')).toBe(false)
    expect(p.headers.get('set-cookie')).toEqual(['a=1', 'b=2'])
    expect(p.headers.get('x-test')).toEqual(['one two'])
    expect(p.bad).toEqual(['not a header'])
  })
  it('parses CSP and cookies', () => {
    expect(parseCsp("default-src 'self'; script-src 'self' cdn.x").get('script-src')).toEqual(["'self'", 'cdn.x'])
    expect(parseCookie('__Host-id=1; Path=/; Secure; HttpOnly; SameSite=Strict')).toMatchObject({ name: '__Host-id', secure: true, httpOnly: true, sameSite: 'strict', path: '/' })
  })
  it('grades samples sensibly', () => {
    const weak = analyze(SAMPLES['Legacy PHP site'])
    const mid = analyze(SAMPLES['Typical SPA on a CDN'])
    const strong = analyze(SAMPLES['Hardened app'])
    expect(weak.grade).toBe('F')
    expect(strong.grade).toBe('A+')
    expect(mid.score).toBeGreaterThan(weak.score)
    expect(mid.score).toBeLessThan(strong.score)
    expect(weak.findings.some((f) => f.title.includes('X-Powered-By') || f.title.includes('x-powered-by'))).toBe(true)
    expect(mid.findings.some((f) => f.title.includes("'unsafe-inline'"))).toBe(true)
  })
})
