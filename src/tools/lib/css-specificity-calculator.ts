// CSS selector parser (Selectors Level 4 syntax) and specificity per https://www.w3.org/TR/selectors-4/#specificity-rules
// :is() :not() :has() → most specific argument; :where() → 0; :nth-child(An+B of S) → pseudo-class + most specific S;
// ::slotted(), :host(), :host-context() → their own weight + argument; legacy :before/:after/:first-line/:first-letter → pseudo-elements.

export type Spec = [number, number, number]
export type Kind = 'id' | 'class' | 'attribute' | 'pseudo-class' | 'type' | 'pseudo-element' | 'universal' | 'nesting'
export interface Simple { kind: Kind; text: string; name: string; args?: SelectorList; argText?: string; pos: number }
export interface Compound { parts: Simple[] }
export interface Complex { compounds: Compound[]; combinators: string[]; text: string; relative?: string }
export type SelectorList = Complex[]

export class SelectorError extends Error {
  pos: number
  constructor(msg: string, pos: number) { super(msg); this.pos = pos }
}

const LEGACY_PE = new Set(['before', 'after', 'first-line', 'first-letter'])
const SELECTOR_ARG = new Set(['is', 'not', 'where', 'has', 'matches', '-webkit-any', '-moz-any', 'host', 'host-context'])
const NTH = new Set(['nth-child', 'nth-last-child'])
const PE_SELECTOR_ARG = new Set(['slotted', 'cue', 'cue-region'])

const isNameStart = (c: string) => /[A-Za-z_\u0080-￿]/.test(c)
const isName = (c: string) => /[A-Za-z0-9_\-\u0080-￿]/.test(c)

class P {
  s: string
  i = 0
  constructor(s: string) { this.s = s }
  get c() { return this.s[this.i] ?? '' }
  err(m: string): never { throw new SelectorError(m, this.i) }
  ws() { const st = this.i; while (/\s/.test(this.c) || this.s.startsWith('/*', this.i)) { if (this.c === '/') { const e = this.s.indexOf('*/', this.i + 2); this.i = e < 0 ? this.s.length : e + 2 } else this.i++ } return this.i > st }
  escape(): string {
    this.i++ // backslash
    const m = /^[0-9a-fA-F]{1,6}\s?/.exec(this.s.slice(this.i))
    if (m) { this.i += m[0].length; const cp = parseInt(m[0], 16); return cp === 0 || cp > 0x10ffff ? '�' : String.fromCodePoint(cp) }
    if (this.i >= this.s.length) return '�'
    return this.s[this.i++]
  }
  ident(): string {
    let out = ''
    if (this.c === '-') { out += '-'; this.i++; if (this.c === '-') { out += '-'; this.i++ } }
    if (!(isNameStart(this.c) || this.c === '\\' || out === '--')) this.err('Expected an identifier')
    while (this.i < this.s.length && (isName(this.c) || this.c === '\\')) out += this.c === '\\' ? this.escape() : this.s[this.i++]
    if (!out || out === '-') this.err('Expected an identifier')
    return out
  }
  /** Raw text up to the matching ")" (handles nesting, strings, escapes). */
  balanced(): string {
    const st = this.i
    let depth = 0
    while (this.i < this.s.length) {
      const ch = this.c
      if (ch === '\\') { this.i += 2; continue }
      if (ch === '"' || ch === "'") { const q = ch; this.i++; while (this.i < this.s.length && this.c !== q) this.i += this.c === '\\' ? 2 : 1; this.i++; continue }
      if (ch === '(' || ch === '[') depth++
      if (ch === ')' || ch === ']') { if (depth === 0) return this.s.slice(st, this.i); depth-- }
      this.i++
    }
    this.err('Missing ")"')
  }

