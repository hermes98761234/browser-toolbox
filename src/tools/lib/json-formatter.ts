// JSON Formatter: strict validating parser with precise error positions, a lenient repair
// pass (comments, trailing commas, single quotes, bare keys, Python literals), formatting
// and document statistics.

export interface JsonError { pos: number; line: number; col: number; msg: string }
export interface Check { ok: boolean; error?: JsonError; warnings: string[] }

export function lineCol(text: string, pos: number): { line: number; col: number } {
  let line = 1, last = -1
  for (let i = 0; i < pos && i < text.length; i++) if (text[i] === '\n') { line++; last = i }
  return { line, col: pos - last }
}

/** Validates strict JSON (RFC 8259). Reports the first error with line/column and warnings (duplicate keys, unsafe integers). */
export function validate(text: string): Check {
  let i = 0
  const warnings: string[] = []
  const fail = (msg: string, at = i): never => { throw Object.assign(new Error(msg), { pos: at }) }
  const ws = () => { while (i < text.length && (text[i] === ' ' || text[i] === '\t' || text[i] === '\n' || text[i] === '\r')) i++ }
  const show = (c: string | undefined) => (c === undefined ? 'end of input' : `'${c}'`)
  const str = (): string => {
    const start = i
    i++
    let out = ''
    for (;;) {
      if (i >= text.length) fail('Unterminated string', start)
      const c = text[i]
      if (c === '"') { i++; return out }
      if (c === '\\') {
        const e = text[i + 1]
        if (e === 'u') {
          if (!/^[0-9a-fA-F]{4}$/.test(text.slice(i + 2, i + 6))) fail('Invalid \\u escape: expected 4 hex digits', i)
          out += String.fromCharCode(parseInt(text.slice(i + 2, i + 6), 16))
          i += 6
        } else if (e !== undefined && '"\\/bfnrt'.includes(e)) { out += e; i += 2 } else fail(`Invalid escape sequence '\\${e ?? ''}'`, i)
        continue
      }
      if (c < ' ') fail(c === '\n' ? 'Line break inside string (escape it as \\n)' : 'Control character inside string', i)
      out += c
      i++
    }
  }
  const numb = () => {
    const m = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/.exec(text.slice(i, i + 400))
    if (!m || !m[0] || m[0] === '-') fail(`Invalid number`, i)
    const after = text[i + m![0].length]
    if (after !== undefined && /[\d.eE]/.test(after)) fail(text[i] === '0' || text.slice(i, i + 2) === '-0' ? 'Leading zeros are not allowed' : 'Invalid number', i)
    if (!m![2] && !m![3] && Math.abs(Number(m![0])) > Number.MAX_SAFE_INTEGER && warnings.length < 20) warnings.push(`Integer ${m![0]} at ${fmtPos(text, i)} exceeds 2^53 and will lose precision in JavaScript`)
    i += m![0].length
  }
  const value = (depth: number, path: string): void => {
    if (depth > 5000) fail('Nesting too deep')
    ws()
    const c = text[i]
    if (c === '{') {
      i++
      ws()
      if (text[i] === '}') { i++; return }
      const seen = new Set<string>()
      for (;;) {
        ws()
        if (text[i] === '/') fail('Comments are not allowed in JSON')
        if (text[i] !== '"') fail(text[i] === '}' ? 'Trailing comma before }' : text[i] === "'" ? 'Property names must use double quotes' : `Expected property name in double quotes, found ${show(text[i])}`)
        const kpos = i
        const k = str()
        if (seen.has(k) && warnings.length < 20) warnings.push(`Duplicate key "${k}" in ${path || '$'} at ${fmtPos(text, kpos)} (last one wins)`)
        seen.add(k)
        ws()
        if (text[i] !== ':') fail(`Expected ':' after property name, found ${show(text[i])}`)
        i++
        value(depth + 1, `${path || '$'}.${k}`)
        ws()
        if (text[i] === ',') { i++; continue }
        if (text[i] === '}') { i++; return }
        fail(`Expected ',' or '}' after property value, found ${show(text[i])}`)
      }
    }
    if (c === '[') {
      i++
      ws()
      if (text[i] === ']') { i++; return }
      let n = 0
      for (;;) {
        ws()
        if (text[i] === ']') fail('Trailing comma before ]')
        value(depth + 1, `${path || '$'}[${n++}]`)
        ws()
        if (text[i] === ',') { i++; continue }
        if (text[i] === ']') { i++; return }
        fail(`Expected ',' or ']' after array element, found ${show(text[i])}`)
      }
    }
    if (c === '"') { str(); return }
    if (c === '-' || (c >= '0' && c <= '9')) { numb(); return }
    for (const lit of ['true', 'false', 'null']) if (text.startsWith(lit, i)) { i += lit.length; return }
    if (c === undefined) fail('Unexpected end of input: a value is missing')
    if (c === "'") fail('Strings must use double quotes')
    if (c === '/') fail('Comments are not allowed in JSON')
    const word = /^[A-Za-z_]\w*/.exec(text.slice(i))?.[0]
    if (word === 'undefined' || word === 'NaN' || word === 'Infinity' || word === 'True' || word === 'False' || word === 'None') fail(`'${word}' is not valid JSON`)
    fail(`Unexpected ${show(c)}`)
  }
  try {
    if (text.charCodeAt(0) === 0xfeff) i = 1
    ws()
    if (i >= text.length) fail('Empty document')
    value(0, '')
    ws()
    if (i < text.length) fail(`Unexpected ${show(text[i])} after the end of the JSON value`)
    return { ok: true, warnings }
  } catch (e) {
    const pos = (e as { pos?: number }).pos ?? i
    const { line, col } = lineCol(text, pos)
    return { ok: false, error: { pos, line, col, msg: (e as Error).message }, warnings }
  }
}

