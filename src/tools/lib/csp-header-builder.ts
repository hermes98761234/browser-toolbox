// Content-Security-Policy model: directive catalogue, parser/serializer, evaluator and server snippets.

export type Directive = [string, string[]]

/** [name, kind, description]; kind: fetch (falls back to default-src), doc, nav, report, flag, other */
export const DIRECTIVES: [string, 'fetch' | 'doc' | 'nav' | 'report' | 'flag' | 'other', string][] = [
  ['default-src', 'fetch', 'Fallback for every other fetch directive that is not set.'],
  ['script-src', 'fetch', 'Where scripts may load from and whether inline scripts/eval run. The key directive against XSS.'],
  ['script-src-elem', 'fetch', 'Overrides script-src for <script> elements only.'],
  ['script-src-attr', 'fetch', 'Overrides script-src for inline event handlers (onclick=…).'],
  ['style-src', 'fetch', 'Stylesheets and inline <style>/style="" attributes.'],
  ['style-src-elem', 'fetch', 'Overrides style-src for <style> and <link rel=stylesheet>.'],
  ['style-src-attr', 'fetch', 'Overrides style-src for style="" attributes.'],
  ['img-src', 'fetch', 'Images and favicons.'],
  ['font-src', 'fetch', 'Web fonts loaded with @font-face.'],
  ['connect-src', 'fetch', 'fetch(), XHR, WebSocket, EventSource and sendBeacon targets.'],
  ['media-src', 'fetch', '<audio>, <video> and <track> sources.'],
  ['object-src', 'fetch', '<object> and <embed> (plugins). Should almost always be \'none\'.'],
  ['frame-src', 'fetch', 'Sources for <iframe> and <frame> on this page.'],
  ['child-src', 'fetch', 'Workers and frames (legacy fallback for frame-src/worker-src).'],
  ['worker-src', 'fetch', 'Web Worker, SharedWorker and Service Worker scripts.'],
  ['manifest-src', 'fetch', 'Web app manifest.'],
  ['base-uri', 'doc', 'Allowed URLs for <base href>. Prevents base-tag injection.'],
  ['sandbox', 'doc', 'Applies iframe-like sandbox restrictions to the page (not allowed in <meta>).'],
  ['form-action', 'nav', 'Where <form> submissions may go.'],
  ['frame-ancestors', 'nav', 'Who may embed this page in a frame (clickjacking protection; header only).'],
  ['report-to', 'report', 'Reporting API endpoint group name for violation reports.'],
  ['report-uri', 'report', 'Deprecated URL for violation reports (still widely supported; pair with report-to).'],
  ['upgrade-insecure-requests', 'flag', 'Rewrite http:// subresource URLs to https://.'],
  ['require-trusted-types-for', 'other', "Enforce Trusted Types for DOM XSS sinks ('script')."],
  ['trusted-types', 'other', 'Allowed Trusted Types policy names.'],
]
const KNOWN = new Set(DIRECTIVES.map((d) => d[0]))
const DEPRECATED: Record<string, string> = { 'block-all-mixed-content': 'deprecated; use upgrade-insecure-requests', 'plugin-types': 'removed from browsers', 'prefetch-src': 'removed from the spec', referrer: 'use the Referrer-Policy header', 'navigate-to': 'never shipped', 'reflected-xss': 'removed' }
const NO_SOURCES = new Set(['upgrade-insecure-requests', 'block-all-mixed-content'])

export const KEYWORDS = ["'self'", "'none'", "'unsafe-inline'", "'unsafe-eval'", "'strict-dynamic'", "'unsafe-hashes'", "'wasm-unsafe-eval'", "'report-sample'", "'inline-speculation-rules'"]
export const SCHEMES = ['https:', 'data:', 'blob:', 'wss:', 'mediastream:', 'filesystem:']

