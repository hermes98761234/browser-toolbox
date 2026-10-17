import { describe, expect, it } from 'vitest'
import { breadcrumb, buildTags, fit, hostOf, lint, parseHead, type Meta } from './meta-tag-previewer'

const M: Meta = {
  title: 'Tom & Jerry "Best" Episodes', description: 'A guide to the classic cartoons, ranked by fans and critics, with notes on each short.', url: 'https://www.example.com/blog/tom-jerry.html', siteName: 'Cartoon Club',
  image: 'https://example.com/og.png', imageAlt: 'Tom chasing Jerry', type: 'article', card: 'summary_large_image', twSite: 'cartoonclub', twCreator: '@ann', locale: 'en_US', author: 'Ann', published: '2026-10-01', themeColor: '#ff0000', robots: 'index, follow', keywords: '',
}

describe('meta-tag-previewer', () => {
  it('builds escaped tags and parses them back', () => {
    const html = buildTags(M)
    expect(html).toContain('<meta property="og:title" content="Tom &amp; Jerry &quot;Best&quot; Episodes">')
    expect(html).toContain('<meta name="twitter:site" content="@cartoonclub">')
    expect(html).toContain('article:published_time')
    expect(html).not.toContain('name="robots"')
    const back = parseHead(html)
    expect(back.title).toBe(M.title)
    expect(back.url).toBe(M.url)
    expect(back.type).toBe('article')
    expect(back.twCreator).toBe('@ann')
  })
  it('parses messy real-world heads', () => {
    const p = parseHead(`<title>Hi &amp; bye</title><META content='Desc here' name=description><link href="https://a.b/c" rel="canonical"><meta content="summary" name="twitter:card"/>`)
    expect(p).toMatchObject({ title: 'Hi & bye', description: 'Desc here', url: 'https://a.b/c', card: 'summary' })
  })
  it('truncates at word boundaries by pixel width', () => {
    const measure = (s: string) => s.length * 10
    expect(fit('short', 100, measure)).toBe('short')
    const t = fit('the quick brown fox jumps over', 150, measure)
    expect(measure(t)).toBeLessThanOrEqual(150)
    expect(t).toBe('the quick ...')
  })
  it('formats hosts and lints', () => {
    expect(hostOf('https://www.example.com/x')).toBe('example.com')
    expect(breadcrumb('https://www.example.com/blog/tom-jerry.html')).toBe('https://example.com › blog › tom-jerry')
    const l = lint({ ...M, image: '/og.png', title: 'Hi' }, 20, null)
    expect(l.some((x) => x.tone === 'err' && /absolute/.test(x.text))).toBe(true)
    expect(l.some((x) => /Title is short/.test(x.text))).toBe(true)
    expect(lint({ ...M, title: 'Tom & Jerry: the 25 best episodes ever made' }, 300, { w: 1200, h: 630 }).every((x) => x.tone === 'ok')).toBe(true)
  })
})
