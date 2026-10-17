// Platform-aware length counting: graphemes, X/Twitter weighted length, SMS GSM-7/UCS-2 segments.

export type Rule = 'graphemes' | 'utf16' | 'twitter' | 'sms' | 'bytes'

export interface Platform { id: string; group: string; name: string; limit: number; rule: Rule; note?: string }

export const PLATFORMS: Platform[] = [
  { id: 'x', group: 'Social', name: 'X / Twitter post', limit: 280, rule: 'twitter', note: 'URLs count 23, emoji and CJK count 2' },
  { id: 'threads', group: 'Social', name: 'Threads post', limit: 500, rule: 'graphemes' },
  { id: 'bluesky', group: 'Social', name: 'Bluesky post', limit: 300, rule: 'graphemes' },
  { id: 'mastodon', group: 'Social', name: 'Mastodon post', limit: 500, rule: 'twitter', note: 'URLs count 23' },
  { id: 'ig', group: 'Social', name: 'Instagram caption', limit: 2200, rule: 'utf16' },
  { id: 'igbio', group: 'Social', name: 'Instagram bio', limit: 150, rule: 'utf16' },
  { id: 'fb', group: 'Social', name: 'Facebook post', limit: 63206, rule: 'utf16' },
  { id: 'li', group: 'Social', name: 'LinkedIn post', limit: 3000, rule: 'utf16' },
  { id: 'lihead', group: 'Social', name: 'LinkedIn headline', limit: 220, rule: 'utf16' },
  { id: 'tiktok', group: 'Social', name: 'TikTok caption', limit: 4000, rule: 'utf16' },
  { id: 'pin', group: 'Social', name: 'Pinterest pin title', limit: 100, rule: 'utf16' },
  { id: 'reddit', group: 'Social', name: 'Reddit title', limit: 300, rule: 'utf16' },
  { id: 'yt', group: 'Video', name: 'YouTube title', limit: 100, rule: 'utf16' },
  { id: 'ytd', group: 'Video', name: 'YouTube description', limit: 5000, rule: 'bytes', note: 'counted in UTF-8 bytes' },
  { id: 'title', group: 'SEO & ads', name: 'Meta title (SERP)', limit: 60, rule: 'graphemes', note: 'Google truncates around 600 px' },
  { id: 'desc', group: 'SEO & ads', name: 'Meta description', limit: 160, rule: 'graphemes' },
  { id: 'gah', group: 'SEO & ads', name: 'Google Ads headline', limit: 30, rule: 'graphemes' },
  { id: 'gad', group: 'SEO & ads', name: 'Google Ads description', limit: 90, rule: 'graphemes' },
  { id: 'appsub', group: 'SEO & ads', name: 'App Store subtitle', limit: 30, rule: 'graphemes' },
  { id: 'sms', group: 'Messaging', name: 'SMS (1 segment)', limit: 160, rule: 'sms', note: '160 GSM-7 or 70 Unicode chars per segment' },
  { id: 'push', group: 'Messaging', name: 'Push notification', limit: 178, rule: 'graphemes', note: 'iOS lock-screen preview' },
  { id: 'git', group: 'Dev', name: 'Git commit subject', limit: 50, rule: 'graphemes' },
  { id: 'gitbody', group: 'Dev', name: 'Commit body line', limit: 72, rule: 'graphemes', note: 'per line (longest line)' },
]

const seg = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter('en', { granularity: 'grapheme' }) : null

export function graphemes(s: string): string[] {
  return seg ? [...seg.segment(s)].map((x) => x.segment) : [...s]
}

export const utf8Bytes = (s: string) => new TextEncoder().encode(s).length

// twitter-text v3 weighting: these code point ranges weigh 1, everything else 2 (scaled by 100).
const LIGHT: [number, number][] = [[0, 4351], [8192, 8205], [8208, 8223], [8242, 8247]]
const URL_RE = /\bhttps?:\/\/[^\s]+|\b(?:[a-z0-9-]+\.)+(?:com|org|net|io|dev|app|co|uk|de|fr|ua|ly|gl|me|ai)\b(?:\/[^\s]*)?/gi
const EMOJI_RE = /\p{Extended_Pictographic}/u