/** Hosts that serve JSONP endpoints or old AngularJS and so can bypass host allowlists. */
export const BYPASS_HOSTS = ['ajax.googleapis.com', '*.googleapis.com', 'www.google.com', 'accounts.google.com', 'cdnjs.cloudflare.com', 'cdn.jsdelivr.net', 'unpkg.com', '*.cloudfront.net', 'raw.githubusercontent.com', '*.github.io', '*.herokuapp.com', '*.appspot.com', '*.firebaseapp.com', 'ajax.aspnetcdn.com', 'code.jquery.com']

export function parsePolicy(text: string): Directive[] {
  const out: Directive[] = []
  const t = text.replace(/^\s*Content-Security-Policy(-Report-Only)?\s*:\s*/i, '').replace(/^.*content="([^"]*)".*$/is, '$1')
  for (const part of t.split(';')) {
    const toks = part.trim().split(/\s+/).filter(Boolean)
    if (!toks.length) continue
    out.push([toks[0].toLowerCase(), toks.slice(1)])
  }
  return out
}

export function serialize(ds: Directive[]): string {
  return ds.map(([n, s]) => (s.length ? `${n} ${s.join(' ')}` : n)).join('; ')
}

/** Effective source list for a fetch directive (falls back to default-src; script-src-elem → script-src → default-src). */
export function effective(ds: Directive[], name: string): string[] | null {
  const get = (n: string) => ds.find((d) => d[0] === n)?.[1] ?? null
  const chain: Record<string, string[]> = {
    'script-src-elem': ['script-src-elem', 'script-src', 'default-src'],
    'script-src-attr': ['script-src-attr', 'script-src', 'default-src'],
    'style-src-elem': ['style-src-elem', 'style-src', 'default-src'],
    'style-src-attr': ['style-src-attr', 'style-src', 'default-src'],
    'worker-src': ['worker-src', 'child-src', 'script-src', 'default-src'],
    'frame-src': ['frame-src', 'child-src', 'default-src'],
  }
  for (const n of chain[name] ?? [name, 'default-src']) {
    const v = get(n)
    if (v) return v
  }
  return null
}

export type Severity = 'high' | 'medium' | 'low' | 'info'
export interface Finding { sev: Severity; directive: string; msg: string }

const isNonce = (s: string) => /^'nonce-[A-Za-z0-9+/_=-]+'$/.test(s)
const isHash = (s: string) => /^'sha(256|384|512)-[A-Za-z0-9+/_=-]+'$/.test(s)

