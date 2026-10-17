// A self-contained LaTeX math subset: parser → AST → SVG layout (box model) and MathML.

// ---------------- symbols ----------------
type Cls = 'ord' | 'op' | 'bin' | 'rel' | 'open' | 'close' | 'punct'
const S: Record<string, [string, Cls]> = {}
const add = (cls: Cls, list: string) => {
  for (const pair of list.trim().split(/\s+/)) {
    const i = pair.indexOf(':')
    S[pair.slice(0, i)] = [pair.slice(i + 1), cls]
  }
}
add('ord', 'alpha:α beta:β gamma:γ delta:δ epsilon:ϵ varepsilon:ε zeta:ζ eta:η theta:θ vartheta:ϑ iota:ι kappa:κ lambda:λ mu:μ nu:ν xi:ξ pi:π varpi:ϖ rho:ρ varrho:ϱ sigma:σ varsigma:ς tau:τ upsilon:υ phi:ϕ varphi:φ chi:χ psi:ψ omega:ω')
add('ord', 'Gamma:Γ Delta:Δ Theta:Θ Lambda:Λ Xi:Ξ Pi:Π Sigma:Σ Upsilon:Υ Phi:Φ Psi:Ψ Omega:Ω')
add('ord', 'infty:∞ partial:∂ nabla:∇ hbar:ℏ ell:ℓ Re:ℜ Im:ℑ aleph:ℵ emptyset:∅ varnothing:∅ forall:∀ exists:∃ nexists:∄ neg:¬ lnot:¬ prime:′ angle:∠ triangle:△ top:⊤ bot:⊥ ldots:… cdots:⋯ vdots:⋮ ddots:⋱ dots:… degree:° circ:∘ star:⋆ dagger:† S:§ checkmark:✓ % backslash:∖ Box:□ clubsuit:♣ heartsuit:♡ spadesuit:♠ diamondsuit:♢ wp:℘ mho:℧ |:‖ #:# &:& $:$ %:% _:_')
add('bin', 'pm:± mp:∓ times:× div:÷ cdot:· ast:∗ bullet:∙ cap:∩ cup:∪ wedge:∧ land:∧ vee:∨ lor:∨ setminus:∖ oplus:⊕ ominus:⊖ otimes:⊗ oslash:⊘ odot:⊙ sqcup:⊔ sqcap:⊓ uplus:⊎ amalg:⨿ bigtriangleup:△ wr:≀')
add('rel', 'leq:≤ le:≤ geq:≥ ge:≥ neq:≠ ne:≠ approx:≈ equiv:≡ sim:∼ simeq:≃ cong:≅ propto:∝ ll:≪ gg:≫ subset:⊂ supset:⊃ subseteq:⊆ supseteq:⊇ nsubseteq:⊈ in:∈ notin:∉ ni:∋ perp:⊥ parallel:∥ mid:∣ nmid:∤ models:⊨ vdash:⊢ dashv:⊣ prec:≺ succ:≻ preceq:⪯ succeq:⪰ doteq:≐ asymp:≍ coloneqq:≔ leqslant:⩽ geqslant:⩾ lesssim:≲ gtrsim:≳')
add('rel', 'to:→ rightarrow:→ leftarrow:← gets:← leftrightarrow:↔ Rightarrow:⇒ Leftarrow:⇐ Leftrightarrow:⇔ iff:⟺ implies:⟹ impliedby:⟸ mapsto:↦ longrightarrow:⟶ longleftarrow:⟵ uparrow:↑ downarrow:↓ updownarrow:↕ nearrow:↗ searrow:↘ hookrightarrow:↪ rightleftharpoons:⇌ longmapsto:⟼')
add('open', 'langle:⟨ lfloor:⌊ lceil:⌈ lbrace:{ {:{ lvert:| lVert:‖')
add('close', 'rangle:⟩ rfloor:⌋ rceil:⌉ rbrace:} }:} rvert:| rVert:‖')
add('punct', 'colon:: ;:; ,:,')
// big operators: glyph, drawn shape, integral-like?
const BIGOPS: Record<string, [string, 'sum' | 'prod' | 'coprod' | 'int' | 'iint' | 'iiint' | 'oint' | 'cup' | 'cap' | 'oplus' | 'otimes' | 'vee' | 'wedge']> = {
  sum: ['∑', 'sum'], prod: ['∏', 'prod'], coprod: ['∐', 'coprod'], int: ['∫', 'int'], iint: ['∬', 'iint'], iiint: ['∭', 'iiint'], oint: ['∮', 'oint'],
  bigcup: ['⋃', 'cup'], bigcap: ['⋂', 'cap'], bigoplus: ['⨁', 'oplus'], bigotimes: ['⨂', 'otimes'], bigvee: ['⋁', 'vee'], bigwedge: ['⋀', 'wedge'],
}
const FUNCS_LIM = ['lim', 'liminf', 'limsup', 'max', 'min', 'sup', 'inf', 'det', 'gcd', 'Pr', 'argmax', 'argmin']
const FUNCS = ['sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh', 'coth', 'log', 'ln', 'lg', 'exp', 'ker', 'dim', 'deg', 'hom', 'arg', 'mod', 'bmod', 'Tr', 'tr', 'rank', 'sgn']
const ACCENTS: Record<string, [string, boolean]> = { hat: ['^', false], widehat: ['^', true], check: ['ˇ', false], tilde: ['~', false], widetilde: ['~', true], bar: ['¯', false], overline: ['¯', true], vec: ['→', false], overrightarrow: ['→', true], overleftarrow: ['←', true], dot: ['˙', false], ddot: ['¨', false], acute: ['´', false], grave: ['`', false], breve: ['˘', false] }
const SPACES: Record<string, number> = { ',': 3 / 18, ':': 4 / 18, '>': 4 / 18, ';': 5 / 18, '!': -3 / 18, ' ': 0.25, quad: 1, qquad: 2, enspace: 0.5, thinspace: 3 / 18 }
const FONTS = ['mathrm', 'mathbf', 'mathit', 'mathbb', 'mathcal', 'mathsf', 'mathtt', 'boldsymbol', 'mathfrak', 'textbf', 'textit', 'operatorname']
const ENVS = ['matrix', 'pmatrix', 'bmatrix', 'Bmatrix', 'vmatrix', 'Vmatrix', 'smallmatrix', 'cases', 'aligned', 'align', 'align*', 'gathered', 'gather', 'gather*', 'split', 'array']
const DELIMS: Record<string, string> = { '(': '(', ')': ')', '[': '[', ']': ']', '{': '{', '}': '}', '\\{': '{', '\\}': '}', '|': '|', '\\|': '‖', '\\vert': '|', '\\Vert': '‖', '\\lvert': '|', '\\rvert': '|', '\\lVert': '‖', '\\rVert': '‖', '\\langle': '⟨', '\\rangle': '⟩', '\\lfloor': '⌊', '\\rfloor': '⌋', '\\lceil': '⌈', '\\rceil': '⌉', '.': '', '/': '/', '\\lbrace': '{', '\\rbrace': '}' }
const BB: Record<string, string> = { R: 'ℝ', N: 'ℕ', Z: 'ℤ', Q: 'ℚ', C: 'ℂ', P: 'ℙ', H: 'ℍ', E: '𝔼' }
const CAL: Record<string, string> = { A: '𝒜', B: 'ℬ', C: '𝒞', D: '𝒟', E: 'ℰ', F: 'ℱ', G: '𝒢', H: 'ℋ', I: 'ℐ', J: '𝒥', K: '𝒦', L: 'ℒ', M: 'ℳ', N: '𝒩', O: '𝒪', P: '𝒫', Q: '𝒬', R: 'ℛ', S: '𝒮', T: '𝒯', U: '𝒰', V: '𝒱', W: '𝒲', X: '𝒳', Y: '𝒴', Z: '𝒵' }