/** X/Twitter weighted length: URL = 23, emoji grapheme = 2, CJK etc. = 2. */
export function twitterLength(s: string): number {
  let total = 0
  const t = s.normalize('NFC').replace(URL_RE, () => {
    total += 23
    return ''
  })
  for (const g of graphemes(t)) {
    if (EMOJI_RE.test(g)) { total += 2; continue }
    for (const ch of g) {
      const cp = ch.codePointAt(0)!
      total += LIGHT.some(([a, b]) => cp >= a && cp <= b) ? 1 : 2
    }
  }
  return total
}

const GSM = '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà'
const GSM_EXT = '^{}\\[~]|€\f'

export interface Sms { encoding: 'GSM-7' | 'UCS-2'; units: number; segments: number; perSegment: number; nonGsm: string[] }

/** SMS length in encoding units and the number of concatenated segments. */
export function sms(s: string): Sms {
  const nonGsm = [...new Set([...s].filter((c) => !GSM.includes(c) && !GSM_EXT.includes(c)))]
  if (!nonGsm.length) {
    const units = [...s].reduce((a, c) => a + (GSM_EXT.includes(c) ? 2 : 1), 0)
    const segments = units <= 160 ? (units ? 1 : 0) : Math.ceil(units / 153)
    return { encoding: 'GSM-7', units, segments, perSegment: units <= 160 ? 160 : 153, nonGsm }
  }
  const units = s.length // UTF-16 code units
  const segments = units <= 70 ? (units ? 1 : 0) : Math.ceil(units / 67)
  return { encoding: 'UCS-2', units, segments, perSegment: units <= 70 ? 70 : 67, nonGsm }
}

/** Length of `s` under a platform's rule. For 'sms' the limit is fixed to one segment of the detected encoding. */
export function measure(s: string, p: Platform): { used: number; limit: number } {
  if (p.id === 'gitbody') return { used: Math.max(0, ...s.split('\n').map((l) => graphemes(l).length)), limit: p.limit }
  switch (p.rule) {
    case 'twitter': return { used: p.id === 'mastodon' ? graphemes(s.replace(URL_RE, 'x'.repeat(23))).length : twitterLength(s), limit: p.limit }
    case 'sms': { const r = sms(s); return { used: r.units, limit: r.encoding === 'GSM-7' ? 160 : 70 } }
    case 'bytes': return { used: utf8Bytes(s), limit: p.limit }
    case 'utf16': return { used: s.length, limit: p.limit }
    default: return { used: graphemes(s).length, limit: p.limit }
  }
}

/** Longest grapheme prefix that fits the platform; optionally cut at a word boundary and add “…”. */
export function fit(s: string, p: Platform, opts: { words?: boolean; ellipsis?: boolean } = {}): string {
  if (measure(s, p).used <= measure(s, p).limit) return s
  const gs = graphemes(s)
  const suffix = opts.ellipsis ? '…' : ''
  let lo = 0, hi = gs.length
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    const t = gs.slice(0, mid).join('') + suffix
    const m = measure(t, p)
    if (m.used <= m.limit) lo = mid
    else hi = mid - 1
  }
  let out = gs.slice(0, lo).join('')
  if (opts.words) {
    const cut = out.search(/\s+\S*$/)
    if (cut > out.length * 0.6) out = out.slice(0, cut)
  }
  return out.replace(/\s+$/, '') + suffix
}

export function stats(s: string) {
  return {
    graphemes: graphemes(s).length,
    codePoints: [...s].length,
    utf16: s.length,
    bytes: utf8Bytes(s),
    words: (s.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []).length,
    lines: s ? s.split('\n').length : 0,
    emoji: graphemes(s).filter((g) => EMOJI_RE.test(g)).length,
  }
}
