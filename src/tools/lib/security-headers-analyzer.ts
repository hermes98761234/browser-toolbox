// Parses pasted HTTP response headers and audits them against current security-header guidance (OWASP Secure Headers, MDN).

export type Level = 'pass' | 'warn' | 'fail' | 'info'
export interface Finding { area: string; level: Level; title: string; detail: string; fix?: string }
export interface Parsed { status?: string; headers: Map<string, string[]>; names: Map<string, string>; bad: string[] }

export function parseHeaders(text: string): Parsed {
  const headers = new Map<string, string[]>(), names = new Map<string, string>(), bad: string[] = []
  let status: string | undefined
  let last = ''
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim()) continue
    const line = raw.replace(/^[<>]\s?/, '') // curl -v prefixes
    if (/^HTTP\/[\d.]+\s+\d{3}/i.test(line.trim())) { status = line.trim(); headers.clear(); names.clear(); continue } // keep the last response (after redirects)
    if (/^\s/.test(raw) && last) { const v = headers.get(last)!; v[v.length - 1] += ' ' + line.trim(); continue } // obsolete folding
    const m = /^([!#$%&'*+.^_`|~0-9A-Za-z-]+)\s*:\s*(.*)$/.exec(line.trim())
    if (!m) { bad.push(raw.trim()); continue }
    const k = m[1].toLowerCase()
    last = k
    names.set(k, m[1])
    headers.set(k, [...(headers.get(k) ?? []), m[2].trim()])
  }
  return { status, headers, names, bad }
}

export function parseCsp(v: string): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const part of v.split(';')) {
    const [name, ...vals] = part.trim().split(/\s+/)
    if (name && !out.has(name.toLowerCase())) out.set(name.toLowerCase(), vals)
  }
  return out
}

export interface Cookie { name: string; secure: boolean; httpOnly: boolean; sameSite?: string; domain?: string; path?: string; maxAge?: number; expires?: string }
export function parseCookie(v: string): Cookie {
  const [nv, ...attrs] = v.split(';').map((x) => x.trim())
  const c: Cookie = { name: nv.split('=')[0], secure: false, httpOnly: false }
  for (const a of attrs) {
    const [k, ...rest] = a.split('=')
    const val = rest.join('=')
    switch (k.toLowerCase()) {
      case 'secure': c.secure = true; break
      case 'httponly': c.httpOnly = true; break
      case 'samesite': c.sameSite = val.toLowerCase(); break
      case 'domain': c.domain = val; break
      case 'path': c.path = val; break
      case 'max-age': c.maxAge = Number(val); break
      case 'expires': c.expires = val; break
    }
  }
  return c
}

const WEIGHTS: Record<string, number> = { HSTS: 20, CSP: 25, Framing: 15, 'MIME sniffing': 10, Referrer: 10, Permissions: 8, Cookies: 12 }

export interface Report { findings: Finding[]; score: number; grade: string; recommended: string[] }

