import { describe, expect, it } from 'vitest'
import { buildQuery, decode, encode, parse, parseQuery, punyDecode, rebuild, splitHost, unicodeHost, type Parsed } from './url-parser'

const ok = (s: string) => parse(s) as Parsed

describe('url parser', () => {
  it('breaks a URL into parts', () => {
    const p = ok('https://user:pw@shop.example.co.uk:8443/a/b%20c/?q=red+shoes&size=42&size=43&utm_source=news#reviews')
    expect(p.url.hostname).toBe('shop.example.co.uk')
    expect(p.host).toMatchObject({ sub: 'shop', domain: 'example', suffix: 'co.uk' })
    expect(p.segments).toEqual(['a', 'b c'])
    expect(p.params.map((x) => [x.key, x.value])).toEqual([['q', 'red shoes'], ['size', '42'], ['size', '43'], ['utm_source', 'news']])
    const w = p.warnings.map((x) => x.text).join(' | ')
    expect(w).toMatch(/credentials/)
    expect(w).toMatch(/port 8443/)
    expect(w).toMatch(/Repeated parameter\(s\): size/)
    expect(w).toMatch(/tracking/)
  })
  it('adds a scheme and reports errors', () => {
    expect(ok('example.com/x').url.href).toBe('https://example.com/x')
    expect(ok('example.com').fixed).toBe(true)
    expect('error' in parse('http://exa mple.com')).toBe(true)
    expect('error' in parse('')).toBe(true)
  })
  it('decodes punycode hostnames', () => {
    expect(punyDecode('mnchen-3ya')).toBe('münchen')
    expect(unicodeHost('xn--mnchen-3ya.de')).toBe('münchen.de')
    expect(unicodeHost('xn--80ak6aa92e.com')).toBe('аррӏе.com')
    expect(ok('https://xn--80ak6aa92e.com').warnings.some((w) => /look-alike/.test(w.text))).toBe(true)
  })
  it('splits hosts', () => {
    expect(splitHost('a.b.example.com')).toEqual({ sub: 'a.b', domain: 'example', suffix: 'com', ip: false })
    expect(splitHost('192.168.0.1').ip).toBe(true)
  })
  it('rebuilds with edited params', () => {
    const p = ok('https://example.com/path?a=1&b=two words#top')
    const params = p.params.map((x) => (x.key === 'a' ? { ...x, on: false } : x))
    expect(rebuild(p.url, { protocol: 'https:', host: 'example.com', path: '/path', params, hash: '#top', plusSpaces: true })).toBe('https://example.com/path?b=two+words#top')
    expect(buildQuery(parseQuery('x=a%26b&y'), false)).toBe('x=a%26b&y')
    expect(ok('https://app.example/#/route?x=1').hashParams.map((x) => x.key)).toEqual(['x'])
    expect(ok('https://app.example/#section-2').hashParams).toEqual([])
    expect(ok('https://app.example/#access_token=abc&state=1').hashParams.map((x) => x.key)).toEqual(['access_token', 'state'])
  })
  it('encodes and decodes', () => {
    expect(encode('a b&c/é', 'component')).toBe('a%20b%26c%2F%C3%A9')
    expect(encode('a b&c/é', 'uri')).toBe('a%20b&c/%C3%A9')
    expect(encode("a b!'", 'form')).toBe('a+b%21%27')
    expect(decode('a+b%21', 'form')).toBe('a b!')
    expect(() => decode('%E0%A4%A', 'component')).toThrow(/Malformed/)
  })
})