  list(relative = false, forgiving = false): SelectorList {
    const out: SelectorList = []
    for (;;) {
      this.ws()
      const st = this.i
      try {
        out.push(this.complex(relative))
      } catch (e) {
        if (!forgiving) throw e
        // forgiving list (:is / :where): skip the bad selector up to the next top-level comma
        this.i = st
        let depth = 0
        while (this.i < this.s.length && !(depth === 0 && (this.c === ',' || this.c === ')'))) { if ('(['.includes(this.c)) depth++; if (')]'.includes(this.c)) depth--; this.i++ }
      }
      this.ws()
      if (this.c === ',') { this.i++; continue }
      return out
    }
  }

  complex(relative: boolean): Complex {
    const st = this.i
    const compounds: Compound[] = [], combinators: string[] = []
    let lead: string | undefined
    this.ws()
    if (relative && /[>+~]/.test(this.c)) { lead = this.c; this.i++; this.ws() }
    compounds.push(this.compound())
    for (;;) {
      const hadWs = this.ws()
      const ch = this.c
      if (ch === '>' || ch === '+' || ch === '~' || (ch === '|' && this.s[this.i + 1] === '|')) {
        const comb = ch === '|' ? '||' : ch
        this.i += comb.length
        this.ws()
        combinators.push(comb)
        compounds.push(this.compound())
      } else if (hadWs && ch && ch !== ',' && ch !== ')') {
        combinators.push(' ')
        compounds.push(this.compound())
      } else break
    }
    return { compounds, combinators, text: this.s.slice(st, this.i).trim(), relative: lead }
  }

  compound(): Compound {
    const parts: Simple[] = []
    // type / universal with optional namespace prefix
    const st = this.i
    const tryType = () => {
      let ns = ''
      if (this.c === '|' && this.s[this.i + 1] !== '|') { this.i++; ns = '|' }
      else if (this.c === '*' || isNameStart(this.c) || this.c === '\\' || (this.c === '-' && this.s[this.i + 1] !== undefined && !/[\d\s]/.test(this.s[this.i + 1]))) {
        const save = this.i
        const n = this.c === '*' ? (this.i++, '*') : this.ident()
        if (this.c === '|' && this.s[this.i + 1] !== '|' && this.s[this.i + 1] !== '=') { this.i++; ns = n + '|' }
        else { this.i = save; ns = '' }
      }
      if (this.c === '*') { this.i++; parts.push({ kind: 'universal', text: this.s.slice(st, this.i), name: '*', pos: st }); return }
      if (isNameStart(this.c) || this.c === '\\' || this.c === '-') { const n = this.ident(); parts.push({ kind: 'type', text: this.s.slice(st, this.i), name: (ns + n).toLowerCase(), pos: st }); return }
      if (ns) this.err('Expected an element name after the namespace "|"')
    }
    tryType()
    for (;;) {
      const p = this.i
      const ch = this.c
      if (ch === '#') { this.i++; const n = this.ident(); parts.push({ kind: 'id', text: this.s.slice(p, this.i), name: n, pos: p }) }
      else if (ch === '.') { this.i++; const n = this.ident(); parts.push({ kind: 'class', text: this.s.slice(p, this.i), name: n, pos: p }) }
      else if (ch === '&') { this.i++; parts.push({ kind: 'nesting', text: '&', name: '&', pos: p }) }
      else if (ch === '[') {
        this.i++; this.ws()
        if (this.c === '*' || this.c === '|') { while (this.c !== '|' && this.i < this.s.length) this.i++; this.i++ }
        const n = this.ident(); this.ws()
        let m: RegExpExecArray | null
        if ((m = /^([~|^$*]?=)/.exec(this.s.slice(this.i)))) {
          this.i += m[1].length; this.ws()
          if (this.c === '"' || this.c === "'") { const q = this.c; this.i++; while (this.i < this.s.length && this.c !== q) this.i += this.s[this.i] === '\\' ? 2 : 1; if (this.c !== q) this.err('Unterminated string'); this.i++ }
          else this.ident()
          this.ws()
          if (/[iIsS]/.test(this.c) && !isName(this.s[this.i + 1] ?? '')) { this.i++; this.ws() }
        }
        if (this.c !== ']') this.err('Expected "]"')
        this.i++
        parts.push({ kind: 'attribute', text: this.s.slice(p, this.i), name: n, pos: p })
      } else if (ch === ':') {
        const pe = this.s[this.i + 1] === ':'
        this.i += pe ? 2 : 1
        const n = this.ident().toLowerCase()
        const kind: Kind = pe || LEGACY_PE.has(n) ? 'pseudo-element' : 'pseudo-class'
        const simple: Simple = { kind, text: '', name: n, pos: p }
        if (this.c === '(') {
          this.i++
          const argStart = this.i
          if ((kind === 'pseudo-class' && SELECTOR_ARG.has(n)) || (kind === 'pseudo-element' && PE_SELECTOR_ARG.has(n))) {
            simple.args = this.list(n === 'has', n === 'is' || n === 'where' || n === 'matches')
          } else if (kind === 'pseudo-class' && NTH.has(n)) {
            const raw = this.balanced()
            const m = /\bof\b/i.exec(raw)
            if (m) { const sub = new P(raw.slice(m.index + 2)); simple.args = sub.list(); sub.ws(); if (sub.i < sub.s.length) sub.err('Unexpected text in "of" selector') }
            this.validateNth(m ? raw.slice(0, m.index) : raw, argStart)
          } else this.balanced()
          simple.argText = this.s.slice(argStart, this.i).trim()
          this.ws()
          if (this.s[this.i] !== ')') this.err('Expected ")"')
          this.i++
        }
        simple.text = this.s.slice(p, this.i)
        parts.push(simple)
      } else break
    }
    if (!parts.length) this.err(this.c ? `Unexpected "${this.c}"` : 'Expected a selector')
    const pes = parts.filter((x) => x.kind === 'pseudo-element')
    const typeIdx = parts.findIndex((x) => x.kind === 'type' || x.kind === 'universal')
    if (typeIdx > 0) this.err('Element names must come first in a compound selector')
    if (pes.length > 1 && !pes.every((x) => ['part', 'slotted'].includes(x.name) || x === pes[0] || ['hover', 'focus'].includes(x.name))) { /* allow ::before::marker etc. */ }
    return { parts }
  }

