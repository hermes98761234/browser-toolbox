// Text cleaning pipeline: Unicode normalization, invisible/control characters, exotic spaces,
// typographic punctuation, whitespace and line clean-up. Each step reports how many changes it made.

export interface Opts {
  norm: 'none' | 'NFC' | 'NFKC'
  html: boolean
  invisible: boolean
  keepEmojiZwj: boolean
  control: boolean
  spaces: boolean
  quotes: boolean
  dashes: boolean
  ellipsis: boolean
  bullets: boolean
  eol: boolean
  tabs: boolean
  trailing: boolean
  collapse: boolean
  blank: boolean
  unwrap: boolean
  trim: boolean
}

export const DEFAULT_OPTS: Opts = {
  norm: 'NFC', html: false, invisible: true, keepEmojiZwj: true, control: true, spaces: true, quotes: true, dashes: false, ellipsis: true, bullets: false,
  eol: true, tabs: false, trailing: true, collapse: true, blank: true, unwrap: false, trim: true,
}

export type Cat = 'invisible' | 'bidi' | 'tag' | 'space' | 'control' | 'quote' | 'dash' | 'other'
export interface CharInfo { name: string; cat: Cat; short: string }

const N: Record<number, [string, Cat, string]> = {
  0x00a0: ['NO-BREAK SPACE', 'space', 'NBSP'], 0x00ad: ['SOFT HYPHEN', 'invisible', 'SHY'], 0x034f: ['COMBINING GRAPHEME JOINER', 'invisible', 'CGJ'],
  0x061c: ['ARABIC LETTER MARK', 'bidi', 'ALM'], 0x115f: ['HANGUL CHOSEONG FILLER', 'invisible', 'HCF'], 0x1160: ['HANGUL JUNGSEONG FILLER', 'invisible', 'HJF'],
  0x1680: ['OGHAM SPACE MARK', 'space', 'OSM'], 0x180e: ['MONGOLIAN VOWEL SEPARATOR', 'invisible', 'MVS'],
  0x2000: ['EN QUAD', 'space', 'NQSP'], 0x2001: ['EM QUAD', 'space', 'MQSP'], 0x2002: ['EN SPACE', 'space', 'ENSP'], 0x2003: ['EM SPACE', 'space', 'EMSP'],
  0x2004: ['THREE-PER-EM SPACE', 'space', '3/MSP'], 0x2005: ['FOUR-PER-EM SPACE', 'space', '4/MSP'], 0x2006: ['SIX-PER-EM SPACE', 'space', '6/MSP'],
  0x2007: ['FIGURE SPACE', 'space', 'FSP'], 0x2008: ['PUNCTUATION SPACE', 'space', 'PSP'], 0x2009: ['THIN SPACE', 'space', 'THSP'], 0x200a: ['HAIR SPACE', 'space', 'HSP'],
  0x200b: ['ZERO WIDTH SPACE', 'invisible', 'ZWSP'], 0x200c: ['ZERO WIDTH NON-JOINER', 'invisible', 'ZWNJ'], 0x200d: ['ZERO WIDTH JOINER', 'invisible', 'ZWJ'],
  0x200e: ['LEFT-TO-RIGHT MARK', 'bidi', 'LRM'], 0x200f: ['RIGHT-TO-LEFT MARK', 'bidi', 'RLM'],
  0x2028: ['LINE SEPARATOR', 'space', 'LSEP'], 0x2029: ['PARAGRAPH SEPARATOR', 'space', 'PSEP'],
  0x202a: ['LEFT-TO-RIGHT EMBEDDING', 'bidi', 'LRE'], 0x202b: ['RIGHT-TO-LEFT EMBEDDING', 'bidi', 'RLE'], 0x202c: ['POP DIRECTIONAL FORMATTING', 'bidi', 'PDF'],
  0x202d: ['LEFT-TO-RIGHT OVERRIDE', 'bidi', 'LRO'], 0x202e: ['RIGHT-TO-LEFT OVERRIDE', 'bidi', 'RLO'], 0x202f: ['NARROW NO-BREAK SPACE', 'space', 'NNBSP'],
  0x205f: ['MEDIUM MATHEMATICAL SPACE', 'space', 'MMSP'], 0x2060: ['WORD JOINER', 'invisible', 'WJ'], 0x2061: ['FUNCTION APPLICATION', 'invisible', 'FA'],
  0x2062: ['INVISIBLE TIMES', 'invisible', 'IT'], 0x2063: ['INVISIBLE SEPARATOR', 'invisible', 'IS'], 0x2064: ['INVISIBLE PLUS', 'invisible', 'IP'],
  0x2066: ['LEFT-TO-RIGHT ISOLATE', 'bidi', 'LRI'], 0x2067: ['RIGHT-TO-LEFT ISOLATE', 'bidi', 'RLI'], 0x2068: ['FIRST STRONG ISOLATE', 'bidi', 'FSI'], 0x2069: ['POP DIRECTIONAL ISOLATE', 'bidi', 'PDI'],
  0x3000: ['IDEOGRAPHIC SPACE', 'space', 'IDSP'], 0x3164: ['HANGUL FILLER', 'invisible', 'HF'], 0xfeff: ['ZERO WIDTH NO-BREAK SPACE / BOM', 'invisible', 'BOM'], 0xffa0: ['HALFWIDTH HANGUL FILLER', 'invisible', 'HHF'],
  0x2018: ['LEFT SINGLE QUOTATION MARK', 'quote', '‘'], 0x2019: ['RIGHT SINGLE QUOTATION MARK', 'quote', '’'], 0x201a: ['SINGLE LOW-9 QUOTATION MARK', 'quote', '‚'], 0x201b: ['SINGLE HIGH-REVERSED-9 QUOTATION MARK', 'quote', '‛'],
  0x201c: ['LEFT DOUBLE QUOTATION MARK', 'quote', '“'], 0x201d: ['RIGHT DOUBLE QUOTATION MARK', 'quote', '”'], 0x201e: ['DOUBLE LOW-9 QUOTATION MARK', 'quote', '„'], 0x201f: ['DOUBLE HIGH-REVERSED-9 QUOTATION MARK', 'quote', '‟'],
  0x2032: ['PRIME', 'quote', '′'], 0x2033: ['DOUBLE PRIME', 'quote', '″'],
  0x2010: ['HYPHEN', 'dash', '‐'], 0x2011: ['NON-BREAKING HYPHEN', 'dash', '‑'], 0x2012: ['FIGURE DASH', 'dash', '‒'], 0x2013: ['EN DASH', 'dash', '–'], 0x2014: ['EM DASH', 'dash', '—'], 0x2015: ['HORIZONTAL BAR', 'dash', '―'], 0x2212: ['MINUS SIGN', 'dash', '−'],
  0x2026: ['HORIZONTAL ELLIPSIS', 'other', '…'], 0x2022: ['BULLET', 'other', '•'],
}

