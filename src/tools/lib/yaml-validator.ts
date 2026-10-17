// A small, dependency-free YAML 1.2 parser (block + flow styles, block scalars, anchors/aliases,
// merge keys, multiple documents) with line/column errors and lint warnings, plus a YAML emitter.

export type Json = null | boolean | number | string | Json[] | { [k: string]: Json }

export interface YamlIssue {
  line: number // 1-based
  col: number // 1-based
  message: string
  severity: 'error' | 'warning'
}

export class YamlError extends Error {
  line: number
  col: number
  constructor(message: string, line: number, col: number) {
    super(message)
    this.line = line
    this.col = col
  }
}

const isObj = (v: unknown): v is { [k: string]: Json } => typeof v === 'object' && v !== null && !Array.isArray(v)

/** YAML 1.2 core-schema resolution of a plain scalar. */
export function resolvePlain(s: string): Json {
  if (/^(?:~|null|Null|NULL)?$/.test(s)) return null
  if (/^(?:true|True|TRUE)$/.test(s)) return true
  if (/^(?:false|False|FALSE)$/.test(s)) return false
  if (/^[-+]?[0-9]+$/.test(s)) return Number(s)
  if (/^0o[0-7]+$/.test(s)) return parseInt(s.slice(2), 8)
  if (/^0x[0-9a-fA-F]+$/.test(s)) return parseInt(s.slice(2), 16)
  if (/^[-+]?(?:\.[0-9]+|[0-9]+(?:\.[0-9]*)?)(?:[eE][-+]?[0-9]+)?$/.test(s)) return Number(s)
  if (/^[-+]?\.(?:inf|Inf|INF)$/.test(s)) return s.startsWith('-') ? -Infinity : Infinity
  if (/^\.(?:nan|NaN|NAN)$/.test(s)) return NaN
  return s
}

const ESC: Record<string, string> = { '0': '\0', a: '\x07', b: '\b', t: '\t', '\t': '\t', n: '\n', v: '\v', f: '\f', r: '\r', e: '\x1b', ' ': ' ', '"': '"', '/': '/', '\\': '\\', N: '\x85', _: '\xa0', L: '\u2028', P: '\u2029' }

function unescapeDouble(s: string): string {
  let out = ''
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c !== '\\') {
      out += c
      continue
    }
    const n = s[++i]
    if (n === undefined) throw new Error('Dangling backslash in double-quoted string')
    if (n in ESC) out += ESC[n]
    else if (n === 'x' || n === 'u' || n === 'U') {
      const len = n === 'x' ? 2 : n === 'u' ? 4 : 8
      const hex = s.slice(i + 1, i + 1 + len)
      if (!new RegExp(`^[0-9a-fA-F]{${len}}$`).test(hex)) throw new Error(`Invalid \\${n} escape`)
      out += String.fromCodePoint(parseInt(hex, 16))
      i += len
    } else throw new Error(`Unknown escape sequence \\${n}`)
  }
  return out
}

