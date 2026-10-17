// robots.txt parsing and matching per RFC 9309 (Google semantics): group selection by most specific
// user-agent, longest-match rule wins, ties go to Allow, `*` wildcard and `$` end anchor.

export interface Rule { allow: boolean; path: string; line: number }
export interface Group { agents: string[]; rules: Rule[]; crawlDelay?: number; line: number }
export interface Issue { line: number; level: 'error' | 'warn'; msg: string }
export interface Robots { groups: Group[]; sitemaps: string[]; issues: Issue[]; host?: string }

const KNOWN = new Set(['user-agent', 'allow', 'disallow', 'sitemap', 'crawl-delay', 'host', 'clean-param', 'noindex', 'request-rate', 'visit-time'])
const TYPO: Record<string, string> = { 'useragent': 'user-agent', 'user agent': 'user-agent', 'dissallow': 'disallow', 'disalow': 'disallow', 'dissalow': 'disallow', 'alow': 'allow', 'site-map': 'sitemap' }

export function parse(text: string): Robots {
  const groups: Group[] = []
  const sitemaps: string[] = []
  const issues: Issue[] = []
  let host: string | undefined
  let cur: Group | null = null
  let lastWasAgent = false
  if (new TextEncoder().encode(text).length > 500 * 1024) issues.push({ line: 0, level: 'warn', msg: 'File is larger than 500 KiB — Google ignores everything after that.' })
  text.replace(/^﻿/, '').split(/\r\n|\r|\n/).forEach((raw, i) => {
    const line = i + 1
    const s = raw.replace(/#.*/, '').trim()
    if (!s) return
    const c = s.indexOf(':')
    if (c < 0) {
      issues.push({ line, level: 'error', msg: `Not a “field: value” line: ${s.slice(0, 40)}` })
      return
    }
    let key = s.slice(0, c).trim().toLowerCase()
    const val = s.slice(c + 1).trim()
    if (TYPO[key]) {
      issues.push({ line, level: 'warn', msg: `“${s.slice(0, c).trim()}” looks like a typo of “${TYPO[key]}” (accepted).` })
      key = TYPO[key]
    }
    if (!KNOWN.has(key)) {
      issues.push({ line, level: 'warn', msg: `Unknown directive “${key}” is ignored.` })
      return
    }
    if (key === 'user-agent') {
      if (!lastWasAgent || !cur) {
        cur = { agents: [], rules: [], line }
        groups.push(cur)
      }
      if (!val) issues.push({ line, level: 'error', msg: 'Empty user-agent.' })
      else cur.agents.push(val.toLowerCase())
      lastWasAgent = true
      return
    }
    lastWasAgent = false
    if (key === 'sitemap') {
      if (!/^https?:\/\//i.test(val)) issues.push({ line, level: 'error', msg: 'Sitemap must be an absolute URL (https://…).' })
      sitemaps.push(val)
      return
    }
    if (key === 'host') {
      host = val
      return
    }
    if (!cur) {
      issues.push({ line, level: 'error', msg: `“${key}” before any User-agent line is ignored.` })
      return
    }
    if (key === 'allow' || key === 'disallow') {
      if (val && !val.startsWith('/') && !val.startsWith('*')) issues.push({ line, level: 'warn', msg: `Path “${val}” should start with “/” or “*”.` })
      if (val) cur.rules.push({ allow: key === 'allow', path: val, line })
      else if (key === 'allow') issues.push({ line, level: 'warn', msg: 'Empty Allow has no effect.' })
    } else if (key === 'crawl-delay') {
      const d = Number(val)
      if (!Number.isFinite(d) || d < 0) issues.push({ line, level: 'error', msg: 'Crawl-delay must be a number of seconds.' })
      else cur.crawlDelay = d
      issues.push({ line, level: 'warn', msg: 'Crawl-delay is ignored by Google (Bing and Yandex honour it).' })
    } else issues.push({ line, level: 'warn', msg: `“${key}” is non-standard and ignored by Google.` })
  })
  for (const g of groups) if (!g.rules.length && g.crawlDelay === undefined) issues.push({ line: g.line, level: 'warn', msg: `Group for ${g.agents.join(', ')} has no rules — the agent may crawl everything.` })
  return { groups, sitemaps, issues, host }
}

/** Normalises percent-encoding so /caf%C3%A9 and /café compare equal; uppercases escapes. */
export function normPath(p: string): string {
  let out = ''
  for (const ch of p) {
    const code = ch.codePointAt(0)!
    out += code > 127 ? encodeURIComponent(ch) : ch
  }
  return out.replace(/%[0-9a-f]{2}/gi, (m) => m.toUpperCase())
}

/** Does a robots pattern match the path? Returns matched specificity (pattern length) or -1. */
export function matchRule(pattern: string, path: string): number {
  const pat = normPath(pattern)
  const anchored = pat.endsWith('$')
  const body = anchored ? pat.slice(0, -1) : pat
  const re = new RegExp('^' + body.split('*').map((x) => x.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + (anchored ? '$' : ''))
  return re.test(normPath(path)) ? pat.length : -1
}

/** Product token of a full UA string ("Mozilla/5.0 (compatible; Googlebot/2.1…)" → "googlebot"). */
export function productToken(ua: string): string {
  const known = /(googlebot-image|googlebot-news|googlebot-video|googlebot|adsbot-google|mediapartners-google|bingbot|duckduckbot|yandexbot|baiduspider|applebot|gptbot|ccbot|claudebot|facebookexternalhit|twitterbot|slurp|ahrefsbot|semrushbot)/i.exec(ua)
  if (known) return known[1].toLowerCase()
  return (ua.split(/[\s/;(]/)[0] || ua).toLowerCase()
}

/** Groups that apply to the agent: most specific (longest) matching token; else "*". Merged when several. */
export function groupsFor(r: Robots, ua: string): { groups: Group[]; matched: string } {
  const tok = productToken(ua)
  let best = '', hits: Group[] = []
  for (const g of r.groups)
    for (const a of g.agents) {
      if (a === '*') continue
      if (tok === a || tok.startsWith(a)) {
        if (a.length > best.length) {
          best = a
          hits = [g]
        } else if (a === best && !hits.includes(g)) hits.push(g)
      }
    }
  if (hits.length) return { groups: hits, matched: best }
  const star = r.groups.filter((g) => g.agents.includes('*'))
  return { groups: star, matched: star.length ? '*' : '' }
}

export interface Verdict { allowed: boolean; rule: Rule | null; matched: string; reason: string }

export function test(r: Robots, ua: string, url: string): Verdict {
  let path = url.trim()
  const m = /^[a-z][a-z0-9+.-]*:\/\/[^/?#]*(.*)$/i.exec(path)
  if (m) path = m[1] || '/'
  path = path.replace(/#.*/, '')
  if (!path.startsWith('/')) path = '/' + path
  const { groups, matched } = groupsFor(r, ua)
  if (path === '/robots.txt') return { allowed: true, rule: null, matched, reason: '/robots.txt is always allowed.' }
  if (!groups.length) return { allowed: true, rule: null, matched, reason: 'No group applies to this user-agent, so everything is allowed.' }
  let best: Rule | null = null, len = -1
  for (const g of groups)
    for (const rule of g.rules) {
      const l = matchRule(rule.path, path)
      if (l < 0) continue
      if (l > len || (l === len && rule.allow && best && !best.allow)) {
        best = rule
        len = l
      }
    }
  if (!best) return { allowed: true, rule: null, matched, reason: `No rule in the “${matched}” group matches, so the URL is allowed.` }
  return { allowed: best.allow, rule: best, matched, reason: `Longest matching rule (${len} chars) in the “${matched}” group wins.` }
}
