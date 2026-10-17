import { describe, expect, it } from 'vitest'
import { analyze, flatten, generate, key, parse, toPath, type Opts } from './redirect-rules-generator'

const O: Opts = { code: 301, ignoreCase: false, trailingSlash: true, keepQuery: true }

describe('redirect-rules-generator', () => {
  it('parses CSV, TSV and whitespace with headers and codes', () => {
    const r = parse('old,new\n/a,/b\nhttps://x.com/c/\t/d\t302\n/e /f 999\n/g 410\n/h', 301)
    expect(r.rules.map((x) => [x.from, x.to, x.code])).toEqual([['/a', '/b', 301], ['/c/', '/d', 302], ['/g', '', 410]])
    expect(r.errors).toEqual(['Line 4: unsupported status “999”', 'Line 6: needs an old and a new path'])
    expect(toPath('https://site.com')).toBe('/')
  })
  it('normalises keys', () => {
    expect(key('/A/b/?x=1', { ignoreCase: true, trailingSlash: true })).toBe('/a/b')
    expect(key('/', { ignoreCase: false, trailingSlash: true })).toBe('/')
  })
  it('finds duplicates, conflicts, loops, chains and self-redirects', () => {
    const { rules } = parse('/a /b\n/b /c\n/x /y\n/y /x\n/s /s/\n/d /e\n/d /e\n/k /1\n/k/ /2', 301)
    const kinds = analyze(rules, O).map((f) => f.kind).sort()
    expect(kinds).toEqual(['chain', 'conflict', 'duplicate', 'loop', 'self'])
    expect(analyze(rules, O).find((f) => f.kind === 'loop')!.lines).toEqual([3, 4])
  })
  it('flattens chains', () => {
    const { rules } = parse('/a /b\n/b /c\n/c /d', 301)
    expect(flatten(rules, O).map((r) => r.to)).toEqual(['/d', '/d', '/d'])
  })
  it('generates configs', () => {
    const { rules } = parse('/old-page /new-page\n/gone 410', 301)
    expect(generate(rules, 'nginx', { ...O, trailingSlash: false })).toContain('location = /old-page { return 301 /new-page$is_args$args; }')
    expect(generate(rules, 'nginx', O)).toContain('location ~ "^/old-page/?$" { return 301')
    expect(generate(rules, 'apache', { ...O, keepQuery: false })).toContain('RewriteRule ^old-page/?$ /new-page [R=301,L,QSD]')
    expect(generate(rules, 'apache', O)).toContain('RewriteRule ^gone/?$ - [G,L]')
    expect(generate(rules, 'netlify', O)).toContain('/old-page  /new-page  301')
    expect(JSON.parse(generate(rules, 'vercel', O)).redirects).toEqual([{ source: '/old-page', destination: '/new-page', statusCode: 301 }])
    expect(generate(rules, 'caddy', O)).toContain('redir /old-page /new-page 301')
  })
})