/** Removes a trailing comment (" #…") outside quotes. */
export function stripComment(s: string): string {
  let q = ''
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (q) {
      if (q === '"' && c === '\\') i++
      else if (c === q) q = ''
    } else if ((c === '"' || c === "'") && (i === 0 || /[\s[{,:]/.test(s[i - 1]))) q = c
    else if (c === '#' && (i === 0 || /\s/.test(s[i - 1]))) return s.slice(0, i).trimEnd()
  }
  return s.trimEnd()
}

/** Index of the ':' that separates an implicit key from its value, or -1. */
export function findMapColon(s: string): number {
  let q = ''
  let depth = 0
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (q) {
      if (q === '"' && c === '\\') i++
      else if (c === q) q = ''
    } else if ((c === '"' || c === "'") && (i === 0 || /[\s[{,]/.test(s[i - 1]))) q = c
    else if (c === '[' || c === '{') depth++
    else if (c === ']' || c === '}') depth--
    else if (c === ':' && depth === 0 && (i + 1 === s.length || s[i + 1] === ' ' || s[i + 1] === '\t')) return i
  }
  return -1
}

const indentOf = (l: string) => l.length - l.replace(/^ +/, '').length
const isSeqItem = (c: string) => c === '-' || c.startsWith('- ') || c.startsWith('-\t')
const isBlankOrComment = (l: string) => {
  const t = l.trim()
  return t === '' || t.startsWith('#')
}

const AMBIGUOUS = /^(?:y|Y|yes|Yes|YES|n|N|no|No|NO|on|On|ON|off|Off|OFF)$/

class Parser {
  L: string[]
  i = 0
  end = 0
  anchors = new Map<string, Json>()
  issues: YamlIssue[] = []
  constructor(lines: string[]) {
    this.L = lines
  }

  err(msg: string, j: number, col: number): never {
    throw new YamlError(msg, j + 1, col + 1)
  }

  warn(msg: string, j: number, col: number, severity: 'error' | 'warning' = 'warning') {
    this.issues.push({ line: j + 1, col: col + 1, message: msg, severity })
  }

  nextSig(): number {
    while (this.i < this.end) {
      const l = this.L[this.i]
      if (!isBlankOrComment(l)) {
        if (/^ *\t/.test(l)) this.err('Tab character used for indentation (YAML allows spaces only)', this.i, indentOf(l))
        return this.i
      }
      this.i++
    }
    return -1
  }

  parseBlockNode(p: number): Json {
    const j = this.nextSig()
    if (j < 0) return null
    const n = indentOf(this.L[j])
    if (n <= p) return null
    const content = this.L[j].slice(n)
    if (isSeqItem(content)) return this.parseSeq(n)
    const c = stripComment(content)
    if (!/^[&!*]/.test(c) && findMapColon(c) >= 0) return this.parseMap(n)
    this.i = j + 1
    return this.parseValue(c, j, n, p, false)
  }

  parseSeq(n: number): Json[] {
    const out: Json[] = []
    for (;;) {
      const j = this.nextSig()
      if (j < 0) break
      const line = this.L[j]
      const ind = indentOf(line)
      if (ind < n) break
      if (ind > n) this.err('Bad indentation of a sequence entry', j, ind)
      const c = line.slice(n)
      if (!isSeqItem(c)) break
      const rest = c.slice(1)
      const sp = indentOf(rest.replace(/^\t/, ' '))
      if (isBlankOrComment(rest)) {
        this.i = j + 1
        out.push(this.parseBlockNode(n))
      } else {
        this.L[j] = ' '.repeat(n + 1 + sp) + rest.slice(sp)
        this.i = j
        out.push(this.parseBlockNode(n))
      }
    }
    return out
  }

  parseMap(n: number): { [k: string]: Json } {
    const out: { [k: string]: Json } = {}
    const seen = new Set<string>()
    for (;;) {
      const j = this.nextSig()
      if (j < 0) break
      const line = this.L[j]
      const ind = indentOf(line)
      if (ind < n) break
      if (ind > n) this.err('Bad indentation of a mapping entry', j, ind)
      const c = stripComment(line.slice(n))
      if (isSeqItem(c)) this.err('A sequence entry cannot appear inside a mapping at the same indentation', j, n)
      if (c.startsWith('? ')) this.err('Explicit "? key" entries are not supported', j, n)
      const k = findMapColon(c)
      if (k < 0) this.err('Expected a "key: value" pair (missing colon, or a value at the wrong indentation)', j, n)
      const key = this.parseKey(c.slice(0, k).trim(), j, n)
      const rest = c.slice(k + 1).trim()
      this.i = j + 1
      const v = this.parseValue(rest, j, n + k + 1 + (c.slice(k + 1).length - c.slice(k + 1).trimStart().length), n, true)
      if (key === '<<') {
        const srcs = Array.isArray(v) ? v : [v]
        for (const src of srcs) {
          if (!isObj(src)) this.err('Merge key "<<" needs a mapping or a list of mappings', j, n)
          for (const [mk, mv] of Object.entries(src)) if (!seen.has(mk) && !(mk in out)) out[mk] = mv
        }
        continue
      }
      if (seen.has(key)) this.warn(`Duplicate key "${key}"`, j, n, 'error')
      seen.add(key)
      out[key] = v
    }
    return out
  }

  parseKey(raw: string, j: number, col: number): string {
    if (raw.startsWith('"') || raw.startsWith("'")) {
      const v = this.quotedSingleLine(raw, j, col)
      if (v.rest) this.err('Unexpected characters after quoted key', j, col)
      return v.value
    }
    if (raw.startsWith('[') || raw.startsWith('{')) this.err('Complex (collection) keys are not supported', j, col)
    if (raw.startsWith('*')) {
      const a = this.anchors.get(raw.slice(1))
      if (a === undefined) this.err(`Unknown alias ${raw}`, j, col)
      return String(a)
    }
    return raw
  }

  quotedSingleLine(s: string, j: number, col: number): { value: string; rest: string } {
    const q = s[0]
    for (let i = 1; i < s.length; i++) {
      if (q === '"' && s[i] === '\\') {
        i++
        continue
      }
      if (s[i] === q) {
        if (q === "'" && s[i + 1] === "'") {
          i++
          continue
        }
        const body = s.slice(1, i)
        let value: string
        try {
          value = q === '"' ? unescapeDouble(body) : body.replace(/''/g, "'")
        } catch (e) {
          this.err((e as Error).message, j, col)
        }
        return { value, rest: s.slice(i + 1).trim() }
      }
    }
    this.err('Unterminated quoted string', j, col)
  }

  /** Parses the value text `c` that starts on line j at column `col`; continuation lines must be indented more than `p`. */
  parseValue(c: string, j: number, col: number, p: number, compactSeq: boolean, tag?: string): Json {
    if (c === '') {
      const nj = this.nextSig()
      if (nj < 0) return null
      const ind = indentOf(this.L[nj])
      if (ind > p) return this.parseBlockNode(p)
      if (compactSeq && ind === p && isSeqItem(this.L[nj].slice(p))) return this.parseSeq(p)
      return null
    }
    // node properties: &anchor and !tag
    const pm = /^(?:(&[^\s,[\]{}]+)|(![^\s]*))(?:\s+|$)/.exec(c)
    if (pm) {
      const rest = c.slice(pm[0].length)
      if (pm[1]) {
        const v = this.parseValue(rest, j, col + pm[0].length, p, compactSeq, tag)
        this.anchors.set(pm[1].slice(1), v)
        return v
      }
      return this.parseValue(rest, j, col + pm[0].length, p, compactSeq, pm[2])
    }
    if (c.startsWith('*')) {
      const name = c.slice(1).trim()
      if (!this.anchors.has(name)) this.err(`Unknown alias *${name}`, j, col)
      return this.anchors.get(name)!
    }
    if (c[0] === '|' || c[0] === '>') return this.blockScalar(c, j, col, p)
    if (c[0] === '[' || c[0] === '{') return this.flowMultiline(c, j, col)
    if (c[0] === '"' || c[0] === "'") {
      const s = this.quoted(c, j, col, p)
      return tag && tag !== '!!str' ? this.tagged(s, tag, j, col) : s
    }
    if (c.startsWith('%') || c.startsWith('@') || c.startsWith('`')) this.err(`Plain values cannot start with "${c[0]}" — quote the value`, j, col)
    // plain scalar, possibly folded over several lines
    let text = c
    let blanks = 0
    for (let k = this.i; k < this.end; k++) {
      const l = this.L[k]
      if (l.trim() === '') {
        blanks++
        continue
      }
      if (l.trim().startsWith('#') || indentOf(l) <= p) break
      const t = stripComment(l.trim())
      if (findMapColon(t) >= 0) this.err('Bad indentation of a mapping entry (or an unquoted ": " inside a value)', k, indentOf(l))
      text += blanks ? '\n'.repeat(blanks) + t : ' ' + t
      blanks = 0
      this.i = k + 1
      if (t !== l.trim()) break
    }
    if (tag) return this.tagged(text, tag, j, col)
    const v = resolvePlain(text)
    if (typeof v === 'string') {
      if (AMBIGUOUS.test(v)) this.warn(`"${v}" is a boolean in YAML 1.1 parsers (the "Norway problem"); quote it to be safe`, j, col)
      if (v.includes(': ')) this.warn('Value contains ": " — quote it so it is not read as a key', j, col)
    } else if (typeof v === 'number' && /^[-+]?0[0-9]+$/.test(text)) this.warn(`${text} is octal in YAML 1.1 parsers; quote it if it is an ID or zip code`, j, col)
    else if (typeof v === 'number' && Number.isInteger(v) && !Number.isSafeInteger(v)) this.warn(`${text} is too large to be represented exactly in JSON/JavaScript`, j, col)
    return v
  }

  tagged(text: string, tag: string, j: number, col: number): Json {
    switch (tag) {
      case '!!str':
        return text
      case '!!int': {
        const v = resolvePlain(text)
        if (typeof v !== 'number' || !Number.isInteger(v)) this.err(`"${text}" is not an integer`, j, col)
        return v
      }
      case '!!float': {
        const v = Number(text)
        if (Number.isNaN(v) && !/nan/i.test(text)) this.err(`"${text}" is not a float`, j, col)
        return resolvePlain(text) as number
      }
      case '!!bool': {
        const v = resolvePlain(text)
        if (typeof v !== 'boolean') this.err(`"${text}" is not a boolean`, j, col)
        return v
      }
      case '!!null':
        return null
      default:
        if (!tag.startsWith('!!')) this.warn(`Custom tag ${tag} is ignored in the JSON output`, j, col)
        return resolvePlain(text)
    }
  }

  quoted(c: string, j: number, col: number, p: number): string {
    const q = c[0]
    // gather raw text until the closing quote, possibly over several lines
    const parts = [c]
    let k = this.i
    const closed = (s: string, first: boolean) => {
      for (let i = first ? 1 : 0; i < s.length; i++) {
        if (q === '"' && s[i] === '\\') {
          i++
          continue
        }
        if (s[i] === q) {
          if (q === "'" && s[i + 1] === "'") {
            i++
            continue
          }
          return i
        }
      }
      return -1
    }
    let at = closed(c, true)
    while (at < 0) {
      if (k >= this.end) this.err('Unterminated quoted string', j, col)
      const l = this.L[k++]
      if (l.trim() !== '' && indentOf(l) <= p && p >= 0) this.err('Unterminated quoted string (continuation lines must be indented)', j, col)
      parts.push(l.trim())
      at = closed(l.trim(), false)
    }
    this.i = Math.max(this.i, k)
    const lastLine = parts.length > 1 ? k - 1 : j
    const last = parts[parts.length - 1]
    if (stripComment(last.slice(at + 1)).trim()) this.err('Unexpected characters after a quoted string', lastLine, col)
    parts[parts.length - 1] = last.slice(0, at + 1)
    const segs = parts.map((s, i) => {
      let t = i === 0 ? s.slice(1) : s
      if (i === parts.length - 1) t = t.slice(0, -1)
      return t
    })
    // fold line breaks: single break → space, empty lines → \n, "\" at the end of a line (double quotes) → join
    let body = segs.length > 1 ? segs[0].trimEnd() : segs[0]
    let nl = 0
    for (let i = 1; i < segs.length; i++) {
      const t = i === segs.length - 1 ? segs[i].trimStart() : segs[i].trim()
      if (t === '' && i < segs.length - 1) {
        nl++
        continue
      }
      if (nl) body += '\n'.repeat(nl)
      else if (q === '"' && /(^|[^\\])(\\\\)*\\$/.test(body)) body = body.slice(0, -1)
      else body += ' '
      nl = 0
      body += t
    }
    try {
      return q === '"' ? unescapeDouble(body) : body.replace(/''/g, "'")
    } catch (e) {
      this.err((e as Error).message, j, col)
    }
  }

  blockScalar(header: string, j: number, col: number, p: number): string {
    const m = /^([|>])([+-]?)([1-9]?)([+-]?)\s*$/.exec(header)
    if (!m) this.err(`Invalid block scalar header "${header}"`, j, col)
    const folded = m[1] === '>'
    const chomp = m[2] || m[4]
    let ci = m[3] ? (p < 0 ? 0 : p) + Number(m[3]) : -1
    const raw: string[] = []
    let k = this.i
    for (; k < this.end; k++) {
      const l = this.L[k]
      if (l.trim() === '') {
        raw.push(l)
        continue
      }
      const ind = indentOf(l)
      if (ind <= p) break
      if (ci < 0) ci = ind
      if (ind < ci) this.err('Bad indentation inside a block scalar', k, ind)
      raw.push(l)
    }
    // trailing blank lines after the scalar belong to the scalar only for "keep" — never consume beyond content
    this.i = k
    const lines = raw.map((l) => (l.trim() === '' && indentOf(l) <= Math.max(ci, 0) ? '' : l.slice(Math.max(ci, 0))))
    let last = lines.length - 1
    while (last >= 0 && lines[last] === '') last--
    const body = lines.slice(0, last + 1)
    const trailing = lines.length - 1 - last
    if (!body.length) return chomp === '+' ? '\n'.repeat(lines.length) : ''
    let text: string
    if (!folded) text = body.join('\n')
    else {
      text = ''
      let empty = 0
      let first = true
      let prevMore = false
      for (const l of body) {
        if (l === '') {
          empty++
          continue
        }
        const more = l[0] === ' ' || l[0] === '\t'
        if (first) text += '\n'.repeat(empty)
        else if (more || prevMore) text += '\n'.repeat(empty + 1)
        else text += empty ? '\n'.repeat(empty) : ' '
        text += l
        first = false
        empty = 0
        prevMore = more
      }
    }
    if (chomp === '-') return text
    if (chomp === '+') return text + '\n' + '\n'.repeat(trailing)
    return text + '\n'
  }

  flowMultiline(c: string, j: number, col: number): Json {
    let text = c
    const balance = (s: string) => {
      let d = 0
      let q = ''
      for (let i = 0; i < s.length; i++) {
        const ch = s[i]
        if (q) {
          if (q === '"' && ch === '\\') i++
          else if (ch === q) q = ''
        } else if (ch === '"' || ch === "'") q = ch
        else if (ch === '[' || ch === '{') d++
        else if (ch === ']' || ch === '}') d--
      }
      return d
    }
    let k = this.i
    while (balance(text) > 0) {
      if (k >= this.end) this.err('Unclosed flow collection (missing ] or })', j, col)
      text += ' ' + stripComment(this.L[k++].trim())
    }
    this.i = k
    const f = new Flow(text, this, j, col)
    const v = f.value()
    f.ws()
    if (f.i < text.length) this.err(`Unexpected "${text.slice(f.i, f.i + 12)}" after flow collection`, j, col + f.i)
    return v
  }

  parseAll(text: string): Json[] {
    const docs: Json[] = []
    const n = this.L.length
    let start = 0
    let started = false
    const flush = (endIdx: number, force: boolean) => {
      this.i = start
      this.end = endIdx
      const has = this.nextSig() >= 0
      if (!has && !force) return
      const v = this.parseBlockNode(-1)
      const left = this.nextSig()
      if (left >= 0) this.err('Unexpected content (check the indentation of this line)', left, indentOf(this.L[left]))
      docs.push(v)
    }
    for (let k = 0; k < n; k++) {
      const l = this.L[k]
      if (!started && /^%/.test(l)) {
        this.L[k] = ''
        continue
      }
      if (/^---(?:\s|$)/.test(l)) {
        if (started || k > start) flush(k, started)
        started = true
        this.L[k] = l.slice(3).trim()
        start = k
      } else if (/^\.\.\.\s*$/.test(l)) {
        this.L[k] = ''
        flush(k, started)
        started = false
        start = k + 1
      }
    }
    flush(n, started)
    if (!docs.length && text.trim() === '') docs.push(null)
    return docs
  }
}

class Flow {
  s: string
  i = 0
  P: Parser
  j: number
  col: number
  constructor(s: string, P: Parser, j: number, col: number) {
    this.s = s
    this.P = P
    this.j = j
    this.col = col
  }
  fail(msg: string): never {
    return this.P.err(msg, this.j, this.col + Math.min(this.i, this.s.length))
  }
  ws() {
    while (this.i < this.s.length && /\s/.test(this.s[this.i])) this.i++
  }
  value(): Json {
    this.ws()
    const c = this.s[this.i]
    if (c === '[') return this.seq()
    if (c === '{') return this.map()
    if (c === '"' || c === "'") return this.quoted()
    if (c === '*') {
      const m = /^\*([^\s,[\]{}]+)/.exec(this.s.slice(this.i))!
      this.i += m[0].length
      if (!this.P.anchors.has(m[1])) this.fail(`Unknown alias *${m[1]}`)
      return this.P.anchors.get(m[1])!
    }
    return resolvePlain(this.plain())
  }
  plain(): string {
    const st = this.i
    while (this.i < this.s.length) {
      const c = this.s[this.i]
      if (c === ',' || c === ']' || c === '}' || c === '[' || c === '{') break
      if (c === ':' && (this.i + 1 >= this.s.length || /[\s,\]}]/.test(this.s[this.i + 1]))) break
      this.i++
    }
    return this.s.slice(st, this.i).trim()
  }
  quoted(): string {
    const q = this.s[this.i]
    let k = this.i + 1
    for (; k < this.s.length; k++) {
      if (q === '"' && this.s[k] === '\\') {
        k++
        continue
      }
      if (this.s[k] === q) {
        if (q === "'" && this.s[k + 1] === "'") {
          k++
          continue
        }
        break
      }
    }
    if (k >= this.s.length) this.fail('Unterminated quoted string')
    const body = this.s.slice(this.i + 1, k)
    this.i = k + 1
    try {
      return q === '"' ? unescapeDouble(body) : body.replace(/''/g, "'")
    } catch (e) {
      return this.fail((e as Error).message)
    }
  }
  seq(): Json[] {
    this.i++
    const out: Json[] = []
    for (;;) {
      this.ws()
      if (this.s[this.i] === ']') {
        this.i++
        return out
      }
      if (this.i >= this.s.length) this.fail('Missing ] at the end of a flow sequence')
      let v = this.value()
      this.ws()
      if (this.s[this.i] === ':') {
        this.i++
        const val = this.value()
        v = { [String(v)]: val }
        this.ws()
      }
      out.push(v)
      if (this.s[this.i] === ',') this.i++
      else if (this.s[this.i] !== ']') this.fail('Expected "," or "]" in flow sequence')
    }
  }
  map(): { [k: string]: Json } {
    this.i++
    const out: { [k: string]: Json } = {}
    for (;;) {
      this.ws()
      if (this.s[this.i] === '}') {
        this.i++
        return out
      }
      if (this.i >= this.s.length) this.fail('Missing } at the end of a flow mapping')
      const c = this.s[this.i]
      const key = c === '"' || c === "'" ? this.quoted() : this.plain()
      this.ws()
      let v: Json = null
      if (this.s[this.i] === ':') {
        this.i++
        this.ws()
        if (this.s[this.i] !== ',' && this.s[this.i] !== '}') v = this.value()
      }
      if (key in out) this.P.warn(`Duplicate key "${key}"`, this.j, this.col, 'error')
      out[key] = v
      this.ws()
      if (this.s[this.i] === ',') this.i++
      else if (this.s[this.i] !== '}') this.fail('Expected "," or "}" in flow mapping')
    }
  }
}