  validateNth(raw: string, at: number) {
    const t = raw.trim().toLowerCase().replace(/\s+/g, '')
    if (!/^(odd|even|[+-]?\d*n([+-]\d+)?|[+-]?\d+)$/.test(t)) throw new SelectorError(`Invalid An+B expression "${raw.trim()}"`, at)
  }
}

export function parseSelectorList(text: string): SelectorList {
  const p = new P(text)
  const list = p.list()
  p.ws()
  if (p.i < text.length) p.err(`Unexpected "${p.c}"`)
  return list
}

const add = (x: Spec, y: Spec): Spec => [x[0] + y[0], x[1] + y[1], x[2] + y[2]]
export const cmp = (x: Spec, y: Spec) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2]
const maxOf = (list: SelectorList | undefined): Spec => (list ?? []).map(specificity).reduce((m, s) => (cmp(s, m) > 0 ? s : m), [0, 0, 0] as Spec)

export interface Part { text: string; kind: Kind; spec: Spec; why: string }

/** Specificity of one simple selector, with an explanation. */
export function simpleSpec(s: Simple): { spec: Spec; why: string } {
  switch (s.kind) {
    case 'id': return { spec: [1, 0, 0], why: 'ID' }
    case 'class': return { spec: [0, 1, 0], why: 'class' }
    case 'attribute': return { spec: [0, 1, 0], why: 'attribute' }
    case 'type': return { spec: [0, 0, 1], why: 'type' }
    case 'universal': return { spec: [0, 0, 0], why: 'universal (no weight)' }
    case 'nesting': return { spec: [0, 0, 0], why: '& takes the specificity of the parent rule (not counted here)' }
    case 'pseudo-element':
      if (PE_SELECTOR_ARG.has(s.name)) return { spec: add([0, 0, 1], maxOf(s.args)), why: `pseudo-element + its argument` }
      return { spec: [0, 0, 1], why: LEGACY_PE.has(s.name) && !s.text.startsWith('::') ? 'legacy pseudo-element' : 'pseudo-element' }
    case 'pseudo-class':
      if (s.name === 'where') return { spec: [0, 0, 0], why: ':where() always adds zero' }
      if (['is', 'not', 'has', 'matches', '-webkit-any', '-moz-any'].includes(s.name)) return { spec: maxOf(s.args), why: `most specific argument of :${s.name}()` }
      if (NTH.has(s.name)) return { spec: add([0, 1, 0], maxOf(s.args)), why: s.args ? 'pseudo-class + most specific "of" selector' : 'pseudo-class' }
      if (s.name === 'host' || s.name === 'host-context') return { spec: add([0, 1, 0], maxOf(s.args)), why: `pseudo-class + argument` }
      return { spec: [0, 1, 0], why: 'pseudo-class' }
  }
}

