import { describe, expect, it } from 'vitest'
import { effective, evaluate, grade, makeNonce, parsePolicy, PRESETS, serialize, snippets } from './csp-header-builder'

describe('csp builder', () => {
  it('parses and serializes', () => {
    const ds = parsePolicy("Content-Security-Policy: default-src 'self'; img-src 'self' data:;  upgrade-insecure-requests")
    expect(ds).toEqual([['default-src', ["'self'"]], ['img-src', ["'self'", 'data:']], ['upgrade-insecure-requests', []]])
    expect(serialize(ds)).toBe("default-src 'self'; img-src 'self' data:; upgrade-insecure-requests")
    expect(parsePolicy('<meta http-equiv="Content-Security-Policy" content="script-src \'none\'">')).toEqual([['script-src', ["'none'"]]])
  })
  it('fallback chain', () => {
    const ds = parsePolicy("default-src 'self'; script-src https://a.com")
    expect(effective(ds, 'img-src')).toEqual(["'self'"])
    expect(effective(ds, 'script-src-elem')).toEqual(['https://a.com'])
    expect(effective(ds, 'worker-src')).toEqual(['https://a.com'])
    expect(effective([], 'img-src')).toBeNull()
  })
  it('flags dangerous policies', () => {
    const f = evaluate(parsePolicy("default-src *; script-src 'self' 'unsafe-inline' self ajax.googleapis.com"))
    const msgs = f.map((x) => `${x.sev}:${x.directive}`)
    expect(msgs).toContain('high:script-src')
    expect(f.some((x) => /must be single-quoted/.test(x.msg))).toBe(true)
    expect(f.some((x) => /JSONP/.test(x.msg))).toBe(true)
    expect(f.some((x) => x.directive === 'object-src')).toBe(true)
    expect(grade(f).letter).toBe('F')
  })
  it('strict nonce policy scores well', () => {
    const ds = parsePolicy("script-src 'nonce-r4nd0mR4nd0mR4nd0m12' 'strict-dynamic' https: 'unsafe-inline'; object-src 'none'; base-uri 'none'; frame-ancestors 'self'; report-to csp; default-src 'self'; form-action 'self'; upgrade-insecure-requests")
    const f = evaluate(ds)
    expect(f.filter((x) => x.sev === 'high' || x.sev === 'medium')).toEqual([])
    expect(grade(f).letter).toBe('A')
  })
  it('detects strict-dynamic without nonce and duplicates', () => {
    const f = evaluate(parsePolicy("script-src 'strict-dynamic'; script-src 'self'"))
    expect(f.some((x) => /blocks all scripts/.test(x.msg))).toBe(true)
    expect(f.some((x) => /Duplicate/.test(x.msg))).toBe(true)
  })
  it('snippets drop meta-unsupported directives', () => {
    const sn = snippets(PRESETS[1].ds, false)
    expect(sn.header.startsWith("Content-Security-Policy: default-src 'self'")).toBe(true)
    expect(sn.meta).not.toContain('frame-ancestors')
    expect(sn.metaDropped).toEqual(['frame-ancestors'])
    expect(snippets(PRESETS[1].ds, true).header.startsWith('Content-Security-Policy-Report-Only')).toBe(true)
  })
  it('nonce is 16 random bytes in base64', () => {
    expect(makeNonce((b) => { b.fill(255) })).toBe('/////////////////////w==')
  })
})
