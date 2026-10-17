// Text chunking for speech synthesis: sentence segments (with offsets), word lookup, markup stripping, timing.

export interface Seg { start: number; end: number; text: string }

const ABBR = /(?:\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|etc|e\.g|i\.e|No|Fig|approx|Inc|Ltd|Co)\.|\b[A-Za-z]\.)$/

/** Splits text into sentence segments, keeping exact character offsets. Long sentences are split at commas/spaces. */
export function segments(text: string, max = 240): Seg[] {
  const out: Seg[] = []
  const re = /[^.!?…\n]*(?:[.!?…]+["'”’)\]]*|\n+|$)/g
  let m: RegExpExecArray | null
  let pending = -1
  while ((m = re.exec(text)) && m[0].length) {
    const s = pending >= 0 ? pending : m.index
    const e = m.index + m[0].length
    if (ABBR.test(m[0].trimEnd()) && e < text.length && text[e] !== '\n') { pending = s; continue }
    pending = -1
    push(s, e)
  }
  if (pending >= 0) push(pending, text.length)
  function push(s: number, e: number) {
    while (s < e && /\s/.test(text[s])) s++
    let end = e
    while (end > s && /\s/.test(text[end - 1])) end--
    if (end <= s) return
    while (end - s > max) {
      const slice = text.slice(s, s + max)
      let cut = Math.max(slice.lastIndexOf(', '), slice.lastIndexOf('; '), slice.lastIndexOf(': '))
      if (cut < max * 0.4) cut = slice.lastIndexOf(' ')
      if (cut <= 0) cut = max - 1
      out.push({ start: s, end: s + cut + 1, text: text.slice(s, s + cut + 1) })
      s += cut + 1
      while (s < end && /\s/.test(text[s])) s++
    }
    if (end > s) out.push({ start: s, end, text: text.slice(s, end) })
  }
  return out
}

/** Word boundaries around character index `i` (for highlighting on a boundary event). */
export function wordAt(text: string, i: number): [number, number] {
  if (i < 0 || i >= text.length) return [i, i]
  let a = i, b = i
  while (a > 0 && /[\p{L}\p{N}'’-]/u.test(text[a - 1])) a--
  while (b < text.length && /[\p{L}\p{N}'’-]/u.test(text[b])) b++
  return [a, b]
}

export function wordCount(text: string): number {
  return (text.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) ?? []).length
}

/** Rough speaking time in seconds: ~165 words per minute at rate 1. */
export const speakSeconds = (words: number, rate = 1) => (words / (165 * Math.max(0.1, rate))) * 60

/** Removes markdown/HTML so it reads naturally. */
export function cleanText(s: string, kind: 'md' | 'html' | 'txt'): string {
  let t = s.replace(/\r/g, '')
  if (kind === 'html') {
    t = t.replace(/<(script|style)[\s\S]*?<\/\1>/gi, '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|h\d|li|tr)>/gi, '\n').replace(/<[^>]+>/g, '')
    t = t.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  }
  if (kind === 'md') {
    t = t.replace(/```[\s\S]*?```/g, '').replace(/`([^`]+)`/g, '$1').replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/^#{1,6}\s+(.*)$/gm, '$1.').replace(/^\s*[-*+]\s+/gm, '').replace(/^\s*>\s?/gm, '').replace(/(\*\*|__)(.*?)\1/g, '$2').replace(/(\*|_)(.*?)\1/g, '$2')
  }
  return t.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
}