export interface ParseResult {
  docs: Json[]
  issues: YamlIssue[]
  ok: boolean
}

export function parseYaml(text: string): ParseResult {
  const src = text.replace(/\r\n?/g, '\n').replace(/^\uFEFF/, '')
  const lines = src.split('\n')
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop()
  const P = new Parser(lines)
  let docs: Json[] = []
  try {
    docs = P.parseAll(src)
  } catch (e) {
    if (e instanceof YamlError) P.issues.push({ line: e.line, col: e.col, message: e.message, severity: 'error' })
    else P.issues.push({ line: 1, col: 1, message: (e as Error).message, severity: 'error' })
  }
  const issues = [...P.issues, ...lintYaml(src)].sort((a, b) => a.line - b.line || (a.severity === 'error' ? -1 : 1))
  return { docs, issues, ok: !issues.some((i) => i.severity === 'error') }
}

/** Style warnings that do not depend on the parse. */
export function lintYaml(text: string): YamlIssue[] {
  const out: YamlIssue[] = []
  text.split('\n').forEach((l, i) => {
    if (/[ \t]+$/.test(l) && l.trim() !== '') out.push({ line: i + 1, col: l.trimEnd().length + 1, message: 'Trailing whitespace', severity: 'warning' })
    if (l.length > 160) out.push({ line: i + 1, col: 161, message: `Line is ${l.length} characters long`, severity: 'warning' })
  })
  return out
}