/** Evaluates a policy the way CSP evaluators do and returns findings, most severe first. */
export function evaluate(ds: Directive[]): Finding[] {
  const f: Finding[] = []
  const add = (sev: Severity, directive: string, msg: string) => f.push({ sev, directive, msg })
  const seen = new Set<string>()
  for (const [n, srcs] of ds) {
    if (seen.has(n)) add('medium', n, 'Duplicate directive: browsers ignore every occurrence after the first.')
    seen.add(n)
    if (DEPRECATED[n]) add('low', n, `"${n}" is ${DEPRECATED[n]}.`)
    else if (!KNOWN.has(n)) add('medium', n, `Unknown directive "${n}" (typo?).`)
    if (NO_SOURCES.has(n) && srcs.length) add('low', n, `${n} takes no values.`)
    for (const s of srcs) {
      const bare = s.toLowerCase()
      if (['self', 'none', 'unsafe-inline', 'unsafe-eval', 'strict-dynamic', 'unsafe-hashes', 'report-sample', 'wasm-unsafe-eval'].includes(bare)) add('high', n, `Keyword ${s} must be single-quoted: '${bare}'. Unquoted it is treated as a host name.`)
      if (/^'nonce-/.test(s) && !isNonce(s)) add('medium', n, `Malformed nonce ${s}.`)
      if (/^'nonce-[^']{1,15}'$/.test(s)) add('medium', n, 'Nonce is short; use at least 128 bits of randomness (≈22 base64 characters), new for every response.')
      if (/^http:\/\//i.test(s) || s === 'http:') add('medium', n, `${s} allows plain-HTTP loads that can be tampered with in transit.`)
    }
    if (srcs.includes("'none'") && srcs.length > 1) add('medium', n, "'none' is ignored when combined with other sources.")
  }

  const script = effective(ds, 'script-src')
  if (!script) add('high', 'script-src', 'No script-src or default-src: scripts from anywhere are allowed.')
  else {
    const hasNonceHash = script.some((s) => isNonce(s) || isHash(s))
    const strict = script.includes("'strict-dynamic'")
    if (script.includes("'unsafe-inline'")) {
      if (hasNonceHash) add('info', 'script-src', "'unsafe-inline' is ignored by modern browsers because a nonce/hash is present (kept as fallback for old browsers — fine).")
      else add('high', 'script-src', "'unsafe-inline' allows injected inline scripts and event handlers — this disables most XSS protection. Use nonces or hashes.")
    }
    if (script.includes("'unsafe-eval'")) add('medium', 'script-src', "'unsafe-eval' allows eval(), new Function() and string timers.")
    if (script.some((s) => s === '*' || s === 'https:' || s === 'http:' || s === 'data:' || s === 'blob:') && !strict) add('high', 'script-src', `Wildcard or scheme source (${script.filter((s) => ['*', 'https:', 'http:', 'data:', 'blob:'].includes(s)).join(', ')}) lets scripts load from any host.`)
    const bypass = script.filter((s) => BYPASS_HOSTS.some((h) => h === s.replace(/^https?:\/\//, '').replace(/\/.*$/, '')))
    if (bypass.length && !strict) add('medium', 'script-src', `${bypass.join(', ')} host JSONP endpoints or libraries (e.g. old AngularJS) that can be abused to bypass a host allowlist. Prefer nonces + 'strict-dynamic'.`)
    if (strict && !hasNonceHash) add('high', 'script-src', "'strict-dynamic' without a nonce or hash blocks all scripts.")
    if (!hasNonceHash && !script.includes("'unsafe-inline'")) add('info', 'script-src', 'Host-allowlist policy. A nonce-based policy with \'strict-dynamic\' is more robust against bypasses.')
  }
  const obj = effective(ds, 'object-src')
  if (!obj || !(obj.length === 1 && obj[0] === "'none'")) add(obj ? 'medium' : 'high', 'object-src', "Set object-src 'none' so plugin content (<object>/<embed>) cannot run scripts.")
  if (!seen.has('base-uri')) add(script?.some(isNonce) ? 'high' : 'medium', 'base-uri', "Missing base-uri: an injected <base> tag can redirect relative script URLs. Use base-uri 'none' or 'self'.")
  if (!seen.has('frame-ancestors')) add('low', 'frame-ancestors', "Missing frame-ancestors: the page can be framed (clickjacking). Use frame-ancestors 'none' or 'self'.")
  if (!seen.has('form-action')) add('info', 'form-action', 'form-action does not fall back to default-src; consider restricting it.')
  if (!seen.has('default-src')) add('low', 'default-src', "No default-src: unspecified fetch types (fonts, media, workers…) are unrestricted. Start with default-src 'self'.")
  if (seen.has('report-uri') && !seen.has('report-to')) add('info', 'report-uri', 'report-uri is deprecated; add report-to with a Reporting-Endpoints header (keep both for compatibility).')
  if (!seen.has('report-uri') && !seen.has('report-to')) add('info', 'reporting', 'No reporting endpoint: violations are only visible in the browser console.')
  if (!seen.has('upgrade-insecure-requests')) add('info', 'upgrade-insecure-requests', 'Consider upgrade-insecure-requests on HTTPS sites to avoid mixed content.')
  const style = effective(ds, 'style-src')
  if (style?.includes("'unsafe-inline'")) add('low', 'style-src', "'unsafe-inline' styles enable CSS-based data exfiltration and UI redressing; acceptable for many sites.")
  const order: Severity[] = ['high', 'medium', 'low', 'info']
  return f.sort((a, b) => order.indexOf(a.sev) - order.indexOf(b.sev))
}

/** 0–100 score and letter grade from findings. */
export function grade(fs: Finding[]): { score: number; letter: string } {
  const pen = { high: 25, medium: 10, low: 4, info: 0 }
  const score = Math.max(0, 100 - fs.reduce((a, x) => a + pen[x.sev], 0))
  return { score, letter: score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 40 ? 'D' : 'F' }
}

const META_UNSUPPORTED = ['frame-ancestors', 'report-uri', 'report-to', 'sandbox']

export function snippets(ds: Directive[], reportOnly: boolean) {
  const v = serialize(ds)
  const h = reportOnly ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy'
  const meta = serialize(ds.filter(([n]) => !META_UNSUPPORTED.includes(n)))
  const sq = v.replace(/'/g, "\\'")
  return {
    header: `${h}: ${v}`,
    meta: reportOnly ? '<!-- Report-Only cannot be delivered with <meta>; use the HTTP header. -->' : `<meta http-equiv="Content-Security-Policy" content="${meta.replace(/"/g, '&quot;')}">`,
    metaDropped: ds.filter(([n]) => META_UNSUPPORTED.includes(n)).map(([n]) => n),
    nginx: `add_header ${h} "${v.replace(/"/g, '\\"')}" always;`,
    apache: `Header always set ${h} "${v.replace(/"/g, '\\"')}"`,
    netlify: `/*\n  ${h}: ${v}`,
    express: `app.use((req, res, next) => {\n  res.setHeader('${h}', '${sq}')\n  next()\n})`,
    iis: `<add name="${h}" value="${v.replace(/"/g, '&quot;')}" />`,
  }
}

/** Random nonce: 16 bytes, base64. */
export function makeNonce(rand?: (n: Uint8Array<ArrayBuffer>) => void): string {
  const b = new Uint8Array(16)
  if (rand) rand(b)
  else crypto.getRandomValues(b)
  return btoa(String.fromCharCode(...b))
}

export const PRESETS: { name: string; desc: string; ds: Directive[] }[] = [
  {
    name: 'Strict (nonce + strict-dynamic)',
    desc: 'Google-recommended policy: only scripts carrying the per-response nonce (and what they load) run.',
    ds: [["script-src", ["'nonce-{NONCE}'", "'strict-dynamic'", 'https:', "'unsafe-inline'"]], ['object-src', ["'none'"]], ['base-uri', ["'none'"]], ['frame-ancestors', ["'self'"]], ['report-to', ['csp-endpoint']]],
  },
  {
    name: 'Same-origin site',
    desc: 'Everything from your own origin; images may also be data: URIs.',
    ds: [['default-src', ["'self'"]], ['img-src', ["'self'", 'data:']], ['object-src', ["'none'"]], ['base-uri', ["'self'"]], ['form-action', ["'self'"]], ['frame-ancestors', ["'none'"]], ['upgrade-insecure-requests', []]],
  },
  {
    name: 'SPA + CDN + API',
    desc: 'Single-page app with assets on a CDN, an API origin and Google Fonts.',
    ds: [['default-src', ["'self'"]], ['script-src', ["'self'", 'https://cdn.example.com']], ['style-src', ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com']], ['font-src', ["'self'", 'https://fonts.gstatic.com']], ['img-src', ["'self'", 'data:', 'https://cdn.example.com']], ['connect-src', ["'self'", 'https://api.example.com', 'wss://api.example.com']], ['object-src', ["'none'"]], ['base-uri', ["'self'"]], ['form-action', ["'self'"]], ['frame-ancestors', ["'none'"]], ['upgrade-insecure-requests', []]],
  },
  {
    name: 'Legacy (needs work)',
    desc: 'A typical first attempt with common mistakes — see the findings.',
    ds: [['default-src', ['*']], ['script-src', ["'self'", "'unsafe-inline'", "'unsafe-eval'", 'https://ajax.googleapis.com', 'http://cdn.example.com']], ['style-src', ["'self'", "'unsafe-inline'"]], ['report-uri', ['/csp-report']]],
  },
]