export function analyze(text: string, https = true): Report {
  const { headers } = parseHeaders(text)
  const h = (k: string) => headers.get(k)?.join(', ')
  const F: Finding[] = []
  const add = (area: string, level: Level, title: string, detail: string, fix?: string) => F.push({ area, level, title, detail, fix })
  const score: Record<string, number> = {}
  const rec: string[] = []

  // HSTS
  const hsts = headers.get('strict-transport-security')?.[0]
  if (!https) add('HSTS', 'info', 'HSTS not applicable', 'Site served over plain HTTP: browsers ignore HSTS there. Serve everything over HTTPS first.')
  else if (!hsts) { add('HSTS', 'fail', 'Strict-Transport-Security missing', 'Browsers may connect over plain HTTP first, allowing SSL-stripping attacks.', 'Strict-Transport-Security: max-age=63072000; includeSubDomains; preload'); score.HSTS = 0 }
  else {
    const age = Number(/max-age\s*=\s*"?(\d+)/i.exec(hsts)?.[1] ?? NaN)
    const sub = /includesubdomains/i.test(hsts), pre = /preload/i.test(hsts)
    if (!Number.isFinite(age)) { add('HSTS', 'fail', 'HSTS without a valid max-age', hsts, 'Strict-Transport-Security: max-age=63072000; includeSubDomains'); score.HSTS = 0.2 }
    else if (age === 0) { add('HSTS', 'fail', 'HSTS disabled (max-age=0)', 'max-age=0 tells browsers to forget the policy.'); score.HSTS = 0 }
    else if (age < 15768000) { add('HSTS', 'warn', `HSTS max-age is short (${Math.round(age / 86400)} days)`, 'Use at least 6 months; 1–2 years is recommended.', 'max-age=63072000'); score.HSTS = 0.5 }
    else { add('HSTS', 'pass', `HSTS enabled for ${Math.round(age / 86400)} days`, sub ? 'includeSubDomains is set.' : 'Consider includeSubDomains once all subdomains support HTTPS.'); score.HSTS = sub ? 1 : 0.85 }
    if (pre && (!sub || age < 31536000)) add('HSTS', 'warn', 'preload set but not eligible', 'The preload list requires max-age ≥ 31536000 and includeSubDomains.')
    else if (pre) add('HSTS', 'info', 'Preload-ready', 'Submit the domain at hstspreload.org if not already listed.')
  }
  if (score.HSTS === undefined && https) score.HSTS = 0
  if (https && (score.HSTS ?? 0) < 1) rec.push('Strict-Transport-Security: max-age=63072000; includeSubDomains')

  // CSP
  const cspV = headers.get('content-security-policy')?.join(', ')
  const cspRO = h('content-security-policy-report-only')
  let frameAncestors = false
  if (!cspV) {
    if (cspRO) add('CSP', 'warn', 'CSP only in report-only mode', 'Content-Security-Policy-Report-Only reports violations but blocks nothing.', 'Promote the policy to Content-Security-Policy once reports are clean.')
    else add('CSP', 'fail', 'Content-Security-Policy missing', 'No CSP: injected scripts (XSS) run with full privileges.', "Content-Security-Policy: default-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'")
    score.CSP = cspRO ? 0.25 : 0
    rec.push("Content-Security-Policy: default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'; upgrade-insecure-requests")
  } else {
    const d = parseCsp(cspV)
    frameAncestors = d.has('frame-ancestors')
    let s = 1
    const script = d.get('script-src') ?? d.get('default-src')
    if (!script) { add('CSP', 'fail', 'No script-src or default-src', 'Scripts are unrestricted.', "Add default-src 'self' (or a strict script-src)."); s -= 0.6 }
    else {
      const hasNonce = script.some((x) => /^'(nonce|sha(256|384|512))-/i.test(x)), strictDyn = script.includes("'strict-dynamic'")
      if (script.includes("'unsafe-inline'") && !hasNonce) { add('CSP', 'warn', "script-src allows 'unsafe-inline'", 'Inline scripts (the usual XSS payload) are allowed, which defeats most of the CSP.', "Use nonces or hashes and 'strict-dynamic' instead."); s -= 0.35 }
      if (script.includes("'unsafe-eval'")) { add('CSP', 'warn', "script-src allows 'unsafe-eval'", 'eval() and new Function() are allowed.', 'Remove it; refactor code that needs eval.'); s -= 0.15 }
      const wild = script.filter((x) => x === '*' || x === 'http:' || x === 'https:' || x === 'data:' || x === 'blob:')
      if (wild.length && !strictDyn) { add('CSP', 'fail', `script-src allows ${wild.join(' ')}`, 'Any host (or data: URLs) can serve scripts.', 'List exact origins or use nonces.'); s -= 0.4 }
      if (hasNonce || strictDyn) add('CSP', 'pass', 'Nonce/hash-based script policy', 'Strict CSP style: good protection against XSS.')
    }
    const obj = d.get('object-src') ?? d.get('default-src')
    if (!obj || !obj.includes("'none'")) { add('CSP', 'warn', "object-src is not 'none'", 'Plugins (<object>, <embed>) can load content.', "object-src 'none'"); s -= 0.1 }
    if (!d.has('base-uri')) { add('CSP', 'warn', 'base-uri not set', 'An injected <base> tag can redirect relative script URLs.', "base-uri 'self' (or 'none')"); s -= 0.1 }
    if (!d.has('form-action')) add('CSP', 'info', 'form-action not set', "Forms may post to any origin. Consider form-action 'self'.")
    if (d.has('report-uri') || d.has('report-to')) add('CSP', 'pass', 'CSP violation reporting configured', 'You will hear about blocked content.')
    if (s >= 0.95) add('CSP', 'pass', 'Content-Security-Policy present', `${d.size} directive(s): ${[...d.keys()].join(', ')}.`)
    score.CSP = Math.max(0.15, s)
  }

  // Framing
  const xfo = h('x-frame-options')?.toUpperCase()
  if (frameAncestors) { add('Framing', 'pass', 'Clickjacking protection via CSP frame-ancestors', 'Modern browsers use frame-ancestors and ignore X-Frame-Options when both exist.'); score.Framing = 1 }
  else if (xfo === 'DENY' || xfo === 'SAMEORIGIN') { add('Framing', 'pass', `X-Frame-Options: ${xfo}`, 'Pages cannot be framed by other sites.'); score.Framing = 1 }
  else if (xfo?.startsWith('ALLOW-FROM')) { add('Framing', 'warn', 'X-Frame-Options ALLOW-FROM is obsolete', 'Modern browsers ignore it, so the page can be framed.', "Use CSP frame-ancestors 'self' https://partner.example"); score.Framing = 0.3 }
  else { add('Framing', 'fail', 'No clickjacking protection', 'Neither X-Frame-Options nor CSP frame-ancestors is set.', "Content-Security-Policy: frame-ancestors 'self' (or X-Frame-Options: DENY)"); score.Framing = 0; rec.push('X-Frame-Options: DENY') }

  // nosniff
  const xcto = h('x-content-type-options')
  if (xcto?.toLowerCase() === 'nosniff') { add('MIME sniffing', 'pass', 'X-Content-Type-Options: nosniff', 'Browsers will not guess content types.'); score['MIME sniffing'] = 1 }
  else { add('MIME sniffing', 'fail', xcto ? `Invalid X-Content-Type-Options: ${xcto}` : 'X-Content-Type-Options missing', 'Browsers may MIME-sniff uploads into executable scripts or styles.', 'X-Content-Type-Options: nosniff'); score['MIME sniffing'] = 0; rec.push('X-Content-Type-Options: nosniff') }

  // Referrer
  const rp = h('referrer-policy')?.toLowerCase().split(',').map((x) => x.trim()).pop()
  const good = ['no-referrer', 'same-origin', 'strict-origin', 'strict-origin-when-cross-origin']
  if (!rp) { add('Referrer', 'warn', 'Referrer-Policy missing', 'Modern browsers default to strict-origin-when-cross-origin, but older ones leak full URLs (with tokens in query strings).', 'Referrer-Policy: strict-origin-when-cross-origin'); score.Referrer = 0.5; rec.push('Referrer-Policy: strict-origin-when-cross-origin') }
  else if (good.includes(rp)) { add('Referrer', 'pass', `Referrer-Policy: ${rp}`, 'Full URLs are not leaked to other sites.'); score.Referrer = 1 }
  else { add('Referrer', 'warn', `Weak Referrer-Policy: ${rp}`, 'Full URLs (paths, query strings) can leak to third parties.', 'Referrer-Policy: strict-origin-when-cross-origin'); score.Referrer = rp === 'origin' || rp === 'origin-when-cross-origin' ? 0.6 : 0.2 }

  // Permissions
  if (headers.has('permissions-policy')) { add('Permissions', 'pass', 'Permissions-Policy present', h('permissions-policy')!.slice(0, 160)); score.Permissions = 1 }
  else { add('Permissions', 'warn', 'Permissions-Policy missing', 'Embedded third-party content can request camera, microphone, geolocation and other powerful features.', 'Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()'); score.Permissions = headers.has('feature-policy') ? 0.5 : 0; rec.push('Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()') }
  if (headers.has('feature-policy')) add('Permissions', 'info', 'Feature-Policy is deprecated', 'Replace it with Permissions-Policy (different syntax).')

  // Cookies
  const cookies = (headers.get('set-cookie') ?? []).map(parseCookie)
  if (cookies.length) {
    let ok = 0
    for (const c of cookies) {
      const issues: string[] = []
      if (https && !c.secure) issues.push('no Secure')
      if (!c.httpOnly) issues.push('no HttpOnly')
      if (!c.sameSite) issues.push('no SameSite')
      if (c.sameSite === 'none' && !c.secure) issues.push('SameSite=None requires Secure')
      if (c.name.startsWith('__Host-') && (!c.secure || c.domain || c.path !== '/')) issues.push('invalid __Host- prefix (needs Secure, Path=/, no Domain)')
      if (c.name.startsWith('__Secure-') && !c.secure) issues.push('__Secure- prefix needs Secure')
      const severe = issues.some((i) => i.startsWith('no Secure') || i.includes('requires') || i.includes('prefix'))
      if (!issues.length) { ok++; add('Cookies', 'pass', `Cookie ${c.name}`, `Secure, HttpOnly, SameSite=${c.sameSite}.`) }
      else add('Cookies', severe ? 'fail' : 'warn', `Cookie ${c.name}: ${issues.join(', ')}`, !c.httpOnly ? 'Without HttpOnly, JavaScript (and XSS) can read it; fine only for cookies scripts must read.' : 'Set the missing attributes.', `Set-Cookie: ${c.name}=…; Path=/; Secure; HttpOnly; SameSite=Lax`)
      if (issues.length && !severe) ok += 0.5
    }
    score.Cookies = ok / cookies.length
  }

  // Information disclosure (penalty)
  let penalty = 0
  const server = h('server')
  if (server && /\d/.test(server)) { add('Disclosure', 'warn', `Server version disclosed: ${server}`, 'Version numbers help attackers pick exploits.', 'Strip versions (e.g. nginx: server_tokens off; Apache: ServerTokens Prod).'); penalty += 3 }
  for (const k of ['x-powered-by', 'x-aspnet-version', 'x-aspnetmvc-version', 'x-generator']) if (headers.has(k)) { add('Disclosure', 'warn', `${k} disclosed: ${h(k)}`, 'Reveals the framework and version.', `Remove the ${k} header.`); penalty += 2 }
  // Legacy / CORS / isolation
  const xxss = h('x-xss-protection')
  if (xxss && xxss.trim() !== '0') add('Legacy', 'info', `X-XSS-Protection: ${xxss}`, 'The XSS auditor is removed from modern browsers and could introduce leaks; OWASP recommends 0 or omitting the header. Rely on CSP.')
  const acao = h('access-control-allow-origin')
  if (acao === '*' && /true/i.test(h('access-control-allow-credentials') ?? '')) { add('CORS', 'fail', 'CORS: wildcard origin with credentials', 'Browsers reject this, and it often signals origin reflection elsewhere.'); penalty += 8 }
  else if (acao === '*') add('CORS', 'info', 'CORS allows any origin', 'Fine for public, unauthenticated resources only.')
  const coop = h('cross-origin-opener-policy')
  add('Isolation', coop ? 'pass' : 'info', coop ? `Cross-Origin-Opener-Policy: ${coop}` : 'Cross-Origin-Opener-Policy not set', coop ? 'Protects against cross-window attacks (XS-Leaks).' : 'Consider COOP: same-origin to isolate your window from cross-origin openers.')
  if (!https) add('Transport', 'fail', 'Plain HTTP', 'Everything (cookies, passwords) travels unencrypted.')

  let total = 0, got = 0
  for (const [k, w] of Object.entries(WEIGHTS)) if (score[k] !== undefined) { total += w; got += w * score[k] }
  let pts = Math.max(0, Math.round((100 * got) / (total || 1) - penalty - (https ? 0 : 30)))
  const anyFail = F.some((f) => f.level === 'fail')
  if (anyFail) pts = Math.min(pts, 89)
  const grade = pts >= 95 ? 'A+' : pts >= 85 ? 'A' : pts >= 70 ? 'B' : pts >= 55 ? 'C' : pts >= 40 ? 'D' : pts >= 25 ? 'E' : 'F'
  return { findings: F, score: pts, grade, recommended: rec }
}

export const SAMPLES: Record<string, string> = {
  'Legacy PHP site': `HTTP/1.1 200 OK
Date: Tue, 14 Oct 2025 09:12:44 GMT
Server: Apache/2.4.29 (Ubuntu)
X-Powered-By: PHP/7.2.24
Set-Cookie: PHPSESSID=8f2c1a; path=/
Content-Type: text/html; charset=UTF-8
X-XSS-Protection: 1; mode=block`,
  'Typical SPA on a CDN': `HTTP/2 200
content-type: text/html; charset=utf-8
server: cloudflare
strict-transport-security: max-age=15552000
x-content-type-options: nosniff
x-frame-options: SAMEORIGIN
content-security-policy: default-src 'self'; script-src 'self' 'unsafe-inline' https://www.googletagmanager.com; img-src * data:; style-src 'self' 'unsafe-inline'
referrer-policy: no-referrer-when-downgrade
set-cookie: session=abc123; Path=/; Secure; HttpOnly
access-control-allow-origin: *`,
  'Hardened app': `HTTP/2 200
content-type: text/html; charset=utf-8
strict-transport-security: max-age=63072000; includeSubDomains; preload
content-security-policy: default-src 'none'; script-src 'nonce-r4nd0m' 'strict-dynamic'; style-src 'self'; img-src 'self'; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; report-to csp
x-content-type-options: nosniff
referrer-policy: strict-origin-when-cross-origin
permissions-policy: camera=(), microphone=(), geolocation=(), payment=()
cross-origin-opener-policy: same-origin
set-cookie: __Host-sid=f81d4fae; Path=/; Secure; HttpOnly; SameSite=Lax`,
}
