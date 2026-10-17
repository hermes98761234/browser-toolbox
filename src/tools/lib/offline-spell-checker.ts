// Offline English spell checker: dictionary decoding, tokenisation that skips URLs / e-mails /
// code / numbers, case + possessive + simple affix handling, and suggestions ranked by a weighted
// Damerau-Levenshtein distance with QWERTY keyboard adjacency.
//
// Word list (offline-spell-checker-words.txt): SCOWL / English Speller Database, size 50, US.
//   Copyright 2000-2026 by Kevin Atkinson
//   Permission to use, copy, modify, distribute, and sell any part of the English Speller
//   Database (ESDB, previously known as SCOWLv2), or word lists created from it, is hereby granted
//   without fee, provided that the above copyright notice appears in all copies and that both the
//   above copyright notice and this notice appear in supporting documentation.  Kevin Atkinson
//   makes no representations about the suitability of this database for any purpose.  It is
//   provided "as is" without express or implied warranty.
//   ESDB is derived from many sources, most of which are in the Public Domain (12dicts and
//   ENABLE2K, with special credit to Alan Beale). https://wordlist.aspell.net

export const SYM = '!#$%&()*+,-./0123456789:;<=>?@'

export interface Dict {
  /** Lower-case words that may appear in any case (e.g. "house"). */
  lower: Set<string>
  /** Words with required capitals, keyed by lower case (e.g. "paris" → "Paris"). */
  proper: Map<string, string[]>
  size: number
}

/** Decodes the front-coded list (header, '---' line, then prefix-length char + suffix per word). */
export function decode(raw: string): Dict {
  const at = raw.indexOf('\n---\n')
  const data = at >= 0 ? raw.slice(at + 5) : raw
  const lower = new Set<string>()
  const proper = new Map<string, string[]>()
  let prev = ''
  let size = 0
  let i = 0
  const n = data.length
  while (i < n) {
    const k = SYM.indexOf(data[i])
    if (k < 0) { i++; continue } // newline or stray char
    let j = i + 1
    while (j < n && SYM.indexOf(data[j]) < 0 && data[j] !== '\n') j++
    const w = prev.slice(0, k) + data.slice(i + 1, j)
    prev = w
    i = j
    size++
    const lw = w.toLowerCase()
    if (w === lw) lower.add(w)
    else proper.set(lw, [...(proper.get(lw) ?? []), w])
  }
  return { lower, proper, size }
}

/** Builds a Dict from plain words (tests, user dictionary). */
export function fromWords(words: string[]): Dict {
  const raw = [...words].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())).map((w) => SYM[0] + w).join('')
  return decode(raw)
}

export interface Token { word: string; start: number; end: number }

