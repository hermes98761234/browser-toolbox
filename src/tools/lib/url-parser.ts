// URL inspection helpers built on the WHATWG URL API: component breakdown, IDN decoding, query editing, warnings.

export interface Param { id: string; key: string; value: string; on: boolean }

// ---------- Punycode (RFC 3492) decoding, for showing IDN hostnames ----------
const BASE = 36, TMIN = 1, TMAX = 26, SKEW = 38, DAMP = 700
function adapt(delta: number, num: number, first: boolean): number {
  delta = first ? Math.floor(delta / DAMP) : delta >> 1
  delta += Math.floor(delta / num)
  let k = 0
  while (delta > ((BASE - TMIN) * TMAX) >> 1) { delta = Math.floor(delta / (BASE - TMIN)); k += BASE }
  return k + Math.floor(((BASE - TMIN + 1) * delta) / (delta + SKEW))
}
export function punyDecode(label: string): string {
  const out: number[] = []
  const d = label.lastIndexOf('-')
  for (let j = 0; j < Math.max(0, d); j++) out.push(label.charCodeAt(j))
  let i = 0, n = 128, bias = 72
  for (let p = d > 0 ? d + 1 : 0; p < label.length;) {
    const old = i
    for (let w = 1, k = BASE; ; k += BASE) {
      if (p >= label.length) throw new Error('bad punycode')
      const c = label.charCodeAt(p++)
      const digit = c - 48 < 10 ? c - 22 : c - 65 < 26 ? c - 65 : c - 97 < 26 ? c - 97 : BASE
      if (digit >= BASE) throw new Error('bad punycode')
      i += digit * w
      const t = k <= bias ? TMIN : k >= bias + TMAX ? TMAX : k - bias
      if (digit < t) break
      w *= BASE - t
    }
    bias = adapt(i - old, out.length + 1, old === 0)
    n += Math.floor(i / (out.length + 1))
    i %= out.length + 1
    out.splice(i++, 0, n)
  }
  return String.fromCodePoint(...out)
}
export const unicodeHost = (host: string) => host.split('.').map((l) => { try { return /^xn--/i.test(l) ? punyDecode(l.slice(4).toLowerCase()) : l } catch { return l } }).join('.')

