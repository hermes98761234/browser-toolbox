// Offline URL risk analysis: never fetches anything. Parses the link, decodes punycode and nested
// encodings, and scores deceptive patterns (homographs, lookalike brands, @ tricks, redirects…).

// ---------- punycode (RFC 3492 bootstring) ----------
const BASE = 36, TMIN = 1, TMAX = 26, SKEW = 38, DAMP = 700, IBIAS = 72, IN = 128

function adapt(delta: number, n: number, first: boolean) {
  delta = first ? Math.floor(delta / DAMP) : delta >> 1
  delta += Math.floor(delta / n)
  let k = 0
  while (delta > ((BASE - TMIN) * TMAX) >> 1) {
    delta = Math.floor(delta / (BASE - TMIN))
    k += BASE
  }
  return k + Math.floor(((BASE - TMIN + 1) * delta) / (delta + SKEW))
}
const digitVal = (c: number) => (c - 48 < 10 ? c - 22 : c - 65 < 26 ? c - 65 : c - 97 < 26 ? c - 97 : BASE)
const digitChar = (d: number) => String.fromCharCode(d + 22 + 75 * +(d < 26))

/** Decodes one punycode label body (without "xn--"). Throws on malformed input. */
export function punyDecode(s: string): string {
  const out: number[] = []
  const b = s.lastIndexOf('-')
  for (let j = 0; j < Math.max(0, b); j++) out.push(s.charCodeAt(j))
  let n = IN, bias = IBIAS, i = 0
  for (let idx = b > 0 ? b + 1 : 0; idx < s.length; ) {
    const old = i
    for (let w = 1, k = BASE; ; k += BASE) {
      if (idx >= s.length) throw new Error('bad punycode')
      const d = digitVal(s.charCodeAt(idx++))
      if (d >= BASE) throw new Error('bad punycode digit')
      i += d * w
      const t = k <= bias ? TMIN : k >= bias + TMAX ? TMAX : k - bias
      if (d < t) break
      w *= BASE - t
    }
    bias = adapt(i - old, out.length + 1, old === 0)
    n += Math.floor(i / (out.length + 1))
    i %= out.length + 1
    out.splice(i++, 0, n)
  }
  return String.fromCodePoint(...out)
}

export function punyEncode(input: string): string {
  const cps = [...input].map((c) => c.codePointAt(0)!)
  let out = cps.filter((c) => c < 128).map((c) => String.fromCharCode(c)).join('')
  const basic = out.length
  let h = basic
  if (basic) out += '-'
  let n = IN, delta = 0, bias = IBIAS
  while (h < cps.length) {
    const m = Math.min(...cps.filter((c) => c >= n))
    delta += (m - n) * (h + 1)
    n = m
    for (const c of cps) {
      if (c < n) delta++
      if (c === n) {
        let q = delta
        for (let k = BASE; ; k += BASE) {
          const t = k <= bias ? TMIN : k >= bias + TMAX ? TMAX : k - bias
          if (q < t) break
          out += digitChar(t + ((q - t) % (BASE - t)))
          q = Math.floor((q - t) / (BASE - t))
        }
        out += digitChar(q)
        bias = adapt(delta, h + 1, h === basic)
        delta = 0
        h++
      }
    }
    delta++
    n++
  }
  return out
}

export const hostToUnicode = (host: string) =>
  host.split('.').map((l) => {
    if (!/^xn--/i.test(l)) return l
    try {
      return punyDecode(l.slice(4).toLowerCase())
    } catch {
      return l
    }
  }).join('.')