/** Every command the editor can autocomplete, with an insertion snippet ($ = cursor). */
export const COMMANDS: [string, string][] = [
  ['frac', '\\frac{$}{}'], ['dfrac', '\\dfrac{$}{}'], ['tfrac', '\\tfrac{$}{}'], ['sqrt', '\\sqrt{$}'], ['binom', '\\binom{$}{}'],
  ['left', '\\left( $ \\right)'], ['right', '\\right)'], ['text', '\\text{$}'], ['color', '\\color{red}{$}'], ['boxed', '\\boxed{$}'],
  ['underline', '\\underline{$}'], ['underbrace', '\\underbrace{$}_{}'], ['overbrace', '\\overbrace{$}^{}'], ['limits', '\\limits'],
  ...ENVS.map((e): [string, string] => [`begin{${e}}`, e === 'cases' ? `\\begin{cases}\n  $ & \\text{if } \\\\\n  & \\text{otherwise}\n\\end{cases}` : e === 'array' ? `\\begin{array}{cc}\n  $ & \\\\\n\\end{array}` : `\\begin{${e}}\n  $ & \\\\\n  & \n\\end{${e}}`]),
  ['end', '\\end{$}'], ['begin', '\\begin{$}'],
  ...Object.keys(BIGOPS).map((k): [string, string] => [k, k === 'sum' || k === 'prod' ? `\\${k}_{$}^{}` : k.includes('int') ? `\\${k}_{$}^{}` : `\\${k}`]),
  ...Object.keys(ACCENTS).map((k): [string, string] => [k, `\\${k}{$}`]),
  ...FONTS.map((k): [string, string] => [k, `\\${k}{$}`]),
  ...FUNCS_LIM.map((k): [string, string] => [k, k === 'lim' ? '\\lim_{$ \\to }' : `\\${k}`]),
  ...FUNCS.map((k): [string, string] => [k, `\\${k}`]),
  ...Object.keys(S).filter((k) => /^[a-zA-Z]+$/.test(k)).map((k): [string, string] => [k, `\\${k}`]),
  ['quad', '\\quad'], ['qquad', '\\qquad'],
]
export const SYMBOL_OF = (name: string) => S[name]?.[0] ?? BIGOPS[name]?.[0] ?? ''

// ---------------- AST ----------------
export type Node =
  | { k: 'sym'; t: string; c: Cls; font?: string; pos: number }
  | { k: 'row'; c: Node[] }
  | { k: 'frac'; n: Node; d: Node; bar: boolean; st?: 'D' | 'T'; l?: string; r?: string }
  | { k: 'sqrt'; c: Node; idx?: Node }
  | { k: 'sc'; b: Node; sup?: Node; sub?: Node }
  | { k: 'bigop'; t: string; shape: string; limits: boolean; int: boolean }
  | { k: 'fn'; t: string; limits: boolean }
  | { k: 'lr'; l: string; r: string; c: Node }
  | { k: 'acc'; a: string; wide: boolean; c: Node; name: string }
  | { k: 'under'; t: 'line' | 'brace' | 'obrace'; c: Node }
  | { k: 'text'; t: string; font?: string }
  | { k: 'space'; w: number }
  | { k: 'env'; env: string; rows: Node[][]; cols?: string }
  | { k: 'color'; color: string; c: Node }
  | { k: 'box'; c: Node }

export class TexError extends Error {
  pos: number
  len: number
  constructor(msg: string, pos: number, len = 1) {
    super(msg)
    this.pos = pos
    this.len = len
  }
}

