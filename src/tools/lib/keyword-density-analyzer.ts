// Keyword density: tokenising, stop-word filtering and n-gram counting.
import { STOP } from './word-counter-pro'

export { STOP }

/** Sentences → lower-case word tokens (apostrophes and inner hyphens kept). */
export function sentencesOfWords(text: string): string[][] {
  return text
    .split(/[.!?;:\n\r]+|\s[–—-]\s/)
    .map((s) => (s.toLowerCase().match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) ?? []).map((w) => w.replace(/’/g, "'")))
    .filter((s) => s.length)
}

export interface Gram { phrase: string; n: number; count: number; density: number; first: number }

export interface Opts { stop: boolean; minLen: number; numbers: boolean; extraStop: string[] }

const isNum = (w: string) => /^\d+([.,]\d+)?$/.test(w)

/**
 * Counts n-grams of size n inside sentences. With stop-word filtering on, single words that are
 * stop words are dropped and phrases may not start or end with one ("cup of tea" is kept).
 * Density = count × n / total words (the usual SEO convention).
 */
export function ngrams(text: string, n: number, o: Opts): { grams: Gram[]; total: number } {
  const sents = sentencesOfWords(text)
  const total = sents.reduce((a, s) => a + s.length, 0)
  const extra = new Set(o.extraStop.map((w) => w.toLowerCase().trim()).filter(Boolean))
  const stop = (w: string) => (o.stop && STOP.has(w)) || extra.has(w)
  const bad = (w: string) => w.length < o.minLen || (!o.numbers && isNum(w))
  const m = new Map<string, Gram>()
  let pos = 0
  for (const s of sents) {
    for (let i = 0; i + n <= s.length; i++) {
      const g = s.slice(i, i + n)
      if (stop(g[0]) || stop(g[n - 1]) || g.some(bad)) continue
      if (n > 1 && new Set(g).size === 1) continue
      const key = g.join(' ')
      const cur = m.get(key)
      if (cur) cur.count++
      else m.set(key, { phrase: key, n, count: 1, density: 0, first: pos + i })
    }
    pos += s.length
  }
  const grams = [...m.values()].map((g) => ({ ...g, density: total ? (g.count * n) / total : 0 }))
  grams.sort((a, b) => b.count - a.count || a.first - b.first)
  return { grams, total }
}

/** Occurrences of a phrase (whole words, case-insensitive) and its density. */
export function focus(text: string, phrase: string) {
  const words = sentencesOfWords(phrase).flat()
  const n = words.length
  const sents = sentencesOfWords(text)
  const total = sents.reduce((a, s) => a + s.length, 0)
  if (!n) return { count: 0, density: 0, firstAt: -1, total }
  let count = 0, firstAt = -1, pos = 0
  for (const s of sents) {
    for (let i = 0; i + n <= s.length; i++)
      if (words.every((w, j) => s[i + j] === w)) {
        if (firstAt < 0) firstAt = pos + i
        count++
      }
    pos += s.length
  }
  return { count, density: total ? (count * n) / total : 0, firstAt, total }
}

export type Level = 'low' | 'ok' | 'high'
export const level = (d: number): Level => (d < 0.005 ? 'low' : d <= 0.025 ? 'ok' : 'high')