export function charInfo(cp: number): CharInfo | null {
  const n = N[cp]
  if (n) return { name: n[0], cat: n[1], short: n[2] }
  if (cp >= 0xe0000 && cp <= 0xe007f) return { name: `TAG ${cp === 0xe007f ? 'CANCEL' : cp >= 0xe0020 ? `“${String.fromCharCode(cp - 0xe0000)}”` : ''}`.trim(), cat: 'tag', short: cp >= 0xe0020 && cp < 0xe007f ? `T:${String.fromCharCode(cp - 0xe0000)}` : 'TAG' }
  if ((cp < 0x20 && cp !== 9 && cp !== 10 && cp !== 13) || (cp >= 0x7f && cp <= 0x9f)) return { name: `CONTROL U+${cp.toString(16).toUpperCase().padStart(4, '0')}`, cat: 'control', short: cp === 0x7f ? 'DEL' : `^${cp < 0x20 ? String.fromCharCode(cp + 64) : cp.toString(16)}` }
  return null
}

export const hex = (cp: number) => `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`

export interface Found { cp: number; info: CharInfo; count: number }

/** Counts every special character (invisible, bidi, tag, exotic space, control, typographic). */
export function scan(text: string): Found[] {
  const m = new Map<number, number>()
  for (const ch of text) {
    const cp = ch.codePointAt(0)!
    if (charInfo(cp)) m.set(cp, (m.get(cp) ?? 0) + 1)
  }
  return [...m.entries()].map(([cp, count]) => ({ cp, count, info: charInfo(cp)! })).sort((a, b) => b.count - a.count)
}

/** Decodes the common named and numeric HTML entities. */
export function decodeEntities(s: string): string {
  const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0', mdash: '—', ndash: '–', hellip: '…', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', copy: '©', reg: '®', trade: '™', deg: '°', middot: '·', bull: '•', shy: '\u00ad', zwsp: '\u200b' }
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, e: string) => {
    if (e[0] === '#') {
      const cp = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return Number.isFinite(cp) && cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : all
    }
    return named[e.toLowerCase()] ?? all
  })
}

export interface StepCount { id: keyof Opts | 'norm'; label: string; n: number }

