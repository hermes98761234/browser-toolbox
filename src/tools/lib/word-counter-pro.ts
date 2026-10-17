// Text statistics using Intl.Segmenter (with regex fallbacks).

const hasSeg = typeof Intl !== 'undefined' && 'Segmenter' in Intl

export function words(text: string, locale = 'en'): string[] {
  if (hasSeg) {
    const seg = new Intl.Segmenter(locale, { granularity: 'word' })
    const out: string[] = []
    for (const s of seg.segment(text)) if (s.isWordLike) out.push(s.segment)
    return out
  }
  return text.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) ?? []
}

export function graphemes(text: string): number {
  if (hasSeg) {
    let n = 0
    for (const _ of new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(text)) n++
    return n
  }
  return [...text].length
}

export function sentences(text: string, locale = 'en'): string[] {
  if (hasSeg) {
    const out: string[] = []
    for (const s of new Intl.Segmenter(locale, { granularity: 'sentence' }).segment(text)) if (/[\p{L}\p{N}]/u.test(s.segment)) out.push(s.segment.trim())
    return out
  }
  return text.split(/(?<=[.!?])\s+/).filter((s) => /[\p{L}\p{N}]/u.test(s))
}

/** Heuristic English syllable count (vowel groups, silent e, minimum 1). */
export function syllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '')
  if (!w) return 0
  if (w.length <= 3) return 1
  const trimmed = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '')
  const groups = trimmed.match(/[aeiouy]{1,2}/g)
  return Math.max(1, groups ? groups.length : 1)
}

export const STOP = new Set(
  'a an the and or but if then so of to in on at by for with from as is are was were be been being it its this that these those i you he she we they me him her us them my your his our their not no do does did have has had will would can could should may might must just than too very also about into over after before more most such only own same other some any each few all both what which who whom when where why how there here up down out off again further once s t don now'.split(' '),
)

export interface TextStats {
  words: number; chars: number; charsNoSpaces: number; sentences: number; paragraphs: number; lines: number
  unique: number; avgWordLen: number; avgSentenceLen: number; longest: string; syllables: number
  flesch: number; grade: number; keywords: { word: string; count: number; density: number }[]
}

export function analyze(text: string, locale = 'en'): TextStats {
  const ws = words(text, locale)
  const sn = sentences(text, locale)
  const lower = ws.map((w) => w.toLocaleLowerCase(locale))
  const syl = ws.reduce((a, w) => a + syllables(w), 0)
  const counts = new Map<string, number>()
  for (const w of lower) if (!STOP.has(w) && w.length > 2 && !/^\d+$/.test(w)) counts.set(w, (counts.get(w) ?? 0) + 1)
  const keywords = [...counts]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 12)
    .map(([word, count]) => ({ word, count, density: ws.length ? count / ws.length : 0 }))
  const W = ws.length, S = Math.max(1, sn.length)
  return {
    words: W,
    chars: graphemes(text),
    charsNoSpaces: graphemes(text.replace(/\s+/g, '')),
    sentences: sn.length,
    paragraphs: text.split(/\n\s*\n/).filter((p) => p.trim()).length,
    lines: text ? text.split('\n').length : 0,
    unique: new Set(lower).size,
    avgWordLen: W ? ws.reduce((a, w) => a + [...w].length, 0) / W : 0,
    avgSentenceLen: sn.length ? W / sn.length : 0,
    longest: ws.reduce((a, w) => ([...w].length > [...a].length ? w : a), ''),
    syllables: syl,
    flesch: W ? 206.835 - 1.015 * (W / S) - 84.6 * (syl / W) : NaN,
    grade: W ? 0.39 * (W / S) + 11.8 * (syl / W) - 15.59 : NaN,
    keywords,
  }
}

/** Minutes → "3 min 20 s". */
export function duration(min: number): string {
  if (!Number.isFinite(min) || min <= 0) return '0 s'
  const s = Math.round(min * 60)
  if (s < 60) return `${s} s`
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60
  return h ? `${h} h ${m} min` : r ? `${m} min ${r} s` : `${m} min`
}

export function fleschLabel(f: number): string {
  if (!Number.isFinite(f)) return '—'
  if (f >= 90) return 'Very easy'
  if (f >= 80) return 'Easy'
  if (f >= 70) return 'Fairly easy'
  if (f >= 60) return 'Plain English'
  if (f >= 50) return 'Fairly difficult'
  if (f >= 30) return 'Difficult'
  return 'Very difficult'
}
