// Vocabulary builder: cloze sentences, multiple-choice question generation, due ordering and mastery levels (SM-2 schedule).
import { addDays, sm2, type Sched } from './spaced-repetition-cards'

export interface Word {
  id: string
  word: string
  pos: string // part of speech
  def: string
  example: string
  note: string
  s: Sched
  seen: number
  right: number
}

export type QType = 'def→word' | 'word→def' | 'cloze'
export interface Question { type: QType; prompt: string; options: string[]; answer: number; wordId: string }

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Regex matching the word and simple inflections (walk → walked / walking / walks, happy → happier). */
export function wordPattern(w: string): RegExp {
  const base = w.trim().toLowerCase()
  if (base.includes(' ')) return new RegExp(esc(base), 'i')
  const stem = base.length > 4 ? base.replace(/(e|y)$/, '') : base
  return new RegExp(`\\b${esc(stem)}[a-z]{0,4}\\b`, 'i')
}

/** Replaces the word (or its inflected form) in the sentence with a blank; null when it is not found. */
export function cloze(sentence: string, w: string): string | null {
  const re = wordPattern(w)
  return re.test(sentence) ? sentence.replace(re, '_____') : null
}

/** Small deterministic PRNG so quizzes are reproducible in tests. */
export function rng(seed: number) {
  let s = seed >>> 0 || 1
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
}

export function shuffle<T>(a: T[], r: () => number): T[] {
  const b = [...a]
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1))
    ;[b[i], b[j]] = [b[j], b[i]]
  }
  return b
}

/** Builds a 4-option question for `target`, preferring distractors with the same part of speech. */
export function makeQuestion(words: Word[], target: Word, type: QType, r: () => number): Question | null {
  const others = words.filter((w) => w.id !== target.id && w.word.toLowerCase() !== target.word.toLowerCase())
  if (others.length < 3) return null
  const same = shuffle(others.filter((w) => w.pos === target.pos), r)
  const rest = shuffle(others.filter((w) => w.pos !== target.pos), r)
  const distract = [...same, ...rest].slice(0, 3)
  let prompt: string
  let field: (w: Word) => string
  if (type === 'cloze') {
    const c = target.example ? cloze(target.example, target.word) : null
    if (!c) return makeQuestion(words, target, 'def→word', r)
    prompt = c
    field = (w) => w.word
  } else if (type === 'def→word') {
    prompt = target.def
    field = (w) => w.word
  } else {
    prompt = target.word
    field = (w) => w.def
  }
  const opts = shuffle([target, ...distract], r)
  return { type, prompt, options: opts.map(field), answer: opts.indexOf(target), wordId: target.id }
}

export const NEW: Sched = { ef: 2.5, reps: 0, interval: 0, due: '', lapses: 0 }

export type Level = 'new' | 'learning' | 'familiar' | 'mastered'
export function level(w: Word): Level {
  if (!w.seen) return 'new'
  if (w.s.interval >= 21) return 'mastered'
  if (w.s.interval >= 6) return 'familiar'
  return 'learning'
}

/** Due words first (oldest due date), then new words; `limit` caps the session. */
export function dueQueue(words: Word[], today: string, limit = 20): Word[] {
  const due = words.filter((w) => w.seen && w.s.due && w.s.due <= today).sort((a, b) => a.s.due.localeCompare(b.s.due))
  const fresh = words.filter((w) => !w.seen)
  return [...due, ...fresh].slice(0, limit)
}

/** Applies an answer: correct & fast → q 5, correct → 4, wrong → 1. */
export function grade(w: Word, correct: boolean, today: string, fast = false): Word {
  const q = correct ? (fast ? 5 : 4) : 1
  return { ...w, s: sm2(w.s, q, today), seen: w.seen + 1, right: w.right + (correct ? 1 : 0) }
}

export { addDays }