export function specificity(c: Complex): Spec {
  return c.compounds.flatMap((x) => x.parts).reduce((acc, s) => add(acc, simpleSpec(s).spec), [0, 0, 0] as Spec)
}
export function breakdown(c: Complex): Part[] {
  return c.compounds.flatMap((x) => x.parts).map((s) => ({ text: s.text, kind: s.kind, ...simpleSpec(s) }))
}

/** Selectors of every style rule in a stylesheet (descends into @media/@supports/@layer/@container and nested rules). */
export function extractSelectors(css: string): { selector: string; line: number; context: string }[] {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  const out: { selector: string; line: number; context: string }[] = []
  const lineAt = (i: number) => src.slice(0, i).split('\n').length
  const walk = (from: number, to: number, ctx: string) => {
    let i = from, start = from
    while (i < to) {
      const ch = src[i]
      if (ch === '"' || ch === "'") { const q = ch; i++; while (i < to && src[i] !== q) i += src[i] === '\\' ? 2 : 1; i++; continue }
      if (ch === ';') { start = i + 1; i++; continue }
      if (ch === '}') { start = i + 1; i++; continue }
      if (ch === '{') {
        // find matching brace
        let depth = 1, j = i + 1
        while (j < to && depth) { const c2 = src[j]; if (c2 === '"' || c2 === "'") { const q = c2; j++; while (j < to && src[j] !== q) j += src[j] === '\\' ? 2 : 1 } else if (c2 === '{') depth++; else if (c2 === '}') depth--; j++ }
        const prelude = src.slice(start, i).trim()
        if (prelude.startsWith('@')) {
          const name = /^@([\w-]+)/.exec(prelude)?.[1] ?? ''
          if (['media', 'supports', 'layer', 'container', 'scope', 'document', 'starting-style'].includes(name)) walk(i + 1, j - 1, (ctx ? ctx + ' › ' : '') + prelude)
        } else if (prelude && !/^(from|to|\d+(\.\d+)?%)(\s*,\s*(from|to|\d+(\.\d+)?%))*$/i.test(prelude)) {
          for (const sel of splitList(prelude)) out.push({ selector: sel, line: lineAt(start + src.slice(start, i).search(/\S/)), context: ctx })
          walk(i + 1, j - 1, (ctx ? ctx + ' › ' : '') + prelude) // CSS nesting
        }
        i = j
        start = j
        continue
      }
      i++
    }
  }
  walk(0, src.length, '')
  return out
}

/** Splits a selector list at top-level commas. */
export function splitList(s: string): string[] {
  const out: string[] = []
  let depth = 0, cur = '', q = ''
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (q) { cur += ch; if (ch === '\\') { cur += s[++i] ?? '' } else if (ch === q) q = ''; continue }
    if (ch === '"' || ch === "'") q = ch
    if (ch === '\\') { cur += ch + (s[++i] ?? ''); continue }
    if (ch === '(' || ch === '[') depth++
    if (ch === ')' || ch === ']') depth--
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue }
    cur += ch
  }
  if (cur.trim()) out.push(cur.trim())
  return out
}

export const fmtSpec = (s: Spec) => `${s[0]},${s[1]},${s[2]}`
/** Single sortable number for charts (assumes each column < 100). */
export const score = (s: Spec) => s[0] * 10000 + s[1] * 100 + s[2]