// ---------- confusables (hand-made subset) ----------
const CONF: Record<string, string> = {
  // Cyrillic
  а: 'a', в: 'b', е: 'e', ё: 'e', һ: 'h', і: 'i', ї: 'i', ј: 'j', к: 'k', ӏ: 'l', м: 'm', н: 'h', о: 'o', р: 'p', с: 'c', т: 't', у: 'y', х: 'x', ѕ: 's', ԁ: 'd', ԛ: 'q', ԝ: 'w', ѡ: 'w', ь: 'b', г: 'r', п: 'n',
  // Greek
  α: 'a', β: 'b', ε: 'e', η: 'n', ι: 'i', κ: 'k', ν: 'v', ο: 'o', ρ: 'p', τ: 't', υ: 'u', χ: 'x', γ: 'y', ω: 'w',
  // Latin look-alikes
  ı: 'i', ł: 'l', ɑ: 'a', ɡ: 'g', ɩ: 'i', ʟ: 'l', ƅ: 'b', ɢ: 'g', ḿ: 'm', ṁ: 'm', ọ: 'o', ò: 'o', ó: 'o', ö: 'o', ô: 'o', õ: 'o', à: 'a', á: 'a', ä: 'a', â: 'a', ã: 'a', å: 'a', è: 'e', é: 'e', ë: 'e', ê: 'e', ì: 'i', í: 'i', ï: 'i', î: 'i', ù: 'u', ú: 'u', ü: 'u', û: 'u', ç: 'c', ñ: 'n', ý: 'y', ÿ: 'y', š: 's', ž: 'z', ś: 's', ź: 'z', ż: 'z', ń: 'n', ć: 'c', ę: 'e', ą: 'a', ğ: 'g', ş: 's',
  // digits and symbols
  '0': 'o', '1': 'l', '3': 'e', '5': 's', '7': 't', '$': 's', '|': 'l',
}
const MULTI: [RegExp, string][] = [[/rn/g, 'm'], [/vv/g, 'w'], [/cl/g, 'd'], [/nn/g, 'm']]

/** Visual "skeleton" of a label: every confusable character replaced by its Latin look-alike. */
export function skeleton(label: string): string {
  let s = [...label.toLowerCase()].map((c) => CONF[c] ?? c).join('')
  for (const [re, r] of MULTI) s = s.replace(re, r)
  return s.replace(/l/g, 'i') // l / I / 1 are interchangeable in many fonts
}

export function scriptOf(ch: string): string {
  const c = ch.codePointAt(0)!
  if (/[a-z0-9\-_]/i.test(ch)) return 'Latin'
  if (c >= 0x400 && c <= 0x52f) return 'Cyrillic'
  if (c >= 0x370 && c <= 0x3ff) return 'Greek'
  if (c >= 0x530 && c <= 0x58f) return 'Armenian'
  if (c >= 0xc0 && c <= 0x24f) return 'Latin'
  if (c >= 0x250 && c <= 0x2af) return 'Latin (IPA)'
  if (c >= 0x590 && c <= 0x6ff) return 'Hebrew/Arabic'
  if (c >= 0x3040 && c <= 0x30ff) return 'Japanese'
  if (c >= 0x4e00 && c <= 0x9fff) return 'Han'
  if (c >= 0xac00 && c <= 0xd7af) return 'Hangul'
  return 'Other'
}

// ---------- reference lists ----------
export const BRANDS = [
  'google.com', 'gmail.com', 'youtube.com', 'facebook.com', 'instagram.com', 'whatsapp.com', 'apple.com', 'icloud.com', 'microsoft.com', 'live.com',
  'outlook.com', 'office.com', 'amazon.com', 'paypal.com', 'netflix.com', 'linkedin.com', 'twitter.com', 'github.com', 'dropbox.com', 'adobe.com',
  'ebay.com', 'chase.com', 'wellsfargo.com', 'bankofamerica.com', 'coinbase.com', 'binance.com', 'dhl.com', 'fedex.com', 'usps.com', 'steamcommunity.com',
  'roblox.com', 'yahoo.com', 'spotify.com', 'docusign.com', 'wetransfer.com', 'metamask.io', 'booking.com', 'airbnb.com', 'discord.com', 'telegram.org',
]
export const SHORTENERS = ['bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'ow.ly', 'is.gd', 'buff.ly', 'rebrand.ly', 'cutt.ly', 's.id', 't.ly', 'shorturl.at', 'rb.gy', 'tiny.cc', 'bl.ink', 'lnkd.in', 'qrco.de', 'v.gd', 'shorte.st', 'adf.ly']
export const RISKY_TLDS = ['zip', 'mov', 'xyz', 'top', 'tk', 'ml', 'ga', 'cf', 'gq', 'work', 'click', 'country', 'loan', 'men', 'kim', 'rest', 'cam', 'icu', 'buzz', 'monster', 'quest', 'cyou', 'sbs', 'cfd', 'lol', 'support', 'live', 'beauty', 'hair', 'bond']
const MULTI_SUFFIX = ['co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'com.au', 'net.au', 'co.jp', 'co.nz', 'com.br', 'co.in', 'co.za', 'com.mx', 'com.tr', 'com.ua', 'com.cn', 'co.kr', 'com.sg', 'com.ar']
const REDIRECT_KEYS = /^(url|uri|u|r|redirect|redirect_?ur[il]|redir|next|return|return_?to|returnurl|continue|dest|destination|target|goto|out|link|to|forward|q|data|site|ref)$/i
const KEYWORDS = ['login', 'log-in', 'signin', 'sign-in', 'verify', 'verification', 'secure', 'security', 'account', 'update', 'confirm', 'password', 'wallet', 'unlock', 'suspended', 'billing', 'invoice', 'support', 'recovery', 'webscr', 'auth']

export function registrable(host: string): { domain: string; label: string; tld: string; subs: string[] } {
  const parts = host.split('.').filter(Boolean)
  const two = parts.slice(-2).join('.')
  const n = MULTI_SUFFIX.includes(two) ? 3 : 2
  const dom = parts.slice(-n)
  return { domain: dom.join('.'), label: dom[0] ?? '', tld: dom.slice(1).join('.'), subs: parts.slice(0, -n) }
}

/** Optimal-string-alignment edit distance (insert, delete, substitute, adjacent swap). */
export function editDistance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 0; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
    }
  return d[a.length][b.length]
}

