// URL slug generation: transliteration, Unicode normalisation (NFKD, combining marks removed),
// symbol words, stop words, separator collapsing, word-boundary truncation and de-duplication.

export type Cyrillic = 'uk' | 'ru'

export interface SlugOptions {
  sep: '-' | '_' | '.'
  lower: boolean
  maxLen: number // 0 = unlimited
  stopWords: boolean
  ascii: boolean // false keeps non-Latin letters (Unicode slugs)
  cyrillic: Cyrillic
  germanUmlauts: boolean // ä → ae instead of a
  symbols: boolean // & → and, % → percent, …
  custom: string // "from=to" per line
}

export const DEFAULTS: SlugOptions = { sep: '-', lower: true, maxLen: 80, stopWords: false, ascii: true, cyrillic: 'uk', germanUmlauts: false, symbols: true, custom: '' }

const SPECIAL: Record<string, string> = { ß: 'ss', æ: 'ae', Æ: 'AE', œ: 'oe', Œ: 'OE', ø: 'o', Ø: 'O', ł: 'l', Ł: 'L', đ: 'd', Đ: 'D', ð: 'd', Ð: 'D', þ: 'th', Þ: 'TH', ı: 'i', ŀ: 'l', ſ: 's' }
const UMLAUT: Record<string, string> = { ä: 'ae', ö: 'oe', ü: 'ue', Ä: 'Ae', Ö: 'Oe', Ü: 'Ue' }

const CYR_COMMON: Record<string, string> = { а: 'a', б: 'b', в: 'v', д: 'd', е: 'e', ж: 'zh', з: 'z', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ь: '', ю: 'yu', я: 'ya', й: 'y' }
const CYR: Record<Cyrillic, Record<string, string>> = {
  uk: { ...CYR_COMMON, г: 'h', ґ: 'g', и: 'y', і: 'i', ї: 'yi', є: 'ye', "'": '', '’': '' }, // word-initial forms; see ukrainian()
  ru: { ...CYR_COMMON, г: 'g', и: 'i', ы: 'y', э: 'e', ё: 'yo', ъ: '', щ: 'shch' },
}
const GREEK: Record<string, string> = { α: 'a', β: 'v', γ: 'g', δ: 'd', ε: 'e', ζ: 'z', η: 'i', θ: 'th', ι: 'i', κ: 'k', λ: 'l', μ: 'm', ν: 'n', ξ: 'x', ο: 'o', π: 'p', ρ: 'r', σ: 's', ς: 's', τ: 't', υ: 'y', φ: 'f', χ: 'ch', ψ: 'ps', ω: 'o' }

export const SYMBOLS: Record<string, string> = { '&': 'and', '@': 'at', '%': 'percent', '+': 'plus', '=': 'equals', '#': 'number', '€': 'euro', $: 'dollar', '£': 'pound', '°': 'degrees', '©': 'c', '®': 'r', '™': 'tm', '½': 'half', '¼': 'quarter', '<': 'less-than', '>': 'greater-than' }

export const STOP = new Set('a an the and or but of in on at to for from by with as is are was were be been it its this that these those into over under about your our their my his her vs'.split(' '))

function mapChars(s: string, table: Record<string, string>): string {
  let o = ''
  for (const ch of s) {
    const low = ch.toLowerCase()
    const t = table[ch] ?? table[low]
    if (t === undefined) { o += ch; continue }
    o += ch !== low && t ? t[0].toUpperCase() + t.slice(1) : t
  }
  return o
}

export function parseCustom(s: string): [string, string][] {
  return s.split('\n').map((l) => l.split('=')).filter((p) => p.length >= 2 && p[0] !== '').map(([a, ...b]) => [a, b.join('=')] as [string, string])
}

