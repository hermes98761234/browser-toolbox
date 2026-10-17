// Regex execution (self-contained so it can also run inside a Web Worker) and a token explainer.

export interface Group { name: string; value: string | undefined; start: number; end: number }
export interface Hit { index: number; end: number; text: string; groups: Group[] }
export interface RunResult { hits: Hit[]; error: string; replaced: string; truncated: boolean; ms: number }

/** Runs `pattern` over `text`. Must not reference anything outside its body (it is stringified for the worker). */
export function runRegex(pattern: string, flags: string, text: string, replacement: string | null, max: number): RunResult {
  const t0 = Date.now()
  let re: RegExp
  try {
    re = new RegExp(pattern, flags.includes('d') ? flags : flags + 'd')
  } catch (e) {
    return { hits: [], error: (e as Error).message, replaced: '', truncated: false, ms: 0 }
  }
  const names: string[] = []
  const nameRe = /\(\?<([A-Za-z_$][\w$]*)>/g
  let nm: RegExpExecArray | null
  // map group numbers to names by scanning capturing parens in order
  const caps: string[] = []
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i]
    if (c === '\\') { i++; continue }
    if (c === '[') { while (i < pattern.length && pattern[i] !== ']') { if (pattern[i] === '\\') i++; i++ } continue }
    if (c === '(') {
      if (pattern[i + 1] !== '?') caps.push('')
      else if (pattern[i + 2] === '<' && pattern[i + 3] !== '=' && pattern[i + 3] !== '!') {
        nameRe.lastIndex = i
        nm = nameRe.exec(pattern)
        caps.push(nm && nm.index === i ? nm[1] : '')
      }
    }
  }
  names.push(...caps)
  const hits: Hit[] = []
  const toHit = (m: RegExpExecArray): Hit => {
    const ind = (m as RegExpExecArray & { indices?: ([number, number] | undefined)[] }).indices
    const groups: Group[] = []
    for (let g = 1; g < m.length; g++) {
      const span = ind && ind[g]
      groups.push({ name: names[g - 1] || '', value: m[g], start: span ? span[0] : -1, end: span ? span[1] : -1 })
    }
    return { index: m.index, end: m.index + m[0].length, text: m[0], groups }
  }
  let truncated = false
  if (re.global || re.sticky) {
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(text))) {
      if (hits.length >= max) { truncated = true; break }
      hits.push(toHit(m))
      if (m[0] === '') re.lastIndex += re.unicode || re.flags.includes('v') ? ((text.codePointAt(re.lastIndex) ?? 0) > 0xffff ? 2 : 1) : 1
      if (!re.global) break
    }
  } else {
    const m = re.exec(text)
    if (m) hits.push(toHit(m))
  }
  let replaced = ''
  if (replacement !== null) {
    try {
      replaced = text.replace(new RegExp(pattern, flags), replacement)
    } catch (e) {
      replaced = String(e)
    }
  }
  return { hits, error: '', replaced, truncated, ms: Date.now() - t0 }
}

export interface Tok { src: string; desc: string; kind: 'group' | 'class' | 'quant' | 'anchor' | 'escape' | 'literal' | 'alt' }

const ESC: Record<string, string> = {
  d: 'digit 0–9', D: 'not a digit', w: 'word character [A-Za-z0-9_]', W: 'not a word character', s: 'whitespace', S: 'not whitespace',
  b: 'word boundary', B: 'not a word boundary', n: 'newline', r: 'carriage return', t: 'tab', '0': 'NUL character',
}