// ---------- domain split ----------
const MULTI = new Set(['co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'me.uk', 'com.au', 'net.au', 'org.au', 'co.nz', 'co.jp', 'ne.jp', 'or.jp', 'com.br', 'com.mx', 'com.tr', 'com.ua', 'co.za', 'co.in', 'co.kr', 'com.cn', 'com.sg', 'com.ar', 'co.il', 'com.pl', 'github.io', 'gitlab.io', 'pages.dev', 'netlify.app', 'vercel.app', 'herokuapp.com', 'blogspot.com'])
export function splitHost(host: string): { sub: string; domain: string; suffix: string; ip: boolean } {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith('[')) return { sub: '', domain: host, suffix: '', ip: true }
  const parts = host.split('.')
  if (parts.length < 2) return { sub: '', domain: host, suffix: '', ip: false }
  const two = parts.slice(-2).join('.')
  const sl = MULTI.has(two) && parts.length > 2 ? 2 : 1
  return { sub: parts.slice(0, -(sl + 1)).join('.'), domain: parts[parts.length - sl - 1], suffix: parts.slice(-sl).join('.'), ip: false }
}

// ---------- parsing ----------
const DEFAULT_PORT: Record<string, string> = { 'http:': '80', 'https:': '443', 'ftp:': '21', 'ws:': '80', 'wss:': '443' }
export const TRACKING = /^(utm_[a-z_]+|fbclid|gclid|gbraid|wbraid|dclid|msclkid|mc_eid|mc_cid|_hsenc|_hsmi|igshid|yclid|twclid|ttclid|li_fat_id|ref_src|s_cid|oly_[a-z_]+|vero_[a-z_]+|mkt_tok|_ga|_gl)$/i

let seq = 0
export const pid = () => `p${(seq++).toString(36)}`

export function parseQuery(q: string): Param[] {
  const s = q.replace(/^[?#]/, '')
  if (!s) return []
  return s.split('&').filter((x) => x !== '').map((pair) => {
    const i = pair.indexOf('=')
    const dec = (t: string) => { try { return decodeURIComponent(t.replace(/\+/g, ' ')) } catch { return t } }
    return { id: pid(), key: dec(i < 0 ? pair : pair.slice(0, i)), value: i < 0 ? '' : dec(pair.slice(i + 1)), on: true }
  })
}
/** application/x-www-form-urlencoded (same as URLSearchParams.toString: spaces → +). */
export const formEncode = (s: string) => encodeURIComponent(s).replace(/%20/g, '+').replace(/[!'()~]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())
export const buildQuery = (ps: Param[], plusSpaces = true) => ps.filter((p) => p.on && p.key !== '').map((p) => { const e = plusSpaces ? formEncode : encodeURIComponent; return p.value === '' ? e(p.key) : `${e(p.key)}=${e(p.value)}` }).join('&')

export interface Parsed {
  url: URL
  input: string
  fixed: boolean
  host: { sub: string; domain: string; suffix: string; ip: boolean; unicode: string }
  segments: string[]
  params: Param[]
  hashParams: Param[]
  warnings: { level: 'info' | 'warn'; text: string }[]
}

export function parse(input: string): Parsed | { error: string } {
  let s = input.trim()
  if (!s) return { error: 'Paste a URL to inspect it.' }
  let fixed = false
  if (!/^[a-z][a-z\d+.-]*:/i.test(s)) { s = (s.startsWith('//') ? 'https:' : 'https://') + s; fixed = true }
  let url: URL
  try { url = new URL(s) } catch { return { error: 'This is not a valid URL (check spaces, brackets and the host name).' } }
  const segments = url.pathname.split('/').filter(Boolean).map((x) => { try { return decodeURIComponent(x) } catch { return x } })
  const params = parseQuery(url.search)
  const hashParams = /^#[\w.%[\]-]+=/.test(url.hash) ? parseQuery(url.hash) : url.hash.includes('?') ? parseQuery(url.hash.slice(url.hash.indexOf('?'))) : []
  const h = splitHost(url.hostname)
  const unicode = unicodeHost(url.hostname)
  const warnings: Parsed['warnings'] = []
  if (fixed) warnings.push({ level: 'info', text: 'No scheme given — assumed https://.' })
  if (url.protocol === 'http:') warnings.push({ level: 'warn', text: 'Uses plain HTTP: traffic is not encrypted.' })
  if (url.username || url.password) warnings.push({ level: 'warn', text: 'Contains credentials (user:password@). Never share URLs with embedded passwords.' })
  if (h.ip) warnings.push({ level: 'info', text: 'Host is an IP address rather than a domain name.' })
  if (unicode !== url.hostname) warnings.push({ level: 'warn', text: `Internationalised domain (punycode): displays as “${unicode}”. Check for look-alike characters.` })
  if (url.port && url.port !== DEFAULT_PORT[url.protocol]) warnings.push({ level: 'info', text: `Non-standard port ${url.port}.` })
  if (/%25[0-9a-f]{2}/i.test(url.href)) warnings.push({ level: 'warn', text: 'Looks double-encoded (%25xx): something encoded an already-encoded value.' })
  const keys = params.map((p) => p.key)
  const dup = [...new Set(keys.filter((k, i) => keys.indexOf(k) !== i))]
  if (dup.length) warnings.push({ level: 'info', text: `Repeated parameter(s): ${dup.join(', ')} — servers differ in which value they use.` })
  const tr = params.filter((p) => TRACKING.test(p.key)).length
  if (tr) warnings.push({ level: 'info', text: `${tr} tracking parameter(s) (utm_*, fbclid, gclid…) can be removed safely in most cases.` })
  if (url.href.length > 2000) warnings.push({ level: 'warn', text: `Very long URL (${url.href.length} characters); some browsers, proxies and servers cap URLs around 2,000–8,000.` })
  for (const p of params) if (/^(https?:)?\/\//i.test(p.value)) { warnings.push({ level: 'info', text: `Parameter “${p.key}” contains another URL (possible redirect target).` }); break }
  return { url, input, fixed, host: { ...h, unicode }, segments, params, hashParams, warnings }
}

export function rebuild(base: URL, o: { protocol: string; host: string; path: string; params: Param[]; hash: string; plusSpaces: boolean }): string {
  const q = buildQuery(o.params, o.plusSpaces)
  const auth = base.username ? `${base.username}${base.password ? ':' + base.password : ''}@` : ''
  const path = o.path.startsWith('/') || o.path === '' ? o.path : '/' + o.path
  return `${o.protocol}//${auth}${o.host}${path}${q ? '?' + q : ''}${o.hash ? (o.hash.startsWith('#') ? o.hash : '#' + o.hash) : ''}`
}

export type Codec = 'component' | 'uri' | 'form'
export function encode(s: string, c: Codec): string {
  return c === 'component' ? encodeURIComponent(s) : c === 'uri' ? encodeURI(s) : formEncode(s)
}
export function decode(s: string, c: Codec): string {
  try { return c === 'form' ? decodeURIComponent(s.replace(/\+/g, ' ')) : c === 'uri' ? decodeURI(s) : decodeURIComponent(s) } catch { throw new Error('Malformed percent-encoding (a % not followed by two hex digits, or an invalid UTF-8 sequence).') }
}