/** Runs the pipeline; returns the cleaned text and per-step change counts. */
export function clean(input: string, o: Opts): { text: string; steps: StepCount[] } {
  let t = input
  const steps: StepCount[] = []
  const rep = (id: keyof Opts, label: string, re: RegExp, by: string | ((m: string, ...a: string[]) => string)) => {
    let n = 0
    t = t.replace(re, (...args: unknown[]) => {
      n++
      return typeof by === 'string' ? by : by(...(args as [string, ...string[]]))
    })
    steps.push({ id, label, n })
  }
  if (o.eol) rep('eol', 'Line endings → LF', /\r\n?|[\u2028\u2029]/g, '\n')
  if (o.html) {
    rep('html', 'HTML tags removed', /<(script|style)[^>]*>[\s\S]*?<\/\1>|<br\s*\/?>|<\/(p|div|li|h\d)>|<[^>]+>/gi, (m: string) => (/^<(br|\/p|\/div|\/li|\/h)/i.test(m) ? '\n' : ''))
    const before = t
    t = decodeEntities(t)
    steps.push({ id: 'html', label: 'HTML entities decoded', n: before === t ? 0 : (before.match(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi) ?? []).length })
  }
  if (o.norm !== 'none') {
    const before = t
    t = t.normalize(o.norm)
    let n = 0
    if (before !== t) {
      const a = [...before], b = [...t]
      n = Math.max(1, Math.abs(a.length - b.length) || a.filter((c, i) => c !== b[i]).length)
    }
    steps.push({ id: 'norm', label: `Unicode ${o.norm}`, n })
  }
  if (o.invisible) {
    const zw = '\u200b\u200c\u2060\u2061-\u2064\ufeff\u00ad͏\u180eᅟᅠㅤﾠ\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069'
    rep('invisible', 'Invisible & bidi characters', new RegExp(`[${zw}]|\\u{E0000}|[\\u{E0001}-\\u{E007F}]`, 'gu'), '')
    // ZWJ: keep between emoji (family / profession sequences) if asked
    rep('invisible', 'Zero width joiners', o.keepEmojiZwj ? /(?<!\p{Extended_Pictographic}️?)\u200d|\u200d(?!\p{Extended_Pictographic})/gu : /\u200d/g, '')
  }
  // oxlint-disable-next-line no-control-regex -- removing control characters is the point
  if (o.control) rep('control', 'Control characters', /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g, '')
  if (o.spaces) rep('spaces', 'Exotic spaces → space', /[\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000]/g, ' ')
  if (o.quotes) {
    rep('quotes', 'Smart single quotes', /[‘’‚‛′]/g, "'")
    rep('quotes', 'Smart double quotes', /[“”„‟″]/g, '"')
  }
  if (o.dashes) {
    rep('dashes', 'Em dashes → " - "', /\s*[—―]\s*/g, ' - ')
    rep('dashes', 'En dashes & hyphens → -', /[‐-–−]/g, '-')
  }
  if (o.ellipsis) rep('ellipsis', 'Ellipsis → ...', /…/g, '...')
  if (o.bullets) rep('bullets', 'Bullets → "- "', /^[ \t]*[•●◦‣⁃▪·][ \t]*/gm, '- ')
  if (o.tabs) rep('tabs', 'Tabs → 4 spaces', /\t/g, '    ')
  if (o.unwrap) {
    rep('unwrap', 'Line-break hyphenation joined', /(\p{L})-\n(\p{Ll})/gu, (_m: string, a: string, b: string) => a + b)
    rep('unwrap', 'Hard-wrapped lines joined', /([^\n])\n(?!\n|[ \t]*([-*•]|\d+[.)])\s)(?=[^\n])/g, (_m: string, a: string) => `${a} `)
  }
  if (o.trailing) rep('trailing', 'Trailing whitespace', /[ \t]+$/gm, '')
  if (o.collapse) rep('collapse', 'Repeated spaces collapsed', /(?<=\S) {2,}(?=\S)/g, ' ')
  if (o.blank) rep('blank', 'Extra blank lines', /\n[ \t]*\n(?:[ \t]*\n)+/g, '\n\n')
  if (o.trim) {
    const b = t
    t = t.trim()
    steps.push({ id: 'trim', label: 'Leading/trailing blank space', n: b === t ? 0 : 1 })
  }
  // merge duplicate labels by id+label
  return { text: t, steps }
}

export interface Tok { s: string; cp?: number; info?: CharInfo; ws?: 'tab' | 'trail' }

/** Splits text for the "reveal" view: special characters become their own tokens. */
export function reveal(text: string): Tok[] {
  const out: Tok[] = []
  let buf = ''
  const flush = () => { if (buf) { out.push({ s: buf }); buf = '' } }
  const lines = text.split('\n')
  lines.forEach((line, li) => {
    const trail = /[ \t]+$/.exec(line)
    const body = trail ? line.slice(0, trail.index) : line
    for (const ch of body) {
      const cp = ch.codePointAt(0)!
      const info = cp === 9 ? null : charInfo(cp)
      if (info && info.cat !== 'quote' && info.cat !== 'dash' && info.cat !== 'other') { flush(); out.push({ s: ch, cp, info }) }
      else if (cp === 9) { flush(); out.push({ s: ch, ws: 'tab' }) }
      else buf += ch
    }
    flush()
    if (trail) out.push({ s: trail[0], ws: 'trail' })
    if (li < lines.length - 1) buf += '\n'
  })
  flush()
  return out
}