const SKIP = [
  /```[\s\S]*?```/g, // fenced code
  /`[^`\n]+`/g, // inline code
  /\b(?:https?:\/\/|ftp:\/\/|www\.)[^\s<>"')\]]+/gi, // URLs
  /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, // e-mail
  /(?:^|\s)(?:[./~]|[A-Za-z]:\\)[\w./\\-]+/g, // paths
  /<\/?[a-zA-Z][^>]*>/g, // HTML tags
  /#[0-9a-fA-F]{3,8}\b/g, // colours
]

/** Words worth checking, with their offsets. Numbers, code-like identifiers, URLs etc. are skipped. */
export function tokenize(text: string): Token[] {
  const mask = new Uint8Array(text.length)
  for (const re of SKIP) for (const m of text.matchAll(re)) mask.fill(1, m.index!, m.index! + m[0].length)
  const out: Token[] = []
  for (const m of text.matchAll(/[\p{L}\p{M}\p{N}_]+(?:['’][\p{L}\p{M}]+)*['’]?/gu)) {
    const s = m.index!
    if (mask[s]) continue
    let w = m[0]
    if (/[\d_]/.test(w)) continue // numbers, 3rd, snake_case, v2
    if (/\p{Ll}\p{Lu}/u.test(w.replace(/^\p{Lu}+(?=\p{Lu}\p{Ll})/u, ''))) continue // camelCase / PascalCase
    if (text[s - 1] === '.' && /\w/.test(text[s - 2] ?? '')) continue // file.ext, obj.prop
    if (text[s + w.length] === '(' || text[s - 1] === '$' || text[s - 1] === '@') continue // fn(), $var, @user
    let end = s + w.length
    if (/['’]$/.test(w) && !/s['’]$/i.test(w)) { w = w.slice(0, -1); end-- }
    if (w.length < 2 && !/^[aAI]$/.test(w)) continue
    out.push({ word: w, start: s, end })
  }
  return out
}

const stripMarks = (w: string) => w.normalize('NFD').replace(/\p{M}/gu, '')
const isUpper = (w: string) => w === w.toUpperCase() && w !== w.toLowerCase()
const isCap = (w: string) => w[0] === w[0].toUpperCase() && w.slice(1) === w.slice(1).toLowerCase()

/** Exact lookup with case rules: "house" matches house/House/HOUSE; "Paris" matches Paris/PARIS. */
function lookup(w: string, d: Dict, user: Set<string>): boolean {
  const lw = w.toLowerCase()
  if (user.has(w) || user.has(lw)) return true
  if (d.lower.has(lw) && (w === lw || isCap(w) || isUpper(w))) return true
  const p = d.proper.get(lw)
  return !!p && (p.includes(w) || isUpper(w))
}

// Derivational suffixes only: SCOWL already lists inflections (-s, -ed, -ing…), so stripping those
// would wrongly accept misspellings such as "occured".
const SUFFIXES: [string, string][] = [
  ['iness', 'y'], ['ily', 'y'], ['iless', 'y'], ['iful', 'y'],
  ['ness', ''], ['nesses', ''], ['less', ''], ['lessly', ''], ['ful', ''], ['fully', ''], ['ment', ''], ['ments', ''], ['ly', ''], ['able', ''], ['able', 'e'], ['ably', ''], ['ism', ''], ['isms', ''], ['ist', ''], ['ists', ''], ['ize', ''], ['izes', ''], ['ization', 'ize'], ['ish', ''], ['like', ''],
]
const PREFIXES = ['un', 're', 'non', 'pre', 'post', 'over', 'under', 'mis', 'out', 'anti', 'co', 'sub', 'super', 'inter', 'multi', 'micro', 'semi', 'auto', 'de', 'dis']

/** Is the word spelled correctly? Handles case, curly apostrophes, possessives, hyphens and simple affixes. */
export function isCorrect(word: string, d: Dict, user: Set<string> = new Set(), depth = 0): boolean {
  let w = stripMarks(word.replace(/’/g, "'"))
  if (!w) return true
  if (lookup(w, d, user)) return true
  if (/'s$/i.test(w)) return isCorrect(w.slice(0, -2), d, user, depth)
  if (/s'$/i.test(w)) return isCorrect(w.slice(0, -1), d, user, depth)
  if (w.includes('-')) return w.split('-').every((p) => !p || isCorrect(p, d, user, depth))
  if (depth > 1) return false
  w = w.toLowerCase()
  for (const [suf, add] of SUFFIXES) {
    if (w.length - suf.length < 3 || !w.endsWith(suf)) continue
    const stem = w.slice(0, -suf.length) + add
    if (!add && /[^aeiou]y$/.test(stem) && suf !== 'ish' && suf !== 'like') continue // happyness → happiness
    if (lookup(stem, d, user)) return true
  }
  for (const pre of PREFIXES) if (w.startsWith(pre) && w.length - pre.length >= 5 && isCorrect(w.slice(pre.length), d, user, depth + 1)) return true
  return false
}

// ---------- suggestions ----------

const ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm']
const POS = new Map<string, [number, number]>()
ROWS.forEach((r, y) => [...r].forEach((c, x) => POS.set(c, [x + y * 0.5, y])))
/** True when two letters are neighbours on a QWERTY keyboard. */
export function adjacent(a: string, b: string): boolean {
  const p = POS.get(a), q = POS.get(b)
  return !!p && !!q && a !== b && Math.abs(p[1] - q[1]) <= 1 && Math.abs(p[0] - q[0]) <= 1
}

/** Weighted Damerau-Levenshtein (optimal string alignment) distance. */
export function distance(a: string, b: string): number {
  a = a.toLowerCase()
  b = b.toLowerCase()
  const m = a.length, n = b.length
  const d: number[][] = Array.from({ length: m + 1 }, (_, i) => Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)))
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const sub = a[i - 1] === b[j - 1] ? 0 : adjacent(a[i - 1], b[j - 1]) ? 0.6 : 'aeiou'.includes(a[i - 1]) && 'aeiou'.includes(b[j - 1]) ? 0.8 : 1
      const del = i > 1 && a[i - 1] === a[i - 2] ? 0.5 : 1 // drop a doubled letter
      const ins = b[j - 1] === 'c' && b[j] === 'k' ? 0.45 : j > 1 && b[j - 1] === b[j - 2] ? 0.5 : j > 1 && b[j - 1] === 'h' && 'cstwgp'.includes(b[j - 2]) ? 0.6 : 1 // double a letter / missed h in ch, th, wh…
      let v = Math.min(d[i - 1][j] + del, d[i][j - 1] + ins, d[i - 1][j - 1] + sub)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, d[i - 2][j - 2] + 0.5)
      d[i][j] = v
    }
  }
  return d[m][n]
}

const ALPHA = "abcdefghijklmnopqrstuvwxyz'"
function edits1(w: string): Set<string> {
  const out = new Set<string>()
  for (let i = 0; i <= w.length; i++) {
    const L = w.slice(0, i), R = w.slice(i)
    if (R) out.add(L + R.slice(1))
    if (R.length > 1) out.add(L + R[1] + R[0] + R.slice(2))
    for (const c of ALPHA) {
      if (R) out.add(L + c + R.slice(1))
      out.add(L + c + R)
    }
  }
  return out
}

// Very frequent words get a small ranking bonus (wich → which, not wick).
const COMMON = new Set(`the be to of and a in that have i it for not on with he as you do at this but his by from they we say her she or an will my one all would there their what so up out if about who get which go me when make can like time no just him know take people into year your good some could them see other than then now look only come its over think also back after use two how our work first well way even new want because any these give day most us is was are were been has had did said made went where why here thing very through still while should never always every each much many same those such own again before off right may might must too few more less between under both last long great little old big high small large next early young important public bad able sure real really whether quite though although however since until without within along across around against during receive believe definitely separate necessary business government tomorrow weird friend because beginning occurred`.split(' '))

const matchCase = (orig: string, s: string) => (isUpper(orig) && orig.length > 1 ? s.toUpperCase() : /^\p{Lu}/u.test(orig) ? s[0].toUpperCase() + s.slice(1) : s)

/** Up to `max` suggestions, best first. Searches one edit away, then two (for words ≤ 14 letters). */
export function suggest(word: string, d: Dict, user: Set<string> = new Set(), max = 6): string[] {
  const w = stripMarks(word.replace(/’/g, "'")).toLowerCase()
  const known = (c: string) => d.lower.has(c) || d.proper.has(c) || user.has(c)
  const found = new Set<string>()
  const e1 = edits1(w)
  for (const c of e1) if (known(c)) found.add(c)
  // two edits: always for short lists so close keyboard slips can outrank rare one-edit words
  if (found.size < max && w.length <= 14) for (const a of e1) for (const c of edits1(a)) if (known(c)) found.add(c)
  // split run-together words: "alot" → "a lot"
  for (let i = 1; i < w.length; i++) {
    const L = w.slice(0, i), R = w.slice(i)
    if ((L.length > 1 || L === 'a' || L === 'i') && R.length > 2 && known(L) && known(R)) found.add(`${L} ${R}`)
  }
  found.delete(w)
  const scored = [...found].map((c) => ({ c, s: distance(w, c.replace(' ', '')) + (c.includes(' ') ? 0.6 : 0) + (c[0] !== w[0] ? 0.3 : 0) + Math.abs(c.length - w.length) * 0.05 - (COMMON.has(c) ? 0.45 : 0) }))
  scored.sort((a, b) => a.s - b.s || a.c.length - b.c.length || a.c.localeCompare(b.c))
  return scored.slice(0, max).map(({ c }) => {
    const p = d.proper.get(c)
    return matchCase(word, p && !d.lower.has(c) ? p[0] : c)
  })
}

export interface Issue { word: string; count: number; first: number }

/** Misspelled tokens and unique issues (case-sensitive word, in order of first appearance). */
export function check(text: string, d: Dict, user: Set<string>, ignore: Set<string>) {
  const bad: Token[] = []
  const cache = new Map<string, boolean>()
  for (const t of tokenize(text)) {
    if (ignore.has(t.word)) continue
    let ok = cache.get(t.word)
    if (ok === undefined) cache.set(t.word, (ok = isCorrect(t.word, d, user)))
    if (!ok) bad.push(t)
  }
  const issues = new Map<string, Issue>()
  for (const t of bad) {
    const it = issues.get(t.word)
    if (it) it.count++
    else issues.set(t.word, { word: t.word, count: 1, first: t.start })
  }
  return { bad, issues: [...issues.values()], words: cache.size }
}