function lev(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  return d[a.length][b.length]
}
const KNOWN = () => [...new Set(COMMANDS.map(([c]) => c.replace(/\{.*/, '')))]

export function parse(src: string): Node {
  let i = 0
  const ws = () => {
    while (i < src.length) {
      if (/\s/.test(src[i])) i++
      else if (src[i] === '%') while (i < src.length && src[i] !== '\n') i++
      else break
    }
  }
  const peekCmd = (): string | null => {
    ws()
    if (src[i] !== '\\') return null
    const m = /^\\([a-zA-Z]+\*?|.)/.exec(src.slice(i))
    return m ? m[1] : '\\'
  }
  const readCmd = (): [string, number] => {
    const p = i
    const m = /^\\([a-zA-Z]+|.)/.exec(src.slice(i))
    if (!m) throw new TexError('Lone backslash at the end', i)
    i += m[0].length
    return [m[1], p]
  }
  const group = (what: string): Node => {
    ws()
    if (src[i] !== '{') {
      if (i >= src.length) throw new TexError(`${what} is missing an argument`, Math.max(0, i - 1))
      return atom(true)
    }
    const p = i++
    const r = row(['}'])
    if (src[i] !== '}') throw new TexError('Missing closing brace } for this {', p)
    i++
    return r
  }
  const rawGroup = (what: string): string => {
    ws()
    if (src[i] !== '{') throw new TexError(`${what} expects {…}`, i)
    const p = i
    let depth = 0
    for (; i < src.length; i++) {
      if (src[i] === '{') depth++
      else if (src[i] === '}' && --depth === 0) return src.slice(p + 1, i++)
    }
    throw new TexError('Missing closing brace }', p)
  }
  const delim = (after: string): string => {
    ws()
    const p = i
    if (src[i] === '\\') {
      const [c] = readCmd()
      const key = `\\${c}`
      if (key in DELIMS) return DELIMS[key]
      throw new TexError(`\\${c} is not a delimiter after ${after}`, p, c.length + 1)
    }
    const ch = src[i++]
    if (ch !== undefined && ch in DELIMS) return DELIMS[ch]
    throw new TexError(`Missing delimiter after ${after} (use ( [ \\{ | . etc.)`, p)
  }

  const scripts = (b: Node): Node => {
    let sup: Node | undefined, sub: Node | undefined
    for (;;) {
      ws()
      const c = src[i]
      if (c === '^' || c === '_') {
        const p = i++
        if (c === '^' && sup) throw new TexError('Double superscript: wrap in braces, e.g. {x^a}^b', p)
        if (c === '_' && sub) throw new TexError('Double subscript: wrap in braces', p)
        const g = group(c === '^' ? 'Superscript' : 'Subscript')
        if (c === '^') sup = g
        else sub = g
      } else if (c === "'") {
        let n = 0
        while (src[i] === "'") {
          i++
          n++
        }
        const pr: Node = { k: 'sym', t: '′'.repeat(n), c: 'ord', pos: i - n }
        sup = sup ? { k: 'row', c: [pr, sup] } : pr
      } else if (peekCmd() === 'limits' || peekCmd() === 'nolimits') {
        const [c2] = readCmd()
        if (b.k === 'bigop' || b.k === 'fn') b = { ...b, limits: c2 === 'limits' }
      } else break
    }
    return sup || sub ? { k: 'sc', b, sup, sub } : b
  }

  const env = (name: string, p: number): Node => {
    let cols: string | undefined
    if (name === 'array') cols = rawGroup('array').replace(/[^lcr]/g, '')
    const rows: Node[][] = [[]]
    for (;;) {
      const cell = row(['&', '\\\\', 'end'])
      rows[rows.length - 1].push(cell)
      ws()
      if (i >= src.length) throw new TexError(`\\begin{${name}} is never closed with \\end{${name}}`, p, 7 + name.length)
      if (src[i] === '&') i++
      else if (src.startsWith('\\\\', i)) {
        i += 2
        rows.push([])
      } else {
        const q = i
        readCmd()
        const e = rawGroup('\\end')
        if (e !== name) throw new TexError(`\\end{${e}} does not match \\begin{${name}}`, q, 6 + e.length)
        break
      }
    }
    if (rows.length > 1 && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0].k === 'row' && (rows[rows.length - 1][0] as { c: Node[] }).c.length === 0) rows.pop()
    return { k: 'env', env: name.replace('*', ''), rows, cols }
  }

  const atom = (single = false): Node => {
    ws()
    const p = i
    const ch = src[i]
    let base: Node
    if (ch === '{') {
      i++
      base = row(['}'])
      if (src[i] !== '}') throw new TexError('Missing closing brace } for this {', p)
      i++
    } else if (ch === '\\') {
      const [c] = readCmd()
      const cp = p
      if (c in SPACES) base = { k: 'space', w: SPACES[c] }
      else if (c === 'frac' || c === 'dfrac' || c === 'tfrac' || c === 'cfrac') base = { k: 'frac', n: group(`\\${c}`), d: group(`\\${c}`), bar: true, st: c === 'dfrac' || c === 'cfrac' ? 'D' : c === 'tfrac' ? 'T' : undefined }
      else if (c === 'binom' || c === 'dbinom' || c === 'tbinom') base = { k: 'frac', n: group('\\binom'), d: group('\\binom'), bar: false, l: '(', r: ')', st: c === 'dbinom' ? 'D' : c === 'tbinom' ? 'T' : undefined }
      else if (c === 'sqrt') {
        ws()
        let idx: Node | undefined
        if (src[i] === '[') {
          const q = i++
          idx = row([']'])
          if (src[i] !== ']') throw new TexError('Missing ] for the root index', q)
          i++
        }
        base = { k: 'sqrt', c: group('\\sqrt'), idx }
      } else if (c === 'left') {
        const l = delim('\\left')
        const inner = row(['right'])
        if (peekCmd() !== 'right') throw new TexError('\\left has no matching \\right', cp, 5)
        readCmd()
        base = { k: 'lr', l, r: delim('\\right'), c: inner }
      } else if (c === 'right') throw new TexError('\\right without a matching \\left', cp, 6)
      else if (c === 'middle') base = { k: 'sym', t: delim('\\middle') || '|', c: 'rel', pos: cp }
      else if (c === 'begin') {
        const name = rawGroup('\\begin')
        if (!ENVS.includes(name)) throw new TexError(`Unknown environment "${name}" (supported: ${ENVS.slice(0, 9).join(', ')}…)`, cp, 7 + name.length)
        base = env(name, cp)
      } else if (c === 'end') throw new TexError('\\end without a matching \\begin', cp, 4)
      else if (c === 'text' || c === 'textrm' || c === 'mbox' || c === 'textbf' || c === 'textit') base = { k: 'text', t: rawGroup(`\\${c}`), font: c === 'textbf' ? 'bf' : c === 'textit' ? 'it' : undefined }
      else if (c === 'color' || c === 'textcolor') {
        const col = rawGroup(`\\${c}`).trim()
        if (!/^(#[0-9a-fA-F]{3,8}|[a-zA-Z]+)$/.test(col)) throw new TexError(`"${col}" is not a colour name or #hex`, cp)
        base = { k: 'color', color: col, c: c === 'textcolor' || src.slice(i).trimStart().startsWith('{') ? group('\\color') : row(['}', '&', '\\\\', 'end', 'right']) }
      } else if (c === 'boxed' || c === 'fbox') base = { k: 'box', c: group(`\\${c}`) }
      else if (c === 'underline') base = { k: 'under', t: 'line', c: group('\\underline') }
      else if (c === 'underbrace') base = { k: 'under', t: 'brace', c: group('\\underbrace') }
      else if (c === 'overbrace') base = { k: 'under', t: 'obrace', c: group('\\overbrace') }
      else if (c in ACCENTS) base = { k: 'acc', a: ACCENTS[c][0], wide: ACCENTS[c][1], c: group(`\\${c}`), name: c }
      else if (FONTS.includes(c)) {
        if (c === 'operatorname') base = { k: 'fn', t: rawGroup('\\operatorname'), limits: false }
        else {
          const f = { mathrm: 'rm', mathbf: 'bf', mathit: 'it', mathbb: 'bb', mathcal: 'cal', mathsf: 'sf', mathtt: 'tt', boldsymbol: 'bf', mathfrak: 'rm', textbf: 'bf', textit: 'it' }[c]!
          const inner = group(`\\${c}`)
          const setFont = (n: Node): Node => (n.k === 'sym' ? { ...n, font: f } : n.k === 'row' ? { k: 'row', c: n.c.map(setFont) } : n.k === 'sc' ? { ...n, b: setFont(n.b) } : n)
          base = setFont(inner)
        }
      } else if (c in BIGOPS) base = { k: 'bigop', t: BIGOPS[c][0], shape: BIGOPS[c][1], limits: !BIGOPS[c][1].includes('int'), int: BIGOPS[c][1].includes('int') }
      else if (FUNCS_LIM.includes(c)) base = { k: 'fn', t: c === 'argmax' ? 'arg max' : c === 'argmin' ? 'arg min' : c === 'liminf' ? 'lim inf' : c === 'limsup' ? 'lim sup' : c, limits: true }
      else if (FUNCS.includes(c)) base = { k: 'fn', t: c === 'bmod' ? 'mod' : c, limits: false }
      else if (c in S) base = { k: 'sym', t: S[c][0], c: S[c][1], pos: cp }
      else {
        const best = KNOWN().map((k) => [k, lev(c, k)] as const).sort((a, b) => a[1] - b[1])[0]
        throw new TexError(`Unknown command \\${c}${best && best[1] <= 2 ? ` — did you mean \\${best[0]}?` : ''}`, cp, c.length + 1)
      }
    } else if (ch === '}') throw new TexError('Unexpected } with no matching {', p)
    else if (ch === '^' || ch === '_') {
      base = { k: 'row', c: [] }
      return scripts(base)
    } else if (ch === '&') throw new TexError('& is only allowed inside a matrix/aligned environment', p)
    else {
      i++
      // digits: one number token, including a decimal point
      if (/[0-9]/.test(ch)) {
        let j = i
        if (!single) while (j < src.length && /[0-9.]/.test(src[j]) && !(src[j] === '.' && !/[0-9]/.test(src[j + 1] ?? ''))) j++
        base = { k: 'sym', t: src.slice(p, j), c: 'ord', font: 'rm', pos: p }
        i = j
      } else {
        const cls: Cls = '+-*'.includes(ch) ? 'bin' : '=<>:'.includes(ch) ? 'rel' : '(['.includes(ch) ? 'open' : ')]'.includes(ch) ? 'close' : ',;'.includes(ch) ? 'punct' : 'ord'
        const t = ch === '-' ? '−' : ch === '*' ? '∗' : ch
        base = { k: 'sym', t, c: cls, font: /[a-zA-Z]/.test(ch) ? undefined : 'rm', pos: p }
      }
    }
    return single ? base : scripts(base)
  }

  const row = (stop: string[]): Node => {
    const c: Node[] = []
    for (;;) {
      ws()
      if (i >= src.length) break
      if (stop.includes('}') && src[i] === '}') break
      if (stop.includes(']') && src[i] === ']') break
      if (stop.includes('&') && src[i] === '&') break
      if (stop.includes('\\\\') && src.startsWith('\\\\', i)) break
      const pc = peekCmd()
      if (pc && stop.includes(pc)) break
      if (src.startsWith('\\\\', i)) throw new TexError('Line break \\\\ only works inside aligned/matrix/cases', i, 2)
      c.push(atom())
    }
    return c.length === 1 ? c[0] : { k: 'row', c }
  }

  const r = row([])
  if (i < src.length) throw new TexError('Unexpected input', i)
  // Top-level \\ → treat whole input as gathered lines.
  return r
}

/** Splits a multi-line input at top-level \\ into a gathered environment (convenience for display math). */
export function parseDisplay(src: string): Node {
  let depth = 0, envDepth = 0
  const parts: string[] = []
  let last = 0
  for (let i = 0; i < src.length; i++) {
    if (src[i] === '%') while (i < src.length && src[i] !== '\n') i++
    else if (src[i] === '{') depth++
    else if (src[i] === '}') depth--
    else if (src.startsWith('\\begin', i)) envDepth++
    else if (src.startsWith('\\end', i)) envDepth--
    else if (src.startsWith('\\\\', i) && depth === 0 && envDepth === 0) {
      parts.push(src.slice(last, i))
      last = i + 2
      i++
    } else if (src[i] === '\\') i++
  }
  if (!parts.length) return parse(src)
  parts.push(src.slice(last))
  // Parse each line, shifting error positions back to the original text.
  let off = 0
  const rows: Node[][] = []
  for (const p of parts) {
    try {
      rows.push([parse(p)])
    } catch (e) {
      if (e instanceof TexError) throw new TexError(e.message, e.pos + off, e.len)
      throw e
    }
    off += p.length + 2
  }
  return { k: 'env', env: 'gathered', rows }
}

// ---------------- layout ----------------
type St = 'D' | 'T' | 'S' | 'SS'
interface Box {
  w: number
  a: number
  d: number
  cls: Cls | 'inner' | 'none'
  draw: (x: number, y: number, o: string[]) => void
}
export type Measure = (text: string, px: number, italic: boolean, bold: boolean, font: string) => number
export interface RenderOpts {
  size?: number
  display?: boolean
  color?: string
  font?: string
  measure?: Measure
}
export const DEFAULT_FONT = "'STIX Two Math','Cambria Math','Latin Modern Math','Times New Roman',serif"
const approx: Measure = (t, px) => [...t].reduce((s, ch) => s + (/[mwMW]/.test(ch) ? 0.8 : /[il.,;:!|']/.test(ch) ? 0.3 : /[A-Z]/.test(ch) ? 0.68 : 0.52), 0) * px
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const scale = (s: St) => (s === 'S' ? 0.7 : s === 'SS' ? 0.5 : 1)
const supSt = (s: St): St => (s === 'D' || s === 'T' ? 'S' : 'SS')
const fracSt = (s: St): St => (s === 'D' ? 'T' : s === 'T' ? 'S' : 'SS')
const f2 = (n: number) => +n.toFixed(2)

export function render(node: Node, opts: RenderOpts = {}): { svg: string; w: number; h: number; baseline: number } {
  const F = opts.size ?? 32
  const font = opts.font ?? DEFAULT_FONT
  const measure = opts.measure ?? approx
  const colorStack = [opts.color ?? 'currentColor']
  const col = () => colorStack[colorStack.length - 1]
  const AX = 0.25 // math axis height (em)
  const RULE = 0.05

  const glyph = (t: string, s: St, italic: boolean, bold = false, cls: Cls | 'inner' = 'ord', ff = font): Box => {
    const px = F * scale(s)
    const w = measure(t, px, italic, bold, ff) + (italic ? px * 0.04 : 0)
    const tall = /[A-Zbdfhklt0-9()[\]{}|/∂∫∑∏θβδζξλ√ℝℕℤℚℂℏℓ∀∃⊤⊥‖⟨⟩⌊⌋⌈⌉′]/.test(t) || t.length > 1
    const desc = /[gjpqyβγζημξρφχψ()[\]{}|,;/⌊⌋⌈⌉]/.test(t)
    const c = col()
    return {
      w, a: (tall ? 0.72 : 0.47) * px, d: (desc ? 0.22 : 0.02) * px, cls,
      draw: (x, y, o) => o.push(`<text x="${f2(x)}" y="${f2(y)}" font-size="${f2(px)}"${italic ? ' font-style="italic"' : ''}${bold ? ' font-weight="bold"' : ''}${ff !== font ? ` font-family="${esc(ff)}"` : ''}${c !== 'currentColor' ? ` fill="${esc(c)}"` : ''}>${esc(t)}</text>`),
    }
  }
  const empty = (cls: Box['cls'] = 'ord'): Box => ({ w: 0, a: 0, d: 0, cls, draw: () => {} })
  const hpack = (bs: Box[], cls: Box['cls'] = 'ord'): Box => {
    let w = 0, a = 0, d = 0
    for (const b of bs) {
      w += b.w
      a = Math.max(a, b.a)
      d = Math.max(d, b.d)
    }
    return {
      w, a, d, cls,
      draw: (x, y, o) => {
        for (const b of bs) {
          b.draw(x, y, o)
          x += b.w
        }
      },
    }
  }
  const pathBox = (w: number, a: number, d: number, path: (x: number, y: number) => string, cls: Box['cls'] = 'ord', stroke = 0): Box => ({
    w, a, d, cls,
    draw: (x, y, o) => o.push(stroke ? `<path d="${path(x, y)}" fill="none" stroke="${esc(col())}" stroke-width="${f2(stroke)}" stroke-linecap="round" stroke-linejoin="round"/>` : `<path d="${path(x, y)}" fill="${esc(col())}"/>`),
  })
  const withColor = (b: Box, c: string): Box => ({ ...b, draw: (x, y, o) => { colorStack.push(c); b.draw(x, y, o); colorStack.pop() } })

  /** Stretchy delimiter of total height h centred on the axis. */
  const delimBox = (ch: string, a: number, d: number, s: St, cls: Cls): Box => {
    const px = F * scale(s)
    const ax = AX * px
    const half = Math.max(a - ax, d + ax, 0.5 * px) + 0.08 * px
    if (half <= 0.62 * px && ch !== '') {
      const g = glyph(ch, s, false, false, cls)
      return g
    }
    if (ch === '') return { ...empty(cls), a: half + ax, d: half - ax }
    const H = 2 * half
    const sw = Math.max(1, 0.055 * px * Math.min(1.6, Math.sqrt(H / px)))
    const w = (ch === '|' || ch === '‖' ? 0.3 : ch === '⟨' || ch === '⟩' ? 0.45 : 0.42) * px + Math.min(0.25 * px, H * 0.04)
    const top = (y: number) => y - ax - half, bot = (y: number) => y - ax + half, mid = (y: number) => y - ax
    const m = 0.1 * px
    const P: Record<string, (x: number, y: number) => string> = {
      '(': (x, y) => `M${f2(x + w - m)},${f2(top(y))} Q${f2(x + m - 0.05 * px)},${f2(mid(y))} ${f2(x + w - m)},${f2(bot(y))}`,
      ')': (x, y) => `M${f2(x + m)},${f2(top(y))} Q${f2(x + w - m + 0.05 * px)},${f2(mid(y))} ${f2(x + m)},${f2(bot(y))}`,
      '[': (x, y) => `M${f2(x + w - m)},${f2(top(y))} H${f2(x + m + 0.05 * px)} V${f2(bot(y))} H${f2(x + w - m)}`,
      ']': (x, y) => `M${f2(x + m)},${f2(top(y))} H${f2(x + w - m - 0.05 * px)} V${f2(bot(y))} H${f2(x + m)}`,
      '{': (x, y) => { const l = x + m, r = x + w - m, c = (l + r) / 2; return `M${f2(r)},${f2(top(y))} Q${f2(c)},${f2(top(y))} ${f2(c)},${f2(top(y) + 0.15 * H)} V${f2(mid(y) - 0.12 * H)} Q${f2(c)},${f2(mid(y))} ${f2(l)},${f2(mid(y))} Q${f2(c)},${f2(mid(y))} ${f2(c)},${f2(mid(y) + 0.12 * H)} V${f2(bot(y) - 0.15 * H)} Q${f2(c)},${f2(bot(y))} ${f2(r)},${f2(bot(y))}` },
      '}': (x, y) => { const l = x + m, r = x + w - m, c = (l + r) / 2; return `M${f2(l)},${f2(top(y))} Q${f2(c)},${f2(top(y))} ${f2(c)},${f2(top(y) + 0.15 * H)} V${f2(mid(y) - 0.12 * H)} Q${f2(c)},${f2(mid(y))} ${f2(r)},${f2(mid(y))} Q${f2(c)},${f2(mid(y))} ${f2(c)},${f2(mid(y) + 0.12 * H)} V${f2(bot(y) - 0.15 * H)} Q${f2(c)},${f2(bot(y))} ${f2(l)},${f2(bot(y))}` },
      '|': (x, y) => `M${f2(x + w / 2)},${f2(top(y))} V${f2(bot(y))}`,
      '‖': (x, y) => `M${f2(x + w / 2 - 0.07 * px)},${f2(top(y))} V${f2(bot(y))} M${f2(x + w / 2 + 0.07 * px)},${f2(top(y))} V${f2(bot(y))}`,
      '⟨': (x, y) => `M${f2(x + w - m)},${f2(top(y))} L${f2(x + m)},${f2(mid(y))} L${f2(x + w - m)},${f2(bot(y))}`,
      '⟩': (x, y) => `M${f2(x + m)},${f2(top(y))} L${f2(x + w - m)},${f2(mid(y))} L${f2(x + m)},${f2(bot(y))}`,
      '⌊': (x, y) => `M${f2(x + m + 0.05 * px)},${f2(top(y))} V${f2(bot(y))} H${f2(x + w - m)}`,
      '⌋': (x, y) => `M${f2(x + w - m - 0.05 * px)},${f2(top(y))} V${f2(bot(y))} H${f2(x + m)}`,
      '⌈': (x, y) => `M${f2(x + w - m)},${f2(top(y))} H${f2(x + m + 0.05 * px)} V${f2(bot(y))}`,
      '⌉': (x, y) => `M${f2(x + m)},${f2(top(y))} H${f2(x + w - m - 0.05 * px)} V${f2(bot(y))}`,
      '/': (x, y) => `M${f2(x + w - m)},${f2(top(y))} L${f2(x + m)},${f2(bot(y))}`,
    }
    const fn = P[ch] ?? P['|']
    return pathBox(w, half + ax, half - ax, fn, cls, sw)
  }

  /** Big operator glyphs drawn as paths so they scale and align independently of fonts. */
  const bigop = (shape: string, s: St): Box => {
    const px = F * scale(s)
    const big = s === 'D'
    const ax = AX * px
    if (shape.includes('int')) {
      const H = (big ? 2.2 : 1.45) * px, w1 = (big ? 0.55 : 0.42) * px
      const n = shape === 'iint' ? 2 : shape === 'iiint' ? 3 : 1
      const gap = 0.24 * px
      const W = w1 + (n - 1) * gap
      const sw = (big ? 0.075 : 0.06) * px
      return {
        w: W + 0.12 * px, a: H / 2 + ax, d: H / 2 - ax, cls: 'op',
        draw: (x, y, o) => {
          const top = y - ax - H / 2, bot = y - ax + H / 2
          for (let k = 0; k < n; k++) {
            const x0 = x + k * gap + 0.05 * px
            o.push(`<path d="M${f2(x0 + w1)},${f2(top + 0.12 * H)} C${f2(x0 + w1 - 0.02 * px)},${f2(top - 0.02 * H)} ${f2(x0 + 0.62 * w1)},${f2(top - 0.03 * H)} ${f2(x0 + 0.55 * w1)},${f2(top + 0.2 * H)} L${f2(x0 + 0.45 * w1)},${f2(bot - 0.2 * H)} C${f2(x0 + 0.38 * w1)},${f2(bot + 0.03 * H)} ${f2(x0 + 0.02 * px)},${f2(bot + 0.02 * H)} ${f2(x0)},${f2(bot - 0.12 * H)}" fill="none" stroke="${esc(col())}" stroke-width="${f2(sw)}" stroke-linecap="round"/>`)
          }
          if (shape === 'oint') o.push(`<ellipse cx="${f2(x + 0.05 * px + w1 / 2)}" cy="${f2(y - ax)}" rx="${f2(0.17 * px * (big ? 1.2 : 1))}" ry="${f2(0.2 * px * (big ? 1.2 : 1))}" fill="none" stroke="${esc(col())}" stroke-width="${f2(sw * 0.7)}"/>`)
        },
      }
    }
    const H = (big ? 1.45 : 1.05) * px, W = (big ? 1.25 : 0.95) * px
    const sw = (big ? 0.07 : 0.055) * px
    const paths: Record<string, (l: number, t: number) => string> = {
      sum: (l, t) => `M${f2(l + W)},${f2(t + 0.12 * H)} V${f2(t)} H${f2(l)} L${f2(l + 0.5 * W)},${f2(t + H / 2)} L${f2(l)},${f2(t + H)} H${f2(l + W)} V${f2(t + H - 0.12 * H)}`,
      prod: (l, t) => `M${f2(l)},${f2(t)} H${f2(l + W)} M${f2(l + 0.18 * W)},${f2(t)} V${f2(t + H)} M${f2(l + 0.82 * W)},${f2(t)} V${f2(t + H)} M${f2(l + 0.04 * W)},${f2(t + H)} H${f2(l + 0.32 * W)} M${f2(l + 0.68 * W)},${f2(t + H)} H${f2(l + 0.96 * W)}`,
      coprod: (l, t) => `M${f2(l)},${f2(t + H)} H${f2(l + W)} M${f2(l + 0.18 * W)},${f2(t)} V${f2(t + H)} M${f2(l + 0.82 * W)},${f2(t)} V${f2(t + H)} M${f2(l + 0.04 * W)},${f2(t)} H${f2(l + 0.32 * W)} M${f2(l + 0.68 * W)},${f2(t)} H${f2(l + 0.96 * W)}`,
      cup: (l, t) => `M${f2(l + 0.1 * W)},${f2(t)} V${f2(t + H - 0.4 * W)} A${f2(0.4 * W)},${f2(0.4 * W)} 0 0 0 ${f2(l + 0.9 * W)},${f2(t + H - 0.4 * W)} V${f2(t)}`,
      cap: (l, t) => `M${f2(l + 0.1 * W)},${f2(t + H)} V${f2(t + 0.4 * W)} A${f2(0.4 * W)},${f2(0.4 * W)} 0 0 1 ${f2(l + 0.9 * W)},${f2(t + 0.4 * W)} V${f2(t + H)}`,
      vee: (l, t) => `M${f2(l + 0.05 * W)},${f2(t)} L${f2(l + W / 2)},${f2(t + H)} L${f2(l + 0.95 * W)},${f2(t)}`,
      wedge: (l, t) => `M${f2(l + 0.05 * W)},${f2(t + H)} L${f2(l + W / 2)},${f2(t)} L${f2(l + 0.95 * W)},${f2(t + H)}`,
      oplus: (l, t) => `M${f2(l + W / 2)},${f2(t + H / 2 - W / 2)} V${f2(t + H / 2 + W / 2)} M${f2(l)},${f2(t + H / 2)} H${f2(l + W)}`,
      otimes: (l, t) => { const r = W / 2 / Math.SQRT2; return `M${f2(l + W / 2 - r)},${f2(t + H / 2 - r)} L${f2(l + W / 2 + r)},${f2(t + H / 2 + r)} M${f2(l + W / 2 + r)},${f2(t + H / 2 - r)} L${f2(l + W / 2 - r)},${f2(t + H / 2 + r)}` },
    }
    return {
      w: W + 0.2 * px, a: H / 2 + ax, d: H / 2 - ax, cls: 'op',
      draw: (x, y, o) => {
        const l = x + 0.1 * px, t = y - ax - H / 2
        o.push(`<path d="${paths[shape](l, t)}" fill="none" stroke="${esc(col())}" stroke-width="${f2(sw)}" stroke-linejoin="miter" stroke-linecap="butt"/>`)
        if (shape === 'oplus' || shape === 'otimes') o.push(`<circle cx="${f2(l + W / 2)}" cy="${f2(t + H / 2)}" r="${f2(W / 2)}" fill="none" stroke="${esc(col())}" stroke-width="${f2(sw)}"/>`)
      },
    }
  }

  const vstack = (base: Box, over: Box | null, under: Box | null, gap: number, cls: Box['cls']): Box => {
    const w = Math.max(base.w, over?.w ?? 0, under?.w ?? 0)
    const a = base.a + (over ? gap + over.d + over.a : 0)
    const d = base.d + (under ? gap + under.a + under.d : 0)
    return {
      w, a, d, cls,
      draw: (x, y, o) => {
        base.draw(x + (w - base.w) / 2, y, o)
        if (over) over.draw(x + (w - over.w) / 2, y - base.a - gap - over.d, o)
        if (under) under.draw(x + (w - under.w) / 2, y + base.d + gap + under.a, o)
      },
    }
  }

  const SPACE_TABLE: Record<string, number> = {
    'ord-op': 1, 'op-ord': 1, 'op-op': 1, 'close-op': 1, 'inner-op': 1,
    'ord-bin': 2, 'bin-ord': 2, 'bin-op': 2, 'bin-open': 2, 'close-bin': 2, 'bin-inner': 2, 'inner-bin': 2,
    'ord-rel': 3, 'rel-ord': 3, 'rel-op': 3, 'rel-open': 3, 'close-rel': 3, 'op-rel': 3, 'rel-inner': 3, 'inner-rel': 3,
    'punct-ord': 1, 'punct-op': 1, 'punct-rel': 1, 'punct-open': 1, 'punct-close': 1, 'punct-punct': 1, 'punct-inner': 1,
    'ord-inner': 1, 'inner-ord': 1, 'inner-inner': 1, 'inner-open': 1, 'close-inner': 1, 'op-inner': 1,
  }

  const lay = (n: Node, s: St): Box => {
    const px = F * scale(s)
    switch (n.k) {
      case 'sym': {
        const f = n.font
        let t = n.t
        if (f === 'bb') t = [...t].map((ch) => BB[ch] ?? ch).join('')
        if (f === 'cal') t = [...t].map((ch) => CAL[ch] ?? ch).join('')
        const italic = !f && (/^[a-zA-Z]$/.test(t) || /^[α-ωϵϑϕϱϖς]$/.test(t)) || f === 'it'
        const ff = f === 'sf' ? 'sans-serif' : f === 'tt' ? 'monospace' : font
        return glyph(t, s, italic, f === 'bf', n.c, ff)
      }
      case 'row': {
        const kids = n.c.map((c) => lay(c, s))
        // TeX rule: a binary operator after nothing/op/bin/rel/open/punct becomes ordinary
        for (let i = 0; i < kids.length; i++) {
          if (kids[i].cls !== 'bin') continue
          const prev = kids.slice(0, i).reverse().find((k) => k.cls !== 'none')?.cls
          const next = kids.slice(i + 1).find((k) => k.cls !== 'none')?.cls
          if (!prev || ['bin', 'op', 'rel', 'open', 'punct'].includes(prev) || !next || ['rel', 'close', 'punct'].includes(next)) kids[i] = { ...kids[i], cls: 'ord' }
        }
        const out: Box[] = []
        let prev: Box['cls'] | null = null
        for (const k of kids) {
          if (k.cls !== 'none') {
            if (prev) {
              const sp = SPACE_TABLE[`${prev}-${k.cls}`] ?? 0
              if (sp && (sp === 1 ? true : s === 'D' || s === 'T')) out.push({ ...empty('none'), w: ((sp + 2) / 18) * px })
            }
            prev = k.cls
          }
          out.push(k)
        }
        return hpack(out, kids.length === 1 ? kids[0].cls : 'ord')
      }
      case 'space':
        return { ...empty('none'), w: n.w * px }
      case 'text': {
        const g = glyph(n.t, s, n.font === 'it', n.font === 'bf', 'ord')
        return { ...g, a: Math.max(g.a, 0.72 * px), d: Math.max(g.d, 0.2 * px) }
      }
      case 'color': {
        colorStack.push(n.color)
        const b = lay(n.c, s)
        colorStack.pop()
        return withColor(b, n.color)
      }
      case 'frac': {
        const st: St = n.st ?? s
        const inner = fracSt(st)
        const num = lay(n.n, inner), den = lay(n.d, inner)
        const p2 = F * scale(st)
        const ax = AX * p2
        const gap = (st === 'D' ? 0.16 : 0.1) * p2
        const th = n.bar ? RULE * p2 : 0
        const pad = 0.12 * p2
        const w = Math.max(num.w, den.w) + 2 * pad
        const numShift = Math.max(ax + th / 2 + gap + num.d, (st === 'D' ? 0.68 : 0.42) * p2)
        const denShift = Math.max(den.a + gap + th / 2 - ax, (st === 'D' ? 0.68 : 0.35) * p2)
        let box: Box = {
          w, a: numShift + num.a, d: denShift + den.d, cls: 'inner',
          draw: (x, y, o) => {
            num.draw(x + (w - num.w) / 2, y - numShift, o)
            den.draw(x + (w - den.w) / 2, y + denShift, o)
            if (n.bar) o.push(`<rect x="${f2(x + pad * 0.4)}" y="${f2(y - ax - th / 2)}" width="${f2(w - pad * 0.8)}" height="${f2(Math.max(0.8, th))}" fill="${esc(col())}"/>`)
          },
        }
        if (n.l) box = hpack([delimBox(n.l, box.a, box.d, st, 'open'), box, delimBox(n.r ?? ')', box.a, box.d, st, 'close')], 'inner')
        return box
      }
      case 'sqrt': {
        const c = lay(n.c, s === 'D' ? 'T' : s)
        const gap = 0.14 * px
        const th = RULE * px
        const H = c.a + c.d + gap + th
        const sw = 0.4 * px + Math.min(0.3 * px, H * 0.08)
        const idx = n.idx ? lay(n.idx, 'SS') : null
        const lift = idx ? Math.max(0, idx.w - 0.45 * sw) : 0
        const total = lift + sw + c.w + 0.1 * px
        const a = c.a + gap + th + 0.04 * px
        return {
          w: total, a: Math.max(a, idx ? (H * 0.55 - c.d) + idx.a + idx.d : 0), d: c.d + 0.04 * px, cls: 'ord',
          draw: (x, y, o) => {
            const top = y - c.a - gap - th / 2, bot = y + c.d
            const x0 = x + lift
            o.push(`<path d="M${f2(x0)},${f2(bot - 0.42 * H)} L${f2(x0 + 0.18 * sw)},${f2(bot - 0.5 * H)} L${f2(x0 + 0.48 * sw)},${f2(bot)} L${f2(x0 + sw * 0.95)},${f2(top)} H${f2(x0 + sw + c.w + 0.05 * px)}" fill="none" stroke="${esc(col())}" stroke-width="${f2(Math.max(0.8, th))}" stroke-linejoin="round"/>`)
            c.draw(x0 + sw, y, o)
            idx?.draw(x0 + 0.38 * sw - idx.w, bot - 0.55 * H - idx.d, o)
          },
        }
      }
      case 'acc': {
        const c = lay(n.c, s)
        const isLine = n.a === '¯'
        const w = n.wide || isLine ? c.w : Math.max(c.w, 0.4 * px)
        const h = isLine ? RULE * px : n.a === '→' || n.a === '←' ? 0.2 * px : n.a === '^' || n.a === 'ˇ' ? (n.wide ? 0.22 : 0.16) * px : 0.12 * px
        const gap = 0.08 * px
        const narrow = !n.wide && !isLine
        const aw = narrow ? 0.38 * px : w
        // centre the accent over the glyph, nudged right for italic letters
        const skew = narrow && n.c.k === 'sym' && /^[a-zA-Zα-ω]$/.test(n.c.t) ? 0.06 * px : 0
        return {
          w: Math.max(c.w, narrow ? 0 : w), a: c.a + gap + h, d: c.d, cls: c.cls,
          draw: (x, y, o) => {
            c.draw(x, y, o)
            const l = x + (c.w - aw) / 2 + skew, r = l + aw, b = y - c.a - gap, t = b - h, m = (l + r) / 2
            const st = `fill="none" stroke="${esc(col())}" stroke-width="${f2(Math.max(0.8, 0.045 * px))}" stroke-linecap="round" stroke-linejoin="round"`
            const d =
              isLine ? `M${f2(l)},${f2(b - h / 2)} H${f2(r)}`
              : n.a === '^' ? `M${f2(l)},${f2(b)} L${f2(m)},${f2(t)} L${f2(r)},${f2(b)}`
              : n.a === 'ˇ' ? `M${f2(l)},${f2(t)} L${f2(m)},${f2(b)} L${f2(r)},${f2(t)}`
              : n.a === '~' ? `M${f2(l)},${f2(b - h * 0.2)} C${f2(l + aw * 0.3)},${f2(t - h * 0.3)} ${f2(l + aw * 0.6)},${f2(b + h * 0.3)} ${f2(r)},${f2(t + h * 0.2)}`
              : n.a === '→' ? `M${f2(l)},${f2(b - h / 2)} H${f2(r)} M${f2(r - 0.12 * px)},${f2(t)} L${f2(r)},${f2(b - h / 2)} L${f2(r - 0.12 * px)},${f2(b)}`
              : n.a === '←' ? `M${f2(r)},${f2(b - h / 2)} H${f2(l)} M${f2(l + 0.12 * px)},${f2(t)} L${f2(l)},${f2(b - h / 2)} L${f2(l + 0.12 * px)},${f2(b)}`
              : n.a === '´' ? `M${f2(m - 0.05 * px)},${f2(b)} L${f2(m + 0.08 * px)},${f2(t)}`
              : n.a === '`' ? `M${f2(m + 0.05 * px)},${f2(b)} L${f2(m - 0.08 * px)},${f2(t)}`
              : n.a === '˘' ? `M${f2(l + aw * 0.15)},${f2(t)} Q${f2(m)},${f2(b + h * 0.6)} ${f2(r - aw * 0.15)},${f2(t)}`
              : ''
            if (d) o.push(`<path d="${d}" ${st}/>`)
            if (n.a === '˙') o.push(`<circle cx="${f2(m)}" cy="${f2(b - h / 2)}" r="${f2(0.05 * px)}" fill="${esc(col())}"/>`)
            if (n.a === '¨') o.push(`<circle cx="${f2(m - 0.1 * px)}" cy="${f2(b - h / 2)}" r="${f2(0.05 * px)}" fill="${esc(col())}"/><circle cx="${f2(m + 0.1 * px)}" cy="${f2(b - h / 2)}" r="${f2(0.05 * px)}" fill="${esc(col())}"/>`)
          },
        }
      }
      case 'under': {
        const c = lay(n.c, s)
        if (n.t === 'line') {
          const g = 0.12 * px
          return { ...c, d: c.d + g + RULE * px, draw: (x, y, o) => { c.draw(x, y, o); o.push(`<rect x="${f2(x)}" y="${f2(y + c.d + g)}" width="${f2(c.w)}" height="${f2(Math.max(0.8, RULE * px))}" fill="${esc(col())}"/>`) } }
        }
        const bh = 0.28 * px, g = 0.1 * px
        const under = n.t === 'brace'
        const brace: Box = pathBox(c.w, under ? 0 : bh, under ? bh : 0, (x, y) => {
          const l = x, r = x + c.w, m = (l + r) / 2, y0 = under ? y : y, y1 = under ? y + bh : y - bh
          return `M${f2(l)},${f2(y0)} Q${f2(l)},${f2((y0 + y1) / 2)} ${f2(l + 0.15 * px)},${f2((y0 + y1) / 2)} H${f2(m - 0.15 * px)} Q${f2(m)},${f2((y0 + y1) / 2)} ${f2(m)},${f2(y1)} Q${f2(m)},${f2((y0 + y1) / 2)} ${f2(m + 0.15 * px)},${f2((y0 + y1) / 2)} H${f2(r - 0.15 * px)} Q${f2(r)},${f2((y0 + y1) / 2)} ${f2(r)},${f2(y0)}`
        }, 'ord', Math.max(0.8, 0.045 * px))
        return under ? vstack(c, null, brace, g, 'op') : vstack(c, brace, null, g, 'op')
      }
      case 'box': {
        const c = lay(n.c, s)
        const p = 0.2 * px
        return { w: c.w + 2 * p, a: c.a + p, d: c.d + p, cls: 'ord', draw: (x, y, o) => { o.push(`<rect x="${f2(x + 0.5)}" y="${f2(y - c.a - p)}" width="${f2(c.w + 2 * p - 1)}" height="${f2(c.a + c.d + 2 * p)}" fill="none" stroke="${esc(col())}" stroke-width="${f2(Math.max(0.8, RULE * px))}"/>`); c.draw(x + p, y, o) } }
      }
      case 'bigop':
        return bigop(n.shape, s)
      case 'fn': {
        const g = glyph(n.t, s, false, false, 'op')
        return g
      }
      case 'lr': {
        const c = lay(n.c, s)
        return hpack([delimBox(n.l, c.a, c.d, s, 'open'), c, delimBox(n.r, c.a, c.d, s, 'close')], 'inner')
      }
      case 'sc': {
        const b = lay(n.b, s)
        const ss = supSt(s)
        const sup = n.sup ? lay(n.sup, ss) : null
        const sub = n.sub ? lay(n.sub, ss) : null
        const limits = ((n.b.k === 'bigop' || n.b.k === 'fn') && n.b.limits && s === 'D') || (n.b.k === 'under' && n.b.t !== 'line')
        if (limits) return vstack(b, sup, sub, 0.12 * px, 'op')
        const isInt = n.b.k === 'bigop' && n.b.int
        let up = Math.max(0.42 * px, b.a - 0.3 * px * scale(ss) * 1.2, sup ? sup.d + 0.25 * px : 0)
        let dn = Math.max(0.2 * px, b.d, sub ? sub.a - 0.4 * px : 0)
        if (n.b.k === 'bigop') {
          up = Math.max(up, b.a - (sup?.a ?? 0) * 0.6)
          dn = Math.max(dn, b.d - (sub?.d ?? 0) * 0.2)
        }
        if (sup && sub) {
          const clash = 0.1 * px - (up - sup.d - (sub.a - dn))
          if (clash > 0) {
            up += clash / 2
            dn += clash / 2
          }
        }
        const italicKern = n.b.k === 'sym' && !n.b.font && /^[a-zA-Z]$/.test(n.b.t) ? 0.02 * px : 0
        const intKern = isInt ? -0.12 * px : 0
        const sw = Math.max(sup ? sup.w + italicKern : 0, sub ? sub.w + intKern * (isInt ? 1.6 : 0) : 0)
        const wSup = sup ? sup.w + italicKern : 0, wSub = sub ? sub.w : 0
        const subX = isInt ? intKern * 1.6 : 0
        return {
          w: b.w + Math.max(wSup, wSub + subX, sw) + 0.04 * px,
          a: Math.max(b.a, sup ? up + sup.a : 0), d: Math.max(b.d, sub ? dn + sub.d : 0), cls: b.cls === 'none' ? 'ord' : b.cls,
          draw: (x, y, o) => {
            b.draw(x, y, o)
            sup?.draw(x + b.w + italicKern, y - up, o)
            sub?.draw(x + b.w + subX, y + dn, o)
          },
        }
      }
      case 'env': {
        const e = n.env
        const cellSt: St = e === 'smallmatrix' ? 'S' : e === 'aligned' || e === 'align' || e === 'gathered' || e === 'gather' || e === 'split' ? 'D' : s === 'D' ? 'T' : s
        const cells = n.rows.map((r) => r.map((c) => lay(c, cellSt)))
        const ncol = Math.max(...cells.map((r) => r.length))
        const cw = Array.from({ length: ncol }, (_, j) => Math.max(0, ...cells.map((r) => r[j]?.w ?? 0)))
        const strut = { a: 0.72 * px, d: 0.28 * px }
        const ra = cells.map((r) => Math.max(strut.a, ...r.map((c) => c.a)))
        const rd = cells.map((r) => Math.max(strut.d, ...r.map((c) => c.d)))
        const rowGap = (e === 'smallmatrix' ? 0.1 : e === 'cases' ? 0.25 : 0.3) * px
        const isAlign = e === 'aligned' || e === 'align' || e === 'split'
        const align = (j: number): 'l' | 'c' | 'r' => (n.cols ? ((n.cols[j] ?? 'c') as 'l' | 'c' | 'r') : isAlign ? (j % 2 ? 'l' : 'r') : e === 'cases' ? 'l' : 'c')
        const colGap = (j: number) => (j === 0 ? 0 : isAlign ? (j % 2 ? 0 : 1.2 * px) : e === 'cases' ? 1 * px : e === 'smallmatrix' ? 0.4 * px : 0.9 * px)
        const xs: number[] = []
        let W = 0
        cw.forEach((w, j) => {
          W += colGap(j)
          xs.push(W)
          W += w
        })
        let H = 0
        const ys: number[] = []
        ra.forEach((a, i) => {
          if (i) H += rowGap
          H += a
          ys.push(H)
          H += rd[i]
        })
        const ax = AX * px
        const top = H / 2 + ax // grid centred on the math axis
        // In aligned, cells after & that start with a relation get the relation spacing.
        const grid: Box = {
          w: W, a: top, d: H - top, cls: 'inner',
          draw: (x, y, o) => {
            cells.forEach((r, i) =>
              r.forEach((c, j) => {
                const al = align(j)
                const cx = x + xs[j] + (al === 'l' ? 0 : al === 'r' ? cw[j] - c.w : (cw[j] - c.w) / 2)
                c.draw(cx, y - top + ys[i], o)
              }),
            )
          },
        }
        const pad = 0.1 * px
        const padded = (b: Box): Box => hpack([{ ...empty('none'), w: pad }, b, { ...empty('none'), w: pad }], 'inner')
        const fences: Record<string, [string, string]> = { pmatrix: ['(', ')'], bmatrix: ['[', ']'], Bmatrix: ['{', '}'], vmatrix: ['|', '|'], Vmatrix: ['‖', '‖'], cases: ['{', ''] }
        const fz = fences[e]
        if (!fz) return padded(grid)
        return hpack([delimBox(fz[0], grid.a, grid.d, 'D', 'open'), padded(grid), fz[1] ? delimBox(fz[1], grid.a, grid.d, 'D', 'close') : empty()], 'inner')
      }
    }
  }

  // aligned: cells after & that begin with a relation need leading thick space
  const fixAlign = (n: Node): Node => {
    if (n.k === 'env' && (n.env === 'aligned' || n.env === 'align' || n.env === 'split'))
      return { ...n, rows: n.rows.map((r) => r.map((c, j) => (j % 2 === 1 ? { k: 'row', c: [{ k: 'sym', t: '', c: 'ord', pos: -1 } as Node, ...(c.k === 'row' ? c.c : [c])].map(fixAlign) } : fixAlign(c)))) }
    if (n.k === 'row') return { ...n, c: n.c.map(fixAlign) }
    if (n.k === 'env') return { ...n, rows: n.rows.map((r) => r.map(fixAlign)) }
    if (n.k === 'lr' || n.k === 'color' || n.k === 'box' || n.k === 'acc' || n.k === 'under') return { ...n, c: fixAlign(n.c) }
    return n
  }
  const box = lay(fixAlign(node), opts.display === false ? 'T' : 'D')
  const m = 0.15 * F
  const W = Math.ceil(box.w + 2 * m), Hh = Math.ceil(box.a + box.d + 2 * m)
  const o: string[] = []
  box.draw(m, m + box.a, o)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${Hh}" viewBox="0 0 ${W} ${Hh}" font-family="${esc(font)}" fill="${esc(opts.color ?? 'currentColor')}">${o.join('')}</svg>`
  return { svg, w: W, h: Hh, baseline: m + box.a }
}

// ---------------- MathML ----------------
const mlEsc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
export function toMathML(node: Node, display = true): string {
  const m = (n: Node): string => {
    switch (n.k) {
      case 'sym': {
        if (!n.t) return ''
        let t = n.t
        if (n.font === 'bb') t = [...t].map((c) => BB[c] ?? c).join('')
        if (n.font === 'cal') t = [...t].map((c) => CAL[c] ?? c).join('')
        if (/^[0-9.]+$/.test(t)) return `<mn>${t}</mn>`
        if (n.c === 'ord' && !/^[∞∂∇…⋯⋮⋱′]+$/.test(t)) {
          const v = n.font === 'bf' ? ' mathvariant="bold"' : n.font === 'rm' && /^[a-zA-Z]$/.test(t) ? ' mathvariant="normal"' : ''
          return `<mi${v}>${mlEsc(t)}</mi>`
        }
        return `<mo>${mlEsc(t)}</mo>`
      }
      case 'row':
        return `<mrow>${n.c.map(m).join('')}</mrow>`
      case 'space':
        return `<mspace width="${+n.w.toFixed(3)}em"/>`
      case 'text':
        return `<mtext>${mlEsc(n.t)}</mtext>`
      case 'color':
        return `<mstyle mathcolor="${mlEsc(n.color)}">${m(n.c)}</mstyle>`
      case 'frac': {
        const f = `<mfrac${n.bar ? '' : ' linethickness="0"'}>${m(n.n)}${m(n.d)}</mfrac>`
        const st = n.st === 'D' ? `<mstyle displaystyle="true">${f}</mstyle>` : n.st === 'T' ? `<mstyle displaystyle="false">${f}</mstyle>` : f
        return n.l ? `<mrow><mo>${n.l}</mo>${st}<mo>${n.r}</mo></mrow>` : st
      }
      case 'sqrt':
        return n.idx ? `<mroot>${m(n.c)}${m(n.idx)}</mroot>` : `<msqrt>${m(n.c)}</msqrt>`
      case 'bigop':
        return `<mo${n.int ? '' : ' largeop="true"'}>${n.t}</mo>`
      case 'fn':
        return `<mi>${mlEsc(n.t)}</mi>`
      case 'lr':
        return `<mrow>${n.l ? `<mo fence="true" stretchy="true">${mlEsc(n.l)}</mo>` : ''}${m(n.c)}${n.r ? `<mo fence="true" stretchy="true">${mlEsc(n.r)}</mo>` : ''}</mrow>`
      case 'acc':
        return `<mover accent="true">${m(n.c)}<mo${n.wide ? ' stretchy="true"' : ''}>${n.a === '¯' ? '‾' : n.a === '^' ? 'ˆ' : n.a === '~' ? '˜' : n.a}</mo></mover>`
      case 'under':
        return n.t === 'line' ? `<munder>${m(n.c)}<mo>_</mo></munder>` : n.t === 'brace' ? `<munder>${m(n.c)}<mo stretchy="true">⏟</mo></munder>` : `<mover>${m(n.c)}<mo stretchy="true">⏞</mo></mover>`
      case 'box':
        return `<menclose notation="box">${m(n.c)}</menclose>`
      case 'sc': {
        const b = m(n.b)
        const lim = (n.b.k === 'bigop' || n.b.k === 'fn') && n.b.limits
        if (n.sup && n.sub) return lim ? `<munderover>${b}${m(n.sub)}${m(n.sup)}</munderover>` : `<msubsup>${b}${m(n.sub)}${m(n.sup)}</msubsup>`
        if (n.sup) return lim ? `<mover>${b}${m(n.sup)}</mover>` : `<msup>${b}${m(n.sup)}</msup>`
        return lim ? `<munder>${b}${m(n.sub!)}</munder>` : `<msub>${b}${m(n.sub!)}</msub>`
      }
      case 'env': {
        const isAlign = ['aligned', 'align', 'split'].includes(n.env)
        const ca = n.cols ? ` columnalign="${[...n.cols].map((c) => (c === 'l' ? 'left' : c === 'r' ? 'right' : 'center')).join(' ')}"` : isAlign ? ' columnalign="right left right left"' : n.env === 'cases' ? ' columnalign="left left"' : ''
        const t = `<mtable${ca}${isAlign ? ' columnspacing="0em 2em"' : ''}>${n.rows.map((r) => `<mtr>${r.map((c) => `<mtd>${m(c)}</mtd>`).join('')}</mtr>`).join('')}</mtable>`
        const f: Record<string, [string, string]> = { pmatrix: ['(', ')'], bmatrix: ['[', ']'], Bmatrix: ['{', '}'], vmatrix: ['|', '|'], Vmatrix: ['‖', '‖'], cases: ['{', ''] }
        return f[n.env] ? `<mrow><mo>${f[n.env][0]}</mo>${t}${f[n.env][1] ? `<mo>${f[n.env][1]}</mo>` : ''}</mrow>` : t
      }
    }
  }
  return `<math xmlns="http://www.w3.org/1998/Math/MathML"${display ? ' display="block"' : ''}>${m(node)}</math>`
}

/** 1-based line and column of a character offset. */
export function lineCol(src: string, pos: number): [number, number] {
  const before = src.slice(0, pos).split('\n')
  return [before.length, before[before.length - 1].length + 1]
}