function fmtPos(text: string, pos: number) {
  const { line, col } = lineCol(text, pos)
  return `line ${line}:${col}`
}

/** Best-effort conversion of JSON-like text (JS object literals, JSON5-ish, Python dict repr) into strict JSON. */
export function repair(text: string): string {
  let out = ''
  let i = 0
  const n = text.length
  const isIdStart = (c: string) => /[A-Za-z_$]/.test(c)
  while (i < n) {
    const c = text[i]
    if (c === '/' && text[i + 1] === '/') { while (i < n && text[i] !== '\n') i++; continue }
    if (c === '/' && text[i + 1] === '*') { const e = text.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; continue }
    if (c === '#') { while (i < n && text[i] !== '\n') i++; continue }
    if (c === '"' || c === "'") {
      let j = i + 1, s = ''
      while (j < n && text[j] !== c) {
        if (text[j] === '\\') {
          const e = text[j + 1]
          if (e === "'") s += "'"
          else if (e === '\n') { /* line continuation */ } else s += '\\' + (e ?? '')
          j += 2
          continue
        }
        if (text[j] === '"') s += '\\"'
        else if (text[j] === '\n') s += '\\n'
        else if (text[j] === '\t') s += '\\t'
        else s += text[j]
        j++
      }
      out += `"${s}"`
      i = j + 1
      continue
    }
    if (c === ',') {
      let j = i + 1
      while (j < n && /\s/.test(text[j])) j++
      if (text[j] === '}' || text[j] === ']') { i++; continue }
      out += c
      i++
      continue
    }
    if (isIdStart(c)) {
      let j = i
      while (j < n && /[\w$]/.test(text[j])) j++
      const w = text.slice(i, j)
      let k = j
      while (k < n && /\s/.test(text[k])) k++
      const map: Record<string, string> = { True: 'true', False: 'false', None: 'null', undefined: 'null', NaN: 'null', Infinity: 'null' }
      if (text[k] === ':' && !['true', 'false', 'null'].includes(w)) out += `"${w}"`
      else out += map[w] ?? w
      i = j
      continue
    }
    if (c === '+' && /\d/.test(text[i + 1] ?? '')) { i++; continue }
    out += c
    i++
  }
  return out
}

export function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys)
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort((a, b) => a.localeCompare(b)).map((k) => [k, sortKeys((v as Record<string, unknown>)[k])]))
  return v
}

export function format(v: unknown, indent: number | 'tab' | 0, sort = false): string {
  const x = sort ? sortKeys(v) : v
  return indent === 0 ? JSON.stringify(x) : JSON.stringify(x, null, indent === 'tab' ? '\t' : indent)
}

export interface Stats { objects: number; arrays: number; strings: number; numbers: number; bools: number; nulls: number; keys: number; depth: number }
export function stats(v: unknown): Stats {
  const s: Stats = { objects: 0, arrays: 0, strings: 0, numbers: 0, bools: 0, nulls: 0, keys: 0, depth: 0 }
  const walk = (x: unknown, d: number) => {
    s.depth = Math.max(s.depth, d)
    if (Array.isArray(x)) { s.arrays++; x.forEach((y) => walk(y, d + 1)) }
    else if (x === null) s.nulls++
    else if (typeof x === 'object') { s.objects++; for (const [, y] of Object.entries(x)) { s.keys++; walk(y, d + 1) } }
    else if (typeof x === 'string') s.strings++
    else if (typeof x === 'number') s.numbers++
    else s.bools++
  }
  walk(v, 0)
  return s
}

/** JSONPath-style accessor for a child key. */
export const childPath = (parent: string, key: string | number) =>
  typeof key === 'number' ? `${parent}[${key}]` : /^[A-Za-z_$][\w$]*$/.test(key) ? `${parent}.${key}` : `${parent}[${JSON.stringify(key)}]`
