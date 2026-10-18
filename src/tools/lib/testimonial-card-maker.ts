// Testimonial card layout: highlighted words, word wrapping, auto-fit font size, star shapes, initials.

export interface Word { text: string; hl: boolean; glue?: boolean }

/**
 * Splits a quote into words; text between *asterisks* is highlighted. Unbalanced asterisks are kept literally.
 * `glue` marks a word that follows the previous one without a space (e.g. "*fast*." → "fast" + glued ".").
 */
export function parseQuote(s: string): Word[] {
  const parts = s.split('*')
  if (parts.length % 2 === 0) return s.split(/\s+/).filter(Boolean).map((text) => ({ text, hl: false }))
  const out: Word[] = []
  parts.forEach((p, i) => {
    p.split(/(\s+)/).forEach((w, k) => {
      if (!w || /^\s+$/.test(w)) return
      const glue = k === 0 && out.length > 0 && i > 0 && !/\s$/.test(parts[i - 1] ?? '')
      out.push(glue ? { text: w, hl: i % 2 === 1, glue } : { text: w, hl: i % 2 === 1 })
    })
  })
  return out
}

/** Joins words as rendered (glued words get no leading space). */
export const joinWords = (ws: Word[]) => ws.map((w, i) => (i && !w.glue ? ' ' : '') + w.text).join('')

/** Greedy word wrap; `measure` returns the width of a string at the current font. Overlong words get their own line. */
export function wrapWords(words: Word[], maxW: number, measure: (s: string) => number): Word[][] {
  const lines: Word[][] = []
  let line: Word[] = []
  for (const w of words) {
    const test = joinWords([...line, w])
    if (line.length && !w.glue && measure(test) > maxW) {
      lines.push(line)
      line = [w]
    } else line.push(w)
  }
  if (line.length) lines.push(line)
  return lines
}

/**
 * Largest font size (step 1 px) whose wrapped text fits a box. `measureAt(fs)` returns a measure function for
 * that size. Binary search works because the wrapped height grows monotonically with the font size.
 */
export function fitText(words: Word[], boxW: number, boxH: number, lineH: number, minFs: number, maxFs: number, measureAt: (fs: number) => (s: string) => number): { fs: number; lines: Word[][] } {
  const fits = (fs: number) => {
    const m = measureAt(fs)
    const lines = wrapWords(words, boxW, m)
    const ok = lines.length * fs * lineH <= boxH && lines.every((l) => m(joinWords(l)) <= boxW)
    return { ok, lines }
  }
  let lo = Math.floor(minFs), hi = Math.ceil(maxFs)
  if (!fits(lo).ok) return { fs: lo, lines: fits(lo).lines }
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (fits(mid).ok) lo = mid
    else hi = mid - 1
  }
  return { fs: lo, lines: fits(lo).lines }
}

/** Five-pointed star polygon (10 points), first point straight up. */
export function starPoints(cx: number, cy: number, r: number, inner = 0.45): [number, number][] {
  return Array.from({ length: 10 }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    const rr = i % 2 ? r * inner : r
    return [cx + rr * Math.cos(a), cy + rr * Math.sin(a)]
  })
}

/** Fill fraction (0–1) of each of 5 stars for a rating, e.g. 3.5 → [1,1,1,0.5,0]. */
export const starFills = (rating: number) => Array.from({ length: 5 }, (_, i) => Math.max(0, Math.min(1, rating - i)))

export function initials(name: string): string {
  const w = name.trim().split(/\s+/).filter((x) => /\p{L}/u.test(x))
  if (!w.length) return '?'
  return ((w[0][0] ?? '') + (w.length > 1 ? w[w.length - 1][0] : '')).toUpperCase()
}

/** Stable pleasant colour for an avatar from the name. */
export function avatarHue(name: string): number {
  let h = 0
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360
  return h
}
