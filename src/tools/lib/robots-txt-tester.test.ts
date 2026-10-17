import { describe, expect, it } from 'vitest'
import { groupsFor, matchRule, normPath, parse, productToken, test } from './robots-txt-tester'

const R = parse(`# demo
User-agent: *
Disallow: /admin/
Allow: /admin/public/
Disallow: /*.pdf$
Disallow: /search
Allow: /search$

User-agent: Googlebot
User-agent: Bingbot
Disallow: /private
Crawl-delay: 5

User-agent: Googlebot-Image
Disallow: /

Sitemap: https://example.com/sitemap.xml
Dissallow: /oops
Foo: bar
`)

describe('robots-txt-tester', () => {
  it('parses groups, sitemaps and issues', () => {
    expect(R.groups).toHaveLength(3)
    expect(R.groups[1].agents).toEqual(['googlebot', 'bingbot'])
    expect(R.groups[1].crawlDelay).toBe(5)
    expect(R.sitemaps).toEqual(['https://example.com/sitemap.xml'])
    expect(R.issues.some((i) => i.msg.includes('typo'))).toBe(true)
    expect(R.issues.some((i) => i.msg.includes('Unknown directive “foo”'))).toBe(true)
  })
  it('matches wildcards and anchors', () => {
    expect(matchRule('/*.pdf$', '/files/a.pdf')).toBe(7)
    expect(matchRule('/*.pdf$', '/files/a.pdf?x=1')).toBe(-1)
    expect(matchRule('/fish', '/fish.html')).toBe(5)
    expect(matchRule('/fish/', '/fish')).toBe(-1)
    expect(normPath('/café')).toBe('/caf%C3%A9')
    expect(matchRule('/caf%c3%a9', '/café')).toBeGreaterThan(0)
  })
  it('selects the most specific group', () => {
    expect(productToken('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)')).toBe('googlebot')
    expect(groupsFor(R, 'Googlebot-Image/1.0').matched).toBe('googlebot-image')
    expect(groupsFor(R, 'Googlebot').matched).toBe('googlebot')
    expect(groupsFor(R, 'SomeBot').matched).toBe('*')
  })
  it('applies longest-match and allow-on-tie', () => {
    expect(test(R, '*', '/admin/settings').allowed).toBe(false)
    expect(test(R, '*', 'https://example.com/admin/public/logo.png').allowed).toBe(true)
    expect(test(R, '*', '/docs/a.pdf').allowed).toBe(false)
    expect(test(R, '*', '/search').allowed).toBe(true)
    expect(test(R, '*', '/search?q=x').allowed).toBe(false)
    expect(test(R, 'Googlebot', '/admin/settings').allowed).toBe(true) // own group, no /admin rule
    expect(test(R, 'Googlebot', '/private/x').rule?.line).toBe(11)
    expect(test(R, 'Googlebot-Image', '/robots.txt').allowed).toBe(true)
    const tie = parse('User-agent: *\nDisallow: /page\nAllow: /page')
    expect(test(tie, 'x', '/page').allowed).toBe(true)
    expect(test(parse('User-agent: *\nDisallow:'), 'x', '/a').allowed).toBe(true)
  })
})
