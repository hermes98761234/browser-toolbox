import { describe, expect, it } from 'vitest'
import { analyze, decodeLayers, editDistance, hostToUnicode, punyDecode, punyEncode, skeleton } from './phishing-url-inspector'

describe('punycode', () => {
  it('round-trips and agrees with the platform URL parser', () => {
    for (const w of ['аррӏе', 'münchen', 'bücher', 'пример', 'paypаl', '例え', 'faß']) {
      const enc = punyEncode(w)
      expect(punyDecode(enc)).toBe(w)
      const viaUrl = new URL(`http://${w}.com`).hostname
      if (viaUrl.startsWith('xn--')) expect(viaUrl).toBe(`xn--${enc}.com`)
    }
    expect(punyDecode('mnchen-3ya')).toBe('münchen')
    expect(hostToUnicode('xn--80ak6aa92e.com')).toBe('аррӏе.com')
  })
})

describe('helpers', () => {
  it('skeleton and edit distance', () => {
    expect(skeleton('раураl')).toBe(skeleton('paypal'))
    expect(skeleton('rnicrosoft')).toBe(skeleton('microsoft'))
    expect(skeleton('g00gle')).toBe(skeleton('google'))
    expect(editDistance('paypal', 'paypla')).toBe(1)
    expect(editDistance('amazon', 'amazn')).toBe(1)
    expect(editDistance('kitten', 'sitting')).toBe(3)
  })
  it('peels nested encodings', () => {
    const inner = 'https://evil.example/login'
    const twice = encodeURIComponent(encodeURIComponent(inner))
    const l = decodeLayers(twice)
    expect(l[l.length - 1]).toBe(inner)
    const b64 = btoa(inner)
    expect(decodeLayers(b64).pop()).toBe(inner)
  })
})

describe('analysis', () => {
  const titles = (u: string) => analyze(u).findings.map((f) => f.title).join(' | ')
  it('flags homographs', () => {
    const r = analyze('https://xn--80ak6aa92e.com/')
    expect(r.unicodeHost).toBe('аррӏе.com')
    expect(r.verdict).toBe('High')
    expect(r.lookalike?.brand).toBe('apple.com')
  })
  it('flags @ trick, IP and obfuscated IP', () => {
    expect(titles('http://paypal.com@192.168.10.5/login')).toMatch(/user-info.*|Raw IP/)
    const r = analyze('http://0xC0A80A05/')
    expect(r.host).toBe('192.168.10.5')
    expect(titles('http://0xC0A80A05/')).toMatch(/Obfuscated IP/)
  })
  it('flags typosquats, brand-in-subdomain, shorteners and redirects', () => {
    expect(analyze('https://paypa1.com/signin').lookalike?.brand).toBe('paypal.com')
    expect(analyze('https://arnazon.com').lookalike?.brand).toBe('amazon.com')
    expect(titles('https://login.microsoft.com.account-verify.xyz/')).toMatch(/subdomain/)
    expect(titles('https://bit.ly/3abcd')).toMatch(/shortener/)
    const r = analyze('https://www.google.com/url?q=' + encodeURIComponent('https://secure-paypal-login.top/verify'))
    expect(r.nested.length).toBe(1)
    expect(r.nested[0].lookalike?.brand).toBe('paypal.com')
    expect(r.score).toBeGreaterThan(30)
  })
  it('keeps clean links low', () => {
    expect(analyze('https://github.com/features').verdict).toBe('Low')
    expect(analyze('https://en.wikipedia.org/wiki/Phishing').verdict).toBe('Low')
    expect(analyze('javascript:alert(1)').verdict).toBe('High')
  })
})
