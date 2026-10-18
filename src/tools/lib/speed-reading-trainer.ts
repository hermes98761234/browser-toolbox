// RSVP helpers: tokenising, optimal recognition point, chunking and per-frame timing.

export interface Frame { text: string; words: number; delay: number; sentenceStart: boolean }

/**
 * Optimal recognition point (0-based letter index): slightly left of centre, as in common RSVP readers.
 * Leading punctuation (quotes, brackets) is skipped.
 */
export function orpIndex(word: string): number {
  const lead = word.match(/^[^\p{L}\p{N}]*/u)?.[0].length ?? 0
  const core = word.slice(lead).replace(/[^\p{L}\p{N}]+$/u, '')
  const n = core.length
  const k = n <= 1 ? 0 : n <= 5 ? 1 : n <= 9 ? 2 : n <= 13 ? 3 : 4
  return Math.min(word.length - 1, lead + k)
}

/** Pause multiplier for a word: longer after sentence ends and commas, a little longer for long words. */
export function pauseFactor(word: string): number {
  let f = 1
  if (/[.!?…]["'”’)\]]*$/.test(word)) f = 2.2
  else if (/[,;:—–]["'”’)\]]*$/.test(word)) f = 1.5
  const len = word.replace(/[^\p{L}\p{N}]/gu, '').length
  if (len > 8) f *= 1 + Math.min(0.5, (len - 8) * 0.06)
  return f
}

export const words = (text: string) => text.split(/\s+/).filter(Boolean)

/** Builds display frames of `chunk` words; delays in ms for the given WPM (smart pauses optional). */
export function frames(text: string, wpm: number, chunk = 1, smart = true): Frame[] {
  const ws = words(text)
  const base = 60000 / Math.max(1, wpm)
  const out: Frame[] = []
  let sentenceStart = true
  for (let i = 0; i < ws.length; ) {
    const part: string[] = []
    // never carry a chunk across a sentence end
    while (part.length < chunk && i < ws.length) {
      part.push(ws[i++])
      if (/[.!?…]["'”’)\]]*$/.test(part[part.length - 1])) break
    }
    const last = part[part.length - 1]
    const delay = base * part.length * (smart ? pauseFactor(last) : 1)
    out.push({ text: part.join(' '), words: part.length, delay, sentenceStart })
    sentenceStart = /[.!?…]["'”’)\]]*$/.test(last)
  }
  return out
}

/** Total reading time in ms for frames starting at `from`. */
export const remainingMs = (fs: Frame[], from = 0) => fs.slice(from).reduce((a, f) => a + f.delay, 0)

/** Index of the frame that starts the sentence before (or containing) `i`. */
export function prevSentence(fs: Frame[], i: number): number {
  let j = Math.max(0, i - 1)
  while (j > 0 && !fs[j].sentenceStart) j--
  return j
}

/** Effective reading rate: speed weighted by comprehension (0–1). */
export const effectiveWpm = (wpm: number, comprehension: number) => Math.round(wpm * comprehension)
