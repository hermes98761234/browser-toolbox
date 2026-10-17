// Turns recognised speech into text: spoken punctuation commands, spacing and auto-capitalisation.

/** Spoken phrase → inserted text. Longest phrases are matched first. */
export const PUNCT: [string, string][] = [
  ['new paragraph', '\n\n'], ['next paragraph', '\n\n'], ['new line', '\n'], ['next line', '\n'],
  ['full stop', '.'], ['period', '.'], ['dot', '.'], ['comma', ','], ['question mark', '?'], ['exclamation mark', '!'], ['exclamation point', '!'],
  ['semicolon', ';'], ['colon', ':'], ['open quote', '“'], ['close quote', '”'], ['end quote', '”'], ['open bracket', '('], ['close bracket', ')'],
  ['open paren', '('], ['close paren', ')'], ['dash', ' – '], ['hyphen', '-'], ['ellipsis', '…'], ['ampersand', '&'], ['percent sign', '%'],
]
export const CONTROL: Record<string, 'scratch' | 'stop'> = {
  'scratch that': 'scratch', 'undo that': 'scratch', 'delete that': 'scratch', 'stop listening': 'stop', 'stop dictation': 'stop',
}

/** Whole-utterance control command ("scratch that", "stop listening"), or null. */
export function controlCommand(phrase: string) {
  return CONTROL[phrase.trim().toLowerCase().replace(/[.!?,]+$/, '')] ?? null
}

type Tok = { t: 'w'; v: string } | { t: 'p'; v: string }
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const RE = new RegExp(`\\b(${[...PUNCT].sort((a, b) => b[0].length - a[0].length).map(([k]) => esc(k)).join('|')})\\b`, 'gi')

export function tokenize(phrase: string, commands = true): Tok[] {
  const out: Tok[] = []
  const src = phrase.trim()
  if (!commands) return src ? [{ t: 'w', v: src }] : []
  let last = 0
  for (const m of src.matchAll(RE)) {
    const before = src.slice(last, m.index).trim()
    if (before) out.push({ t: 'w', v: before })
    out.push({ t: 'p', v: PUNCT.find(([k]) => k === m[1].toLowerCase())![1] })
    last = m.index! + m[0].length
  }
  const rest = src.slice(last).trim()
  if (rest) out.push({ t: 'w', v: rest })
  return out
}

const sentenceEnd = (before: string) => /(^|[.!?…]\s*|\n\s*)$/.test(before) || before.trim() === ''
const noSpaceAfter = (ch: string) => /[\s(“"'\-–]$/.test(ch) || ch === ''

/**
 * Inserts a recognised phrase at `cursor` and returns the new text and cursor.
 * Handles spacing, capitalisation after sentence ends, and punctuation commands.
 */
export function insertPhrase(text: string, cursor: number, phrase: string, opts: { commands?: boolean; capitalize?: boolean } = {}) {
  const { commands = true, capitalize = true } = opts
  let before = text.slice(0, cursor)
  const after = text.slice(cursor)
  for (const tok of tokenize(phrase, commands)) {
    if (tok.t === 'p') {
      const p = tok.v
      if (p === '\n' || p === '\n\n') before = before.replace(/[ \t]+$/, '') + p
      else if (p === '“' || p === '(') before += (noSpaceAfter(before) ? '' : ' ') + p
      else if (p === ' – ') before = before.replace(/\s+$/, '') + p
      else before = before.replace(/[ \t]+$/, '') + p
    } else {
      let w = tok.v
      if (capitalize && sentenceEnd(before)) w = w[0].toUpperCase() + w.slice(1)
      w = w.replace(/\bi('(m|ve|ll|d))?\b/g, (_m, s: string | undefined) => 'I' + (s ?? ''))
      before += (noSpaceAfter(before) ? '' : ' ') + w
    }
  }
  const needSpace = after && /^[A-Za-z0-9“(]/.test(after) && !/\s$/.test(before)
  return { text: before + (needSpace ? ' ' : '') + after, cursor: before.length }
}

export const wordCount = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0)
