// Feed preview rules: weighted character counting, "see more" truncation and focal-point image cropping.

const URL_RE = /https?:\/\/[^\s]+/g

/** Grapheme-aware length; URLs can count as a fixed weight (e.g. 23 on microblogs). */
export function countChars(text: string, urlWeight?: number): number {
  const seg = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter() : null
  const len = (s: string) => (seg ? [...seg.segment(s)].length : [...s].length)
  if (urlWeight === undefined) return len(text)
  const urls = text.match(URL_RE) ?? []
  return len(text.replace(URL_RE, '')) + urls.length * urlWeight
}

/**
 * Feed truncation: cut at `maxChars` characters or `maxLines` lines (whichever comes first),
 * backing off to the previous word boundary. Returns the visible part and whether it was cut.
 */
export function truncate(text: string, maxChars: number, maxLines = Infinity): { shown: string; cut: boolean } {
  const lines = text.split('\n')
  let shown = text
  let cut = false
  if (lines.length > maxLines) {
    shown = lines.slice(0, maxLines).join('\n')
    cut = true
  }
  const chars = [...shown]
  if (chars.length > maxChars) {
    let s = chars.slice(0, maxChars).join('')
    const sp = s.search(/\s\S*$/)
    if (sp > maxChars * 0.6) s = s.slice(0, sp)
    shown = s
    cut = true
  }
  return { shown: cut ? shown.replace(/[\s.,;:!?-]+$/, '') : shown, cut }
}

/** Largest crop of aspect `ratio` (w/h) centred on the focus point (0..1), kept inside the image. */
export function cropRect(w: number, h: number, ratio: number, fx = 0.5, fy = 0.5): { x: number; y: number; w: number; h: number } {
  let cw = w, ch = w / ratio
  if (ch > h) {
    ch = h
    cw = h * ratio
  }
  const x = Math.min(Math.max(fx * w - cw / 2, 0), w - cw)
  const y = Math.min(Math.max(fy * h - ch / 2, 0), h - ch)
  return { x, y, w: cw, h: ch }
}

/** Split text into plain / hashtag / mention / url tokens for highlighting. */
export function tokens(text: string): { t: string; kind: 'text' | 'tag' | 'mention' | 'url' }[] {
  const out: { t: string; kind: 'text' | 'tag' | 'mention' | 'url' }[] = []
  const re = /(https?:\/\/[^\s]+)|(#[\p{L}\p{N}_]+)|(@[\w.]+)/gu
  let last = 0
  for (const m of text.matchAll(re)) {
    if (m.index! > last) out.push({ t: text.slice(last, m.index), kind: 'text' })
    out.push({ t: m[0], kind: m[1] ? 'url' : m[2] ? 'tag' : 'mention' })
    last = m.index! + m[0].length
  }
  if (last < text.length) out.push({ t: text.slice(last), kind: 'text' })
  return out
}