/** Repeatedly percent-decodes (and unwraps base64 that hides a URL); returns every layer. */
export function decodeLayers(s: string): string[] {
  const layers = [s]
  let cur = s
  for (let i = 0; i < 6; i++) {
    let next = cur
    if (/%[0-9a-f]{2}/i.test(cur)) {
      try {
        next = decodeURIComponent(cur.replace(/\+/g, ' '))
      } catch {
        next = cur.replace(/%([0-9a-f]{2})/gi, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
      }
    } else if (/^[A-Za-z0-9+/_-]{12,}={0,2}$/.test(cur)) {
      try {
        const b = atob(cur.replace(/-/g, '+').replace(/_/g, '/'))
        if (/^(https?:)?\/\//i.test(b) || /^[\x20-\x7e]+$/.test(b) && /\.[a-z]{2,}/i.test(b)) next = b
      } catch {
        /* not base64 */
      }
    }
    if (next === cur) break
    layers.push(next)
    cur = next
  }
  return layers
}

// ---------- analysis ----------
export type Sev = 'info' | 'low' | 'medium' | 'high' | 'critical'
export interface Finding { sev: Sev; title: string; detail: string; points: number }
export interface Report {
  ok: boolean
  error?: string
  input: string
  href: string
  scheme: string
  host: string
  unicodeHost: string
  port: string
  path: string
  user: string
  domain: string
  findings: Finding[]
  score: number
  verdict: 'Low' | 'Medium' | 'High'
  params: { key: string; value: string; layers: string[] }[]
  nested: Report[]
  lookalike?: { brand: string; how: string }
}

const PTS: Record<Sev, number> = { info: 0, low: 8, medium: 18, high: 35, critical: 60 }

export function analyze(raw: string, depth = 0): Report {
  const input = raw.trim()
  const base: Report = { ok: false, input, href: '', scheme: '', host: '', unicodeHost: '', port: '', path: '', user: '', domain: '', findings: [], score: 0, verdict: 'Low', params: [], nested: [] }
  if (!input) return { ...base, error: 'Paste a link to inspect.' }
  const F: Finding[] = []
  const add = (sev: Sev, title: string, detail: string) => F.push({ sev, title, detail, points: PTS[sev] })
  if (/^\s*(javascript|vbscript):/i.test(input)) {
    add('critical', 'Script URL', 'javascript: links run code in the page when clicked — never a normal web address.')
    return { ...base, ok: true, scheme: 'javascript', findings: F, score: 100, verdict: 'High' }
  }
  if (/^\s*data:/i.test(input)) {
    add('critical', 'data: URL', 'The whole page is embedded in the link itself (often used for fake login forms that have no real website).')
    return { ...base, ok: true, scheme: 'data', findings: F, score: 90, verdict: 'High' }
  }
  let text = input
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) {
    text = 'http://' + text.replace(/^\/\//, '')
    add('info', 'No scheme given', 'Interpreted as http://. Browsers usually add https:// automatically.')
  }
  let u: URL
  try {
    u = new URL(text)
  } catch {
    return { ...base, error: 'This does not parse as a URL.' }
  }
  const rawHost = (/^[a-z][a-z0-9+.-]*:\/\/([^/?#]*)/i.exec(text)?.[1] ?? '').replace(/^.*@/, '').replace(/:\d+$/, '')
  const host = u.hostname.toLowerCase()
  const uni = hostToUnicode(host)
  const reg = registrable(host)
  const R: Report = { ...base, ok: true, href: u.href, scheme: u.protocol.replace(':', ''), host, unicodeHost: uni, port: u.port, path: u.pathname, user: u.username ? decodeURIComponent(u.username) + (u.password ? ':***' : '') : '', domain: reg.domain }

  if (u.protocol === 'http:') add('low', 'Not encrypted (http)', 'Anything typed on this page can be read or altered in transit. Real login pages use https.')
  else if (!['https:', 'http:'].includes(u.protocol)) add('medium', `Unusual scheme “${u.protocol}”`, 'Links in messages are normally http(s).')

  if (u.username || u.password) {
    add('high', '“@” user-info trick', `Everything before “@” (“${R.user}”) is ignored by the browser — the real destination is ${host}. Attackers put a trusted name there to fool you.`)
  }

  const ipv4 = /^\d{1,3}(\.\d{1,3}){3}$/.test(host)
  if (ipv4 || host.startsWith('[')) {
    add('high', 'Raw IP address instead of a domain', `The link points to ${host}. Legitimate services almost always use a name.`)
    if (ipv4 && rawHost.toLowerCase() !== host) add('high', 'Obfuscated IP address', `Written as “${rawHost}” (decimal/hex/octal form) to hide that it is the IP ${host}.`)
  }
  if (u.port && !['80', '443'].includes(u.port)) add('medium', `Non-standard port :${u.port}`, 'Websites of real companies rarely need a custom port.')

  // punycode / mixed scripts / homographs
  const labels = uni.split('.')
  if (host.includes('xn--')) add('medium', 'Internationalised (punycode) domain', `${host} is displayed as “${uni}”. Check the characters closely.`)
  for (const l of labels) {
    const scripts = new Set([...l].filter((c) => /\p{L}/u.test(c)).map(scriptOf).map((s) => (s.startsWith('Latin') ? 'Latin' : s)))
    if (scripts.size > 1) add('high', 'Mixed alphabets in one label', `“${l}” mixes ${[...scripts].join(' + ')} letters — a classic homograph trick.`)
    else if (scripts.size === 1 && !scripts.has('Latin') && [...l].every((c) => !/\p{L}/u.test(c) || CONF[c])) add('high', 'Whole-label look-alike', `“${l}” is written entirely in ${[...scripts][0]} letters that look Latin (reads as “${skeleton(l)}”).`)
  }

  // lookalike brands
  const regUni = hostToUnicode(reg.domain)
  const regLabel = regUni.split('.')[0]
  const isBrand = BRANDS.includes(reg.domain)
  if (!isBrand && regLabel) {
    const sk = skeleton(regLabel)
    for (const b of BRANDS) {
      const bl = b.split('.')[0]
      if (bl.length < 4) continue
      const bsk = skeleton(bl)
      let how = ''
      if (sk === bsk && regLabel !== bl) how = `uses look-alike characters (“${regLabel}” → “${bl}”)`
      else if (regLabel === bl) how = `uses the brand name with a different ending (.${reg.domain.split('.').slice(1).join('.')} instead of .${b.split('.').slice(1).join('.')})`
      else {
        const d = editDistance(sk, bsk)
        if (d > 0 && d <= (bl.length >= 7 ? 2 : 1)) how = `is ${d} edit${d > 1 ? 's' : ''} away from “${bl}” (typosquatting)`
        else if (regLabel.includes(bl) || regLabel.split(/[-_]/).includes(bl)) how = `embeds “${bl}” inside a different domain`
      }
      if (how) {
        R.lookalike = { brand: b, how }
        add('high', `Looks like ${b}`, `The real domain ${regUni} ${how}.`)
        break
      }
    }
    if (!R.lookalike) {
      const inSub = BRANDS.find((b) => reg.subs.some((s) => s === b.split('.')[0] || s.includes(b.split('.')[0]) && b.split('.')[0].length >= 5) || reg.subs.join('.').includes(b))
      if (inSub) add('high', `Brand name in a subdomain`, `“${inSub.split('.')[0]}” appears in the subdomain, but the site actually belongs to ${regUni}.`)
      const inPath = BRANDS.find((b) => b.split('.')[0].length >= 5 && u.pathname.toLowerCase().includes(b.split('.')[0]))
      if (inPath) add('low', 'Brand name in the path', `“${inPath.split('.')[0]}” appears after the domain, which anyone can write. The site is ${regUni}.`)
    }
  } else if (isBrand) add('info', 'Exact match of a well-known domain', `${reg.domain} is on the built-in brand list. (Still check the whole link.)`)

  const tld = host.split('.').pop() ?? ''
  if (RISKY_TLDS.includes(tld)) add('medium', `Frequently abused ending .${tld}`, `.${tld} domains are cheap and common in spam/phishing reports${tld === 'zip' || tld === 'mov' ? ' — and look like file names' : ''}.`)
  if (SHORTENERS.includes(host) || SHORTENERS.includes(reg.domain)) add('medium', 'URL shortener', 'The real destination is hidden. Expand it with the shortener’s preview feature before opening.')
  if (reg.subs.length >= 3) add('low', `${reg.subs.length} levels of subdomains`, 'Long chains of subdomains are used to push the real domain out of view on phones.')
  if ((reg.label.match(/-/g) ?? []).length >= 2) add('low', 'Many hyphens in the domain', 'Domains like secure-login-account-update.com are typical of phishing kits.')
  const kw = KEYWORDS.filter((k) => (host + u.pathname).toLowerCase().includes(k))
  if (kw.length) add(kw.length >= 2 && !isBrand ? 'medium' : 'low', 'Pressure / credential keywords', `Contains: ${kw.join(', ')}.`)
  if (input.length > 120) add('low', 'Very long URL', `${input.length} characters — long links hide the important part.`)
  if (/%[0-9a-f]{2}/i.test(rawHost)) add('high', 'Encoded characters in the host', 'Percent-encoding in a domain name is only used to disguise it.')
  if (/%25[0-9a-f]{2}/i.test(input)) add('medium', 'Double-encoded characters', 'Text encoded twice (%25xx) is often used to slip past filters.')
  if (/\.(exe|scr|js|vbs|bat|cmd|msi|iso|apk|hta|lnk)$/i.test(u.pathname)) add('high', 'Links directly to a program', `The path ends in ${/\.[a-z]+$/i.exec(u.pathname)![0]} — opening it would download executable content.`)

  // redirect parameters and nested URLs
  for (const [key, value] of u.searchParams) {
    const layers = decodeLayers(value)
    const last = layers[layers.length - 1]
    R.params.push({ key, value, layers })
    const looksUrl = /^(https?:)?\/\/[^\s]+/i.test(last) || /^[a-z0-9-]+(\.[a-z0-9-]+)+\/?/i.test(last) && REDIRECT_KEYS.test(key)
    if (looksUrl) {
      add(REDIRECT_KEYS.test(key) ? 'medium' : 'low', `Redirect parameter “${key}”`, `Sends you on to ${last.slice(0, 120)}${layers.length > 2 ? ` (hidden under ${layers.length - 1} layers of encoding)` : ''}.`)
      if (depth < 3) R.nested.push(analyze(last.startsWith('//') ? 'https:' + last : last, depth + 1))
    }
  }
  if (u.hash.length > 1) {
    const h = decodeLayers(u.hash.slice(1))
    const last = h[h.length - 1]
    if (/(https?:)?\/\/[a-z0-9.-]+\.[a-z]{2,}/i.test(last) && depth < 3) {
      add('low', 'URL inside the fragment (#)', `The part after # contains ${last.slice(0, 100)}.`)
      R.nested.push(analyze(last.replace(/^.*?(https?:\/\/)/i, '$1'), depth + 1))
    }
  }

  const nestedMax = R.nested.reduce((m, n) => Math.max(m, n.score), 0)
  const score = Math.min(100, F.reduce((a, f) => a + f.points, 0) + Math.round(nestedMax * 0.6))
  R.findings = F.sort((a, b) => b.points - a.points)
  R.score = score
  R.verdict = score >= 50 ? 'High' : score >= 20 ? 'Medium' : 'Low'
  return R
}