// Ukrainian national romanisation (2010): є ї й ю я are written ie i i iu ia inside a word; зг → zgh.
const UK_INNER: Record<string, string> = { є: 'ie', ї: 'i', й: 'i', ю: 'iu', я: 'ia' }
function ukrainian(s: string): string {
  let o = ''
  const chars = [...s]
  chars.forEach((ch, i) => {
    const low = ch.toLowerCase()
    const prev = chars[i - 1] ?? ''
    const inner = /[\p{L}'’]/u.test(prev)
    let t = inner && UK_INNER[low] !== undefined ? UK_INNER[low] : CYR.uk[low]
    if (low === 'г' && prev.toLowerCase() === 'з') t = 'gh'
    if (t === undefined) { o += ch; return }
    o += ch !== low && t ? t[0].toUpperCase() + t.slice(1) : t
  })
  return o
}

/** Transliterates to Latin where possible (or keeps letters in Unicode mode) and removes accents. */
export function transliterate(s: string, o: SlugOptions): string {
  let t = s
  for (const [a, b] of parseCustom(o.custom)) t = t.split(a).join(` ${b} `)
  if (o.germanUmlauts) t = mapChars(t, UMLAUT)
  t = mapChars(t, SPECIAL)
  if (o.ascii) t = o.cyrillic === 'uk' ? ukrainian(t) : mapChars(t, CYR.ru) // before NFKD: й and ї decompose
  t = t.normalize('NFKD')
  if (o.ascii) t = mapChars(t, GREEK)
  // ASCII mode drops every accent; Unicode mode only un-accents Latin letters (keeps й, ї, Greek tonos…)
  return (o.ascii ? t.replace(/\p{M}+/gu, '') : t.replace(/([A-Za-z])\p{M}+/gu, '$1')).normalize('NFC')
}

/** Makes a URL slug from a title. */
export function slugify(input: string, opts: Partial<SlugOptions> = {}): string {
  const o = { ...DEFAULTS, ...opts }
  let t = transliterate(input, o)
  if (o.symbols) t = t.replace(/[&@%+=#€$£°©®™½¼<>]/g, (c) => ` ${SYMBOLS[c]} `)
  t = t.replace(/(\p{L})['’](\p{L})/gu, '$1$2') // don't → dont
  const word = o.ascii ? /[^A-Za-z0-9]+/g : /[^\p{L}\p{N}]+/gu
  let words = t.split(word).filter(Boolean)
  if (o.lower) words = words.map((w) => w.toLowerCase())
  if (o.stopWords && words.length > 1) {
    const kept = words.filter((w) => !STOP.has(w.toLowerCase()))
    if (kept.length) words = kept
  }
  let out = words.join(o.sep)
  if (o.maxLen > 0 && out.length > o.maxLen) {
    const cut = out.slice(0, o.maxLen + 1)
    const i = cut.lastIndexOf(o.sep)
    out = i > 0 ? cut.slice(0, i) : out.slice(0, o.maxLen)
  }
  return out
}

/** Appends -2, -3 … so every slug in the list (and every slug in `taken`) is unique. */
export function uniqueSlugs(slugs: string[], sep = '-', taken: string[] = []): string[] {
  const used = new Set(taken)
  return slugs.map((s) => {
    if (!s) return s
    let c = s, n = 2
    while (used.has(c)) c = `${s}${sep}${n++}`
    used.add(c)
    return c
  })
}

export interface Lint { tone: 'ok' | 'warn' | 'err'; text: string }

export function lint(slug: string, title: string): Lint[] {
  const out: Lint[] = []
  if (!slug) return [{ tone: 'err', text: 'Slug is empty: the title has no usable letters or digits.' }]
  if (slug.length > 75) out.push({ tone: 'warn', text: `Long slug (${slug.length} chars). Short, descriptive slugs (≈3–6 words) read better in links.` })
  if (/[A-Z]/.test(slug)) out.push({ tone: 'warn', text: 'Contains capitals: many servers treat URLs as case-sensitive.' })
  if (/[^\x20-\x7e]/.test(slug)) out.push({ tone: 'warn', text: 'Contains non-ASCII letters: they will be percent-encoded in some places.' })
  if (/^\d+$/.test(slug)) out.push({ tone: 'warn', text: 'Only digits: add words so the link is meaningful.' })
  if (title.trim() && slug.split(/[-_.]/).length > 10) out.push({ tone: 'warn', text: 'More than 10 words: consider removing stop words.' })
  if (!out.length) out.push({ tone: 'ok', text: 'Clean, readable slug.' })
  return out
}