/** Splits a pattern into tokens with plain-English descriptions. */
export function explain(p: string): Tok[] {
  const out: Tok[] = []
  for (let i = 0; i < p.length; ) {
    const c = p[i]
    const rest = p.slice(i)
    let m: RegExpExecArray | null
    if (c === '\\') {
      const n = p[i + 1] ?? ''
      if ((m = /^\\k<([^>]+)>/.exec(rest))) { out.push({ src: m[0], desc: `back-reference to group “${m[1]}”`, kind: 'escape' }); i += m[0].length; continue }
      if ((m = /^\\([1-9]\d*)/.exec(rest))) { out.push({ src: m[0], desc: `back-reference to group ${m[1]}`, kind: 'escape' }); i += m[0].length; continue }
      if ((m = /^\\u\{?[0-9a-fA-F]{4,6}\}?|^\\x[0-9a-fA-F]{2}/.exec(rest))) { out.push({ src: m[0], desc: `character ${m[0].slice(2).replace(/[{}]/g, '').toUpperCase()}`, kind: 'escape' }); i += m[0].length; continue }
      if ((m = /^\\[pP]\{[^}]+\}/.exec(rest))) { out.push({ src: m[0], desc: `${n === 'P' ? 'not ' : ''}Unicode property ${m[0].slice(3, -1)} (needs u flag)`, kind: 'class' }); i += m[0].length; continue }
      out.push({ src: c + n, desc: ESC[n] ?? `literal “${n}”`, kind: ESC[n] ? (n === 'b' || n === 'B' ? 'anchor' : 'class') : 'escape' })
      i += 2
      continue
    }
    if (c === '[') {
      let j = i + 1
      if (p[j] === '^') j++
      if (p[j] === ']') j++
      while (j < p.length && p[j] !== ']') j += p[j] === '\\' ? 2 : 1
      const src = p.slice(i, j + 1)
      out.push({ src, desc: `${src[1] === '^' ? 'any character NOT in' : 'one character from'} ${src}`, kind: 'class' })
      i = j + 1
      continue
    }
    if ((m = /^\((\?(?:<([A-Za-z_$][\w$]*)>|:|=|!|<=|<!))?/.exec(rest)) && c === '(') {
      const k = m[1] ?? ''
      const desc = m[2] ? `start of named group “${m[2]}”` : k === '?:' ? 'start of non-capturing group' : k === '?=' ? 'lookahead: followed by…' : k === '?!' ? 'negative lookahead: NOT followed by…' : k === '?<=' ? 'lookbehind: preceded by…' : k === '?<!' ? 'negative lookbehind: NOT preceded by…' : 'start of capturing group'
      out.push({ src: m[0], desc, kind: 'group' })
      i += m[0].length
      continue
    }
    if (c === ')') { out.push({ src: c, desc: 'end of group', kind: 'group' }); i++; continue }
    if ((m = /^(\{(\d+)(,(\d*))?\}|[*+?])(\?)?/.exec(rest))) {
      const q = m[1]
      let d = q === '*' ? '0 or more times' : q === '+' ? '1 or more times' : q === '?' ? 'optional (0 or 1)' : m[3] ? (m[4] ? `${m[2]} to ${m[4]} times` : `${m[2]} or more times`) : `exactly ${m[2]} times`
      if (m[5]) d += ', as few as possible (lazy)'
      out.push({ src: m[0], desc: `previous item ${d}`, kind: 'quant' })
      i += m[0].length
      continue
    }
    if (c === '^' || c === '$') { out.push({ src: c, desc: c === '^' ? 'start of text (or line with m)' : 'end of text (or line with m)', kind: 'anchor' }); i++; continue }
    if (c === '|') { out.push({ src: c, desc: 'OR — alternative', kind: 'alt' }); i++; continue }
    if (c === '.') { out.push({ src: c, desc: 'any character except newline (any at all with s)', kind: 'class' }); i++; continue }
    let j = i
    while (j < p.length && !/[\\[\]().*+?{}^$|]/.test(p[j])) j++
    if (j === i) j = i + 1
    // keep the last char separate if a quantifier follows, so “ab+” reads correctly
    if (j - i > 1 && /^[*+?{]/.test(p[j] ?? '')) j--
    out.push({ src: p.slice(i, j), desc: `literal “${p.slice(i, j)}”`, kind: 'literal' })
    i = j
  }
  return out
}