// ---------- emitter ----------

function needsQuotes(s: string): boolean {
  if (s === '') return true
  if (typeof resolvePlain(s) !== 'string' || AMBIGUOUS.test(s)) return true
  if (/^[\s\-?:,[\]{}#&*!|>'"%@`]/.test(s) && !/^-[^\s]/.test(s)) return true
  if (/^-$|^- /.test(s)) return true
  if (/\s$/.test(s) || /: |:$| #|\t/.test(s)) return true
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f\u2028\u2029]/.test(s)) return true
  return false
}

export function scalarToYaml(v: Json): string {
  if (v === null) return 'null'
  if (typeof v === 'boolean') return String(v)
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : Number.isNaN(v) ? '.nan' : v > 0 ? '.inf' : '-.inf'
  if (typeof v === 'string') return needsQuotes(v) ? JSON.stringify(v) : v
  return JSON.stringify(v)
}

function stringValue(s: string, pad: string): string {
  // multi-line strings become literal block scalars when that is safe
  // eslint-disable-next-line no-control-regex
  if (s.includes('\n') && !/^[ \t\n]/.test(s) && !/[\x00-\x08\x0b-\x1f\x7f]/.test(s) && !/\n[ \t]+(\n|$)/.test(s)) {
    const m = /\n*$/.exec(s)![0].length
    const chomp = m === 0 ? '-' : m === 1 ? '' : '+'
    const body = (m ? s.slice(0, -m) : s).split('\n').map((l) => (l ? pad + l : ''))
    const extra = chomp === '+' ? '\n'.repeat(m - 1) : ''
    return `|${chomp}\n${body.join('\n')}${extra}`
  }
  return scalarToYaml(s)
}

const isColl = (v: Json): v is Json[] | { [k: string]: Json } => typeof v === 'object' && v !== null
const emptyColl = (v: Json) => (Array.isArray(v) ? '[]' : '{}')
const isEmptyColl = (v: Json) => isColl(v) && (Array.isArray(v) ? v.length === 0 : Object.keys(v).length === 0)

function block(v: Json[] | { [k: string]: Json }, pad: string, ind: number, sort: boolean): string {
  const step = ' '.repeat(ind)
  if (Array.isArray(v)) {
    const dash = '-' + ' '.repeat(Math.max(1, ind - 1))
    return v
      .map((it) => {
        if (isColl(it) && !isEmptyColl(it)) return pad + dash + block(it, pad + step, ind, sort).trimStart()
        if (isEmptyColl(it)) return pad + dash + emptyColl(it)
        return pad + dash + (typeof it === 'string' ? stringValue(it, pad + step) : scalarToYaml(it))
      })
      .join('\n')
  }
  const keys = Object.keys(v)
  if (sort) keys.sort()
  return keys
    .map((k) => {
      const val = v[k]
      const key = needsQuotes(k) ? JSON.stringify(k) : k
      if (isColl(val) && !isEmptyColl(val)) return `${pad}${key}:\n${block(val, pad + step, ind, sort)}`
      if (isEmptyColl(val)) return `${pad}${key}: ${emptyColl(val)}`
      return `${pad}${key}: ${typeof val === 'string' ? stringValue(val, pad + step) : scalarToYaml(val)}`
    })
    .join('\n')
}

/** Serializes a JSON value as block-style YAML. */
export function toYaml(v: Json, indent = 2, sortKeys = false): string {
  const ind = Math.max(2, Math.min(8, Math.round(indent)))
  if (isColl(v) && !isEmptyColl(v)) return block(v, '', ind, sortKeys) + '\n'
  if (isEmptyColl(v)) return emptyColl(v) + '\n'
  return (typeof v === 'string' ? stringValue(v, ' '.repeat(ind)) : scalarToYaml(v)) + '\n'
}

export function docsToYaml(docs: Json[], indent = 2, sortKeys = false): string {
  return docs.length <= 1 ? toYaml(docs[0] ?? null, indent, sortKeys) : docs.map((d) => '---\n' + toYaml(d, indent, sortKeys)).join('')
}

/** Converts tabs in indentation to spaces, removes trailing whitespace, normalizes line endings. */
export function fixWhitespace(text: string, indent = 2): string {
  const out = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => {
      const m = /^[ \t]*/.exec(l)![0]
      return m.replace(/\t/g, ' '.repeat(indent)) + l.slice(m.length).trimEnd()
    })
    .join('\n')
  return out.replace(/\n*$/, '\n')
}

/** Line/column (1-based) of a JSON.parse error, when the engine reports a position. */
export function jsonErrorPos(text: string, message: string): { line: number; col: number } | null {
  const pos = /position (\d+)/.exec(message)
  if (pos) {
    const before = text.slice(0, Number(pos[1]))
    const lines = before.split('\n')
    return { line: lines.length, col: lines[lines.length - 1].length + 1 }
  }
  const lc = /line (\d+) column (\d+)/.exec(message)
  return lc ? { line: Number(lc[1]), col: Number(lc[2]) } : null
}

/** Counts nodes, keys and depth of a value (for the summary). */
export function stats(v: Json): { keys: number; items: number; depth: number; scalars: number } {
  const r = { keys: 0, items: 0, depth: 0, scalars: 0 }
  const walk = (x: Json, d: number) => {
    r.depth = Math.max(r.depth, d)
    if (Array.isArray(x)) {
      r.items += x.length
      x.forEach((y) => walk(y, d + 1))
    } else if (isObj(x)) {
      const ks = Object.keys(x)
      r.keys += ks.length
      ks.forEach((k) => walk(x[k], d + 1))
    } else r.scalars++
  }
  walk(v, 0)
  return r
}
