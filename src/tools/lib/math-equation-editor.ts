// A small LaTeX-math typesetter: parses a practical subset of LaTeX and lays it out as SVG
// (fractions, scripts, roots, big operators, \left…\right, matrices/cases, accents, Greek, symbols).

export type Cls = 'ord' | 'bin' | 'rel' | 'op' | 'open' | 'close' | 'punct'
type Font = 'it' | 'rm' | 'bf'

export type Node =
  | { t: 'sym'; v: string; cls: Cls; font: Font }
  | { t: 'group'; body: Node[] }
  | { t: 'scripts'; base: Node; sup?: Node; sub?: Node }
  | { t: 'frac'; num: Node[]; den: Node[]; bar: boolean; force?: 'd' | 't' }
  | { t: 'sqrt'; body: Node[]; index?: Node[] }
  | { t: 'bigop'; v: string; limits: boolean; text?: boolean }
  | { t: 'lr'; left: string; right: string; body: Node[] }
  | { t: 'accent'; acc: string; body: Node[] }
  | { t: 'space'; em: number }
  | { t: 'matrix'; env: string; rows: Node[][][] }
  | { t: 'error'; v: string }
  | { t: 'newline' }

const GREEK: Record<string, string> = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ϵ', varepsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ', vartheta: 'ϑ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν',
  xi: 'ξ', pi: 'π', varpi: 'ϖ', rho: 'ρ', varrho: 'ϱ', sigma: 'σ', varsigma: 'ς', tau: 'τ', upsilon: 'υ', phi: 'ϕ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
  Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Upsilon: 'Υ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
}
const SYMS: Record<string, [string, Cls]> = {
  times: ['×', 'bin'], cdot: ['·', 'bin'], pm: ['±', 'bin'], mp: ['∓', 'bin'], div: ['÷', 'bin'], ast: ['∗', 'bin'], star: ['⋆', 'bin'], circ: ['∘', 'bin'], bullet: ['∙', 'bin'],
  cup: ['∪', 'bin'], cap: ['∩', 'bin'], setminus: ['∖', 'bin'], oplus: ['⊕', 'bin'], otimes: ['⊗', 'bin'], wedge: ['∧', 'bin'], vee: ['∨', 'bin'], land: ['∧', 'bin'], lor: ['∨', 'bin'],
  leq: ['≤', 'rel'], le: ['≤', 'rel'], geq: ['≥', 'rel'], ge: ['≥', 'rel'], neq: ['≠', 'rel'], ne: ['≠', 'rel'], approx: ['≈', 'rel'], equiv: ['≡', 'rel'], sim: ['∼', 'rel'], simeq: ['≃', 'rel'],
  cong: ['≅', 'rel'], propto: ['∝', 'rel'], ll: ['≪', 'rel'], gg: ['≫', 'rel'], in: ['∈', 'rel'], notin: ['∉', 'rel'], ni: ['∋', 'rel'], subset: ['⊂', 'rel'], supset: ['⊃', 'rel'],
  subseteq: ['⊆', 'rel'], supseteq: ['⊇', 'rel'], to: ['→', 'rel'], rightarrow: ['→', 'rel'], leftarrow: ['←', 'rel'], gets: ['←', 'rel'], leftrightarrow: ['↔', 'rel'], Rightarrow: ['⇒', 'rel'],
  Leftarrow: ['⇐', 'rel'], Leftrightarrow: ['⇔', 'rel'], implies: ['⟹', 'rel'], iff: ['⟺', 'rel'], mapsto: ['↦', 'rel'], perp: ['⊥', 'rel'], parallel: ['∥', 'rel'], mid: ['∣', 'rel'], vdash: ['⊢', 'rel'],
  uparrow: ['↑', 'rel'], downarrow: ['↓', 'rel'], coloneqq: ['≔', 'rel'],
  infty: ['∞', 'ord'], partial: ['∂', 'ord'], nabla: ['∇', 'ord'], forall: ['∀', 'ord'], exists: ['∃', 'ord'], nexists: ['∄', 'ord'], emptyset: ['∅', 'ord'], varnothing: ['∅', 'ord'], neg: ['¬', 'ord'],
  angle: ['∠', 'ord'], triangle: ['△', 'ord'], degree: ['°', 'ord'], prime: ['′', 'ord'], hbar: ['ℏ', 'ord'], ell: ['ℓ', 'ord'], Re: ['ℜ', 'ord'], Im: ['ℑ', 'ord'], aleph: ['ℵ', 'ord'], wp: ['℘', 'ord'],
  ldots: ['…', 'ord'], dots: ['…', 'ord'], cdots: ['⋯', 'ord'], vdots: ['⋮', 'ord'], ddots: ['⋱', 'ord'], therefore: ['∴', 'rel'], because: ['∵', 'rel'], top: ['⊤', 'ord'], bot: ['⊥', 'ord'],
  lbrace: ['{', 'open'], rbrace: ['}', 'close'], langle: ['⟨', 'open'], rangle: ['⟩', 'close'], lfloor: ['⌊', 'open'], rfloor: ['⌋', 'close'], lceil: ['⌈', 'open'], rceil: ['⌉', 'close'],
  '{': ['{', 'open'], '}': ['}', 'close'], '|': ['‖', 'ord'], '%': ['%', 'ord'], '$': ['$', 'ord'], '#': ['#', 'ord'], '&': ['&', 'ord'], _: ['_', 'ord'],
}
const FUNCS = new Set(['sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh', 'coth', 'log', 'ln', 'lg', 'exp', 'lim', 'max', 'min', 'sup', 'inf', 'det', 'gcd', 'deg', 'arg', 'dim', 'ker', 'Pr', 'liminf', 'limsup', 'mod', 'tr'])
const LIMFUNCS = new Set(['lim', 'max', 'min', 'sup', 'inf', 'det', 'gcd', 'Pr', 'liminf', 'limsup'])
const BIGOPS: Record<string, [string, boolean]> = { sum: ['∑', true], prod: ['∏', true], coprod: ['∐', true], int: ['∫', false], iint: ['∬', false], iiint: ['∭', false], oint: ['∮', false], bigcup: ['⋃', true], bigcap: ['⋂', true], bigoplus: ['⨁', true], bigotimes: ['⨂', true] }
const SPACES: Record<string, number> = { ',': 0.1667, ':': 0.2222, '>': 0.2222, ';': 0.2778, '!': -0.1667, quad: 1, qquad: 2, ' ': 0.25, enspace: 0.5 }
const ACCENTS = new Set(['hat', 'widehat', 'bar', 'overline', 'vec', 'dot', 'ddot', 'tilde', 'widetilde', 'underline', 'overrightarrow'])
const BB: Record<string, string> = { R: 'ℝ', N: 'ℕ', Z: 'ℤ', Q: 'ℚ', C: 'ℂ', P: 'ℙ', H: 'ℍ', E: '𝔼', F: '𝔽', K: '𝕂' }
const DELIMS: Record<string, string> = { '(': '(', ')': ')', '[': '[', ']': ']', '\\{': '{', '\\}': '}', '\\lbrace': '{', '\\rbrace': '}', '|': '|', '\\|': '‖', '\\vert': '|', '\\Vert': '‖', '.': '', '\\langle': '⟨', '\\rangle': '⟩', '<': '⟨', '>': '⟩', '\\lfloor': '⌊', '\\rfloor': '⌋', '\\lceil': '⌈', '\\rceil': '⌉' }

// ---------------- parser ----------------

export function parse(src: string): { nodes: Node[]; errors: string[] } {
  let i = 0
  const errors: string[] = []
  const ws = () => { while (i < src.length && /\s/.test(src[i])) i++ }
  const peekTok = (): string => {
    ws()
    if (i >= src.length) return ''
    if (src[i] === '\\') {
      const m = /^\\([A-Za-z]+|.)/.exec(src.slice(i))
      return m ? m[0] : '\\'
    }
    return src[i]
  }
  const nextTok = () => { const t = peekTok(); i += t.length; return t }
  const readRaw = (): string => {
    ws()
    if (src[i] !== '{') return nextTok()
    let depth = 0, s = ''
    for (; i < src.length; i++) {
      const c = src[i]
      if (c === '{') { if (depth++) s += c } else if (c === '}') { if (--depth === 0) { i++; break } s += c } else s += c
    }
    return s
  }
  const readDelim = (): string => {
    const t = nextTok()
    if (t in DELIMS) return DELIMS[t]
    errors.push(`Unknown delimiter "${t}"`)
    return ''
  }

  const parseList = (stops: string[]): Node[] => {
    const out: Node[] = []
    for (;;) {
      const t = peekTok()
      if (t === '' || stops.includes(t)) return out
      if (t === '}') { errors.push('Unmatched "}"'); i++; continue }
      const a = parseAtom()
      if (a) out.push(a)
    }
  }
  const parseArg = (): Node[] => {
    const t = peekTok()
    if (t === '{') {
      i++
      const b = parseList(['}'])
      if (peekTok() === '}') i++
      else errors.push('Missing "}"')
      return b
    }
    if (t === '') { errors.push('Missing argument'); return [] }
    const b = parseBase()
    return b ? [b] : []
  }
  const parseOptional = (): Node[] | undefined => {
    if (peekTok() !== '[') return undefined
    i++
    const b = parseList([']'])
    if (peekTok() === ']') i++
    return b
  }
  const wrap = (ns: Node[]): Node => (ns.length === 1 ? ns[0] : { t: 'group', body: ns })

  const parseAtom = (): Node | null => {
    let base = parseBase()
    if (!base) return null
    if (base.t === 'newline' || base.t === 'space') return base
    let sup: Node | undefined, sub: Node | undefined
    for (;;) {
      const t = peekTok()
      if (t === '^') { i++; sup = wrap(parseArg()) } else if (t === '_') { i++; sub = wrap(parseArg()) } else if (t === "'") {
        let n = 0
        while (peekTok() === "'") { i++; n++ }
        sup = { t: 'sym', v: '′'.repeat(n), cls: 'ord', font: 'rm' }
      } else break
    }
    if (sup || sub) base = { t: 'scripts', base, sup, sub }
    return base
  }

  const parseBase = (): Node | null => {
    const t = nextTok()
    if (t === '{') {
      const b = parseList(['}'])
      if (peekTok() === '}') i++
      else errors.push('Missing "}"')
      return { t: 'group', body: b }
    }
    if (t === '^' || t === '_') { errors.push(`"${t}" without a base`); return { t: 'group', body: [] } }
    if (t === '~') return { t: 'space', em: 0.333 }
    if (t.startsWith('\\')) return parseCommand(t.slice(1))
    if (/[A-Za-z]/.test(t)) return { t: 'sym', v: t, cls: 'ord', font: 'it' }
    if (/[0-9.]/.test(t)) {
      let s = t
      while (i < src.length && /[0-9.]/.test(src[i])) s += src[i++]
      return { t: 'sym', v: s, cls: 'ord', font: 'rm' }
    }
    const map: Record<string, [string, Cls]> = { '+': ['+', 'bin'], '-': ['−', 'bin'], '*': ['∗', 'bin'], '=': ['=', 'rel'], '<': ['<', 'rel'], '>': ['>', 'rel'], ':': [':', 'rel'], ',': [',', 'punct'], ';': [';', 'punct'], '(': ['(', 'open'], '[': ['[', 'open'], ')': [')', 'close'], ']': [']', 'close'], '!': ['!', 'close'], '|': ['|', 'ord'], '/': ['/', 'ord'], '?': ['?', 'close'] }
    const m = map[t] ?? [t, 'ord' as Cls]
    return { t: 'sym', v: m[0], cls: m[1], font: 'rm' }
  }

  const parseCommand = (c: string): Node | null => {
    if (c in GREEK) return { t: 'sym', v: GREEK[c], cls: 'ord', font: /^[A-Z]/.test(c) ? 'rm' : 'it' }
    if (c in SYMS) return { t: 'sym', v: SYMS[c][0], cls: SYMS[c][1], font: 'rm' }
    if (c in SPACES) return { t: 'space', em: SPACES[c] }
    if (FUNCS.has(c)) return { t: 'bigop', v: c, limits: LIMFUNCS.has(c), text: true }
    if (c in BIGOPS) return { t: 'bigop', v: BIGOPS[c][0], limits: BIGOPS[c][1] }
    if (c === '\\' || c === 'newline' || c === 'cr') return { t: 'newline' }
    if (c === 'frac' || c === 'dfrac' || c === 'tfrac' || c === 'cfrac') return { t: 'frac', num: parseArg(), den: parseArg(), bar: true, force: c === 'dfrac' || c === 'cfrac' ? 'd' : c === 'tfrac' ? 't' : undefined }
    if (c === 'binom' || c === 'dbinom' || c === 'tbinom') return { t: 'lr', left: '(', right: ')', body: [{ t: 'frac', num: parseArg(), den: parseArg(), bar: false }] }
    if (c === 'sqrt') { const index = parseOptional(); return { t: 'sqrt', index, body: parseArg() } }
    if (ACCENTS.has(c)) return { t: 'accent', acc: c.replace(/^wide/, '').replace('overrightarrow', 'vec'), body: parseArg() }
    if (c === 'text' || c === 'textrm' || c === 'mathrm' || c === 'operatorname' || c === 'textit' || c === 'mathit' || c === 'mathbf' || c === 'textbf' || c === 'boldsymbol' || c === 'mbox') {
      const font: Font = /bf|bold/.test(c) ? 'bf' : /it/.test(c) ? 'it' : 'rm'
      if (c.startsWith('text') || c === 'mbox') return { t: 'sym', v: readRaw(), cls: 'ord', font }
      if (c === 'operatorname') return { t: 'bigop', v: readRaw(), limits: false, text: true }
      const body = parseArg()
      const restyle = (n: Node): Node => (n.t === 'sym' ? { ...n, font } : n.t === 'group' ? { ...n, body: n.body.map(restyle) } : n)
      return { t: 'group', body: body.map(restyle) }
    }
    if (c === 'mathbb') {
      const raw = readRaw()
      return { t: 'sym', v: [...raw].map((ch) => BB[ch] ?? ch).join(''), cls: 'ord', font: 'rm' }
    }
    if (c === 'left') {
      const left = readDelim()
      const body = parseList(['\\right'])
      let right = ''
      if (peekTok() === '\\right') { i += 6; right = readDelim() } else errors.push('\\left without \\right')
      return { t: 'lr', left, right, body }
    }
    if (c === 'right') { errors.push('\\right without \\left'); readDelim(); return null }
    if (c === 'begin') {
      const env = readRaw()
      const rows: Node[][][] = [[]]
      for (;;) {
        const cell = parseList(['&', '\\\\', '\\end'])
        rows[rows.length - 1].push(cell)
        const t = nextTok()
        if (t === '&') continue
        if (t === '\\\\') { rows.push([]); continue }
        if (t === '\\end') { readRaw(); break }
        errors.push(`Missing \\end{${env}}`)
        break
      }
      if (rows.length > 1 && rows[rows.length - 1].every((c) => !c.length)) rows.pop()
      return { t: 'matrix', env, rows }
    }
    if (c === 'displaystyle' || c === 'textstyle' || c === 'limits' || c === 'nolimits' || c === 'big' || c === 'Big' || c === 'bigg' || c === 'Bigg') return null
    errors.push(`Unknown command \\${c}`)
    return { t: 'error', v: `\\${c}` }
  }

  const nodes = parseList([])
  return { nodes, errors }
}

// ---------------- layout ----------------

export const FONT = "'Latin Modern Math', 'STIX Two Math', 'Cambria Math', 'Times New Roman', Times, serif"
let ctx: CanvasRenderingContext2D | null | undefined
function measure(s: string, px: number, font: Font): number {
  if (ctx === undefined) {
    try { ctx = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null } catch { ctx = null }
  }
  if (ctx) {
    ctx.font = `${font === 'it' ? 'italic ' : ''}${font === 'bf' ? 'bold ' : ''}${px}px ${FONT}`
    return ctx.measureText(s).width
  }
  let w = 0
  for (const ch of s) w += /[A-Z]/.test(ch) ? 0.68 : /[a-z0-9]/.test(ch) ? 0.5 : /\s/.test(ch) ? 0.25 : 0.75
  return w * px
}

interface Box { w: number; a: number; d: number; draw: (x: number, y: number, o: string[]) => void; cls?: Cls; italic?: boolean }
type Style = 0 | 1 | 2 | 3
const SIZE = [1, 1, 0.7, 0.5]
const supStyle = (s: Style): Style => (s < 2 ? 2 : 3)
const fracStyle = (s: Style): Style => (s === 0 ? 1 : s === 1 ? 2 : 3)
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const f2 = (v: number) => Math.round(v * 100) / 100

export interface RenderOpts { size: number; color: string; display: boolean }

export function render(src: string, opts: RenderOpts): { svg: string; width: number; height: number; errors: string[] } {
  const { nodes, errors } = parse(src)
  const PX = opts.size
  const C = opts.color

  const text = (v: string, px: number, font: Font, cls: Cls = 'ord', color = C): Box => {
    const w = measure(v, px, font)
    return {
      w: w + (font === 'it' ? px * 0.03 : 0), a: px * 0.72, d: px * 0.22, cls, italic: font === 'it',
      draw: (x, y, o) => o.push(`<text x="${f2(x)}" y="${f2(y)}" font-size="${f2(px)}"${font === 'it' ? ' font-style="italic"' : ''}${font === 'bf' ? ' font-weight="bold"' : ''} fill="${color}">${esc(v)}</text>`),
    }
  }
  const line = (x1: number, y1: number, x2: number, y2: number, t: number) => `<line x1="${f2(x1)}" y1="${f2(y1)}" x2="${f2(x2)}" y2="${f2(y2)}" stroke="${C}" stroke-width="${f2(t)}"/>`
  const path = (d: string, t: number, fill = false) => `<path d="${d}" ${fill ? `fill="${C}"` : `fill="none" stroke="${C}" stroke-width="${f2(t)}" stroke-linecap="round" stroke-linejoin="round"`}/>`

  const hlist = (ns: Node[], st: Style): Box => {
    const em = PX * SIZE[st]
    const boxes = ns.map((n) => layout(n, st))
    // TeX-like inter-atom spacing
    const gaps: number[] = []
    let prev: Cls | undefined
    boxes.forEach((b, k) => {
      let cls = b.cls ?? 'ord'
      if (cls === 'bin' && (prev === undefined || prev === 'bin' || prev === 'rel' || prev === 'open' || prev === 'punct' || prev === 'op')) cls = 'ord'
      if (cls === 'bin' && k === boxes.length - 1) cls = 'ord'
      b.cls = cls
      let g = 0
      if (prev && st < 2) {
        if (cls === 'rel' || prev === 'rel') g = prev === 'rel' && cls === 'rel' ? 0 : prev === 'open' || cls === 'close' || cls === 'punct' ? 0 : 0.2778
        else if (cls === 'bin' || prev === 'bin') g = 0.2222
        else if (prev === 'punct') g = 0.1667
        else if (prev === 'op' && (cls === 'ord' || cls === 'open' || cls === 'op')) g = 0.1667
        else if (cls === 'op' && prev === 'ord') g = 0.1667
      } else if (prev === 'op' && cls === 'ord') g = 0.1667
      gaps.push(g * em)
      prev = cls
    })
    const w = boxes.reduce((s, b, k) => s + b.w + gaps[k], 0)
    return {
      w, a: Math.max(0, ...boxes.map((b) => b.a)), d: Math.max(0, ...boxes.map((b) => b.d)),
      cls: boxes.length === 1 ? boxes[0].cls : 'ord', italic: boxes[boxes.length - 1]?.italic,
      draw: (x, y, o) => { let cx = x; boxes.forEach((b, k) => { cx += gaps[k]; b.draw(cx, y, o); cx += b.w }) },
    }
  }

  const delim = (ch: string, half: number, axisY: (y: number) => number, em: number): Box => {
    if (!ch) return { w: em * 0.1, a: 0, d: 0, draw: () => {} }
    const h = half * 2
    if (h <= em * 1.25) {
      const b = text(ch, em, 'rm', 'open')
      return b
    }
    const w = Math.min(em * 0.7, em * 0.32 + h * 0.06)
    const t = Math.max(1, em * 0.06)
    return {
      w: w + em * 0.06, a: half + em * 0.25, d: half - em * 0.25, cls: 'open',
      draw: (x, y, o) => {
        const top = axisY(y) - half, bot = axisY(y) + half, mid = axisY(y)
        const L = x + w * 0.15, R = x + w * 0.85, M = x + w * 0.5
        const P: Record<string, string> = {
          '(': `M${R},${top}Q${x - w * 0.15},${mid} ${R},${bot}`,
          ')': `M${L},${top}Q${x + w * 1.15},${mid} ${L},${bot}`,
          '[': `M${R},${top}H${L + t}V${bot}H${R}`,
          ']': `M${L},${top}H${R - t}V${bot}H${L}`,
          '{': `M${R},${top}Q${M},${top} ${M},${top + h * 0.1}L${M},${mid - h * 0.08}Q${M},${mid} ${L},${mid}Q${M},${mid} ${M},${mid + h * 0.08}L${M},${bot - h * 0.1}Q${M},${bot} ${R},${bot}`,
          '}': `M${L},${top}Q${M},${top} ${M},${top + h * 0.1}L${M},${mid - h * 0.08}Q${M},${mid} ${R},${mid}Q${M},${mid} ${M},${mid + h * 0.08}L${M},${bot - h * 0.1}Q${M},${bot} ${L},${bot}`,
          '|': `M${M},${top}V${bot}`,
          '‖': `M${M - w * 0.18},${top}V${bot}M${M + w * 0.18},${top}V${bot}`,
          '⟨': `M${R},${top}L${L},${mid}L${R},${bot}`,
          '⟩': `M${L},${top}L${R},${mid}L${L},${bot}`,
          '⌊': `M${L + t},${top}V${bot}H${R}`, '⌋': `M${R - t},${top}V${bot}H${L}`, '⌈': `M${R},${top}H${L + t}V${bot}`, '⌉': `M${L},${top}H${R - t}V${bot}`,
        }
        o.push(path(P[ch] ?? `M${M},${top}V${bot}`, t))
      },
    }
  }

  const layout = (n: Node, st: Style): Box => {
    const em = PX * SIZE[st]
    const axis = em * 0.25
    switch (n.t) {
      case 'sym': return text(n.v, em, n.font, n.cls)
      case 'error': return text(n.v, em, 'rm', 'ord', '#dc2626')
      case 'newline': return { w: 0, a: 0, d: 0, draw: () => {} }
      case 'space': return { w: n.em * em, a: 0, d: 0, draw: () => {} }
      case 'group': { const b = hlist(n.body, st); return { ...b, cls: 'ord' } }
      case 'bigop': {
        if (n.text) return { ...text(n.v, em, 'rm', 'op'), cls: 'op' }
        const big = st === 0 ? (n.v === '∫' || n.v === '∬' || n.v === '∭' || n.v === '∮' ? 2.0 : 1.55) : 1.2
        const px = em * big
        const g = text(n.v, px, 'rm', 'op')
        const raise = axis - px * 0.3 // baseline offset that centres the glyph on the axis
        return { w: g.w + em * 0.08, a: px * 0.52 + axis, d: px * 0.48 - axis, cls: 'op', draw: (x, y, o) => g.draw(x + em * 0.04, y - raise, o) }
      }
      case 'scripts': {
        const base = layout(n.base, st)
        const ss = supStyle(st)
        const sem = PX * SIZE[ss]
        const sup = n.sup ? layout(n.sup, ss) : null
        const sub = n.sub ? layout(n.sub, ss) : null
        const op = n.base.t === 'bigop' ? n.base : null
        const isOp = !!op
        if (op && st === 0 && op.limits) {
          const w = Math.max(base.w, sup?.w ?? 0, sub?.w ?? 0)
          const gap = em * 0.12
          const a = base.a + (sup ? gap + sup.d + sup.a : 0), d = base.d + (sub ? gap + sub.a + sub.d : 0)
          return {
            w, a, d, cls: 'op',
            draw: (x, y, o) => {
              base.draw(x + (w - base.w) / 2, y, o)
              if (sup) sup.draw(x + (w - sup.w) / 2, y - base.a - gap - sup.d, o)
              if (sub) sub.draw(x + (w - sub.w) / 2, y + base.d + gap + sub.a, o)
            },
          }
        }
        let u = Math.max(em * 0.42, base.a - sem * 0.38)
        let v = Math.max(em * 0.2, base.d + sem * 0.05)
        if (isOp) { u = Math.max(u, base.a - sem * 0.5); v = Math.max(v, base.d - sem * 0.2) }
        if (sup && sub) {
          const clash = (sub.a - v) - (u - sup.d) + em * 0.1
          if (clash > 0) { u += clash / 2; v += clash / 2 }
        }
        const ic = base.italic ? em * 0.06 : 0
        const intShift = op && !op.limits && !op.text ? em * 0.12 : 0
        const w = base.w + Math.max(sup ? sup.w + ic + intShift : 0, sub ? sub.w : 0) + em * 0.04
        return {
          w, a: Math.max(base.a, sup ? u + sup.a : 0), d: Math.max(base.d, sub ? v + sub.d : 0), cls: base.cls,
          draw: (x, y, o) => {
            base.draw(x, y, o)
            if (sup) sup.draw(x + base.w + ic + intShift, y - u, o)
            if (sub) sub.draw(x + base.w - (isOp ? intShift * 0.5 : 0), y + v, o)
          },
        }
      }
      case 'frac': {
        const cs: Style = n.force === 'd' ? 1 : n.force === 't' ? 2 : fracStyle(st)
        const num = hlist(n.num, cs), den = hlist(n.den, cs)
        const t = n.bar ? Math.max(0.8, em * 0.05) : 0
        const gap = st === 0 || n.force === 'd' ? em * 0.16 : em * 0.1
        const w = Math.max(num.w, den.w) + em * 0.24
        const up = axis + t / 2 + gap + num.d
        const dn = den.a + gap + t / 2 - axis
        return {
          w: w + em * 0.1, a: up + num.a, d: dn + den.d, cls: 'ord',
          draw: (x, y, o) => {
            num.draw(x + em * 0.05 + (w - num.w) / 2, y - up, o)
            den.draw(x + em * 0.05 + (w - den.w) / 2, y + dn, o)
            if (n.bar) o.push(line(x + em * 0.05, y - axis, x + em * 0.05 + w, y - axis, t))
          },
        }
      }
      case 'sqrt': {
        const b = hlist(n.body, st === 0 ? 1 : st)
        const t = Math.max(0.8, em * 0.05)
        const gap = em * 0.14
        const h = b.a + b.d + gap
        const rw = em * 0.62
        const idx = n.index?.length ? hlist(n.index, 3) : null
        const pre = idx ? Math.max(0, idx.w - rw * 0.55) : 0
        return {
          w: pre + rw + b.w + em * 0.12, a: b.a + gap + t, d: b.d + em * 0.02, cls: 'ord',
          draw: (x, y, o) => {
            const top = y - b.a - gap, bot = y + b.d, x0 = x + pre
            o.push(path(`M${f2(x0)},${f2(bot - h * 0.42)}L${f2(x0 + rw * 0.2)},${f2(bot - h * 0.5)}L${f2(x0 + rw * 0.48)},${f2(bot)}L${f2(x0 + rw)},${f2(top)}H${f2(x0 + rw + b.w + em * 0.1)}`, t))
            b.draw(x0 + rw + em * 0.04, y, o)
            if (idx) idx.draw(x0 + rw * 0.52 - idx.w, bot - h * 0.55 - idx.d, o)
          },
        }
      }
      case 'lr': {
        const b = hlist(n.body, st)
        const half = Math.max(b.a - axis, b.d + axis) + em * 0.08
        const ay = (y: number) => y - axis
        const L = delim(n.left, half, ay, em), R = delim(n.right, half, ay, em)
        return {
          w: L.w + b.w + R.w, a: Math.max(b.a, L.a, R.a), d: Math.max(b.d, L.d, R.d), cls: 'ord',
          draw: (x, y, o) => { L.draw(x, y, o); b.draw(x + L.w, y, o); R.draw(x + L.w + b.w, y, o) },
        }
      }
      case 'accent': {
        const b = hlist(n.body, st)
        const t = Math.max(0.8, em * 0.05)
        const under = n.acc === 'underline'
        const extra = em * 0.28
        return {
          w: b.w, a: b.a + (under ? 0 : extra), d: b.d + (under ? extra * 0.6 : 0), cls: 'ord',
          draw: (x, y, o) => {
            b.draw(x, y, o)
            const top = y - b.a - em * 0.06
            const sk = b.italic ? em * 0.08 : 0
            const cx = x + b.w / 2 + sk
            const hw = Math.max(em * 0.18, Math.min(b.w / 2, em * (n.acc === 'overline' || n.acc === 'bar' || n.acc === 'vec' ? 99 : 0.4)))
            switch (n.acc) {
              case 'hat': o.push(path(`M${f2(cx - hw)},${f2(top)}L${f2(cx)},${f2(top - em * 0.16)}L${f2(cx + hw)},${f2(top)}`, t)); break
              case 'tilde': o.push(path(`M${f2(cx - hw)},${f2(top - em * 0.04)}Q${f2(cx - hw / 2)},${f2(top - em * 0.2)} ${f2(cx)},${f2(top - em * 0.1)}T${f2(cx + hw)},${f2(top - em * 0.14)}`, t)); break
              case 'bar': case 'overline': o.push(line(x + sk, top - em * 0.06, x + b.w + sk, top - em * 0.06, t)); break
              case 'vec': o.push(path(`M${f2(x + sk)},${f2(top - em * 0.1)}H${f2(x + b.w + sk)}M${f2(x + b.w + sk - em * 0.14)},${f2(top - em * 0.2)}L${f2(x + b.w + sk)},${f2(top - em * 0.1)}L${f2(x + b.w + sk - em * 0.14)},${f2(top)}`, t)); break
              case 'dot': o.push(`<circle cx="${f2(cx)}" cy="${f2(top - em * 0.1)}" r="${f2(em * 0.05)}" fill="${C}"/>`); break
              case 'ddot': o.push(`<circle cx="${f2(cx - em * 0.1)}" cy="${f2(top - em * 0.1)}" r="${f2(em * 0.05)}" fill="${C}"/><circle cx="${f2(cx + em * 0.1)}" cy="${f2(top - em * 0.1)}" r="${f2(em * 0.05)}" fill="${C}"/>`); break
              case 'underline': o.push(line(x, y + b.d + em * 0.08, x + b.w, y + b.d + em * 0.08, t)); break
            }
          },
        }
      }
      case 'matrix': {
        const cs: Style = st <= 1 ? 1 : 2
        const cells = n.rows.map((r) => r.map((c) => hlist(c, cs)))
        const ncol = Math.max(...cells.map((r) => r.length))
        const colW = Array.from({ length: ncol }, (_, j) => Math.max(0, ...cells.map((r) => r[j]?.w ?? 0)))
        const rowA = cells.map((r) => Math.max(em * 0.72, ...r.map((c) => c.a)))
        const rowD = cells.map((r) => Math.max(em * 0.22, ...r.map((c) => c.d)))
        const rgap = em * (n.env === 'cases' ? 0.3 : 0.25), cgap = em * (n.env === 'cases' ? 1 : n.env.startsWith('align') ? 0 : 0.9)
        const H = rowA.reduce((s, v, k) => s + v + rowD[k], 0) + rgap * (cells.length - 1)
        const W = colW.reduce((s, v) => s + v, 0) + cgap * (ncol - 1)
        const align = (j: number) => (n.env === 'cases' ? 'l' : n.env.startsWith('align') ? (j % 2 ? 'l' : 'r') : 'c')
        const body: Box = {
          w: W, a: H / 2 + axis, d: H / 2 - axis,
          draw: (x, y, o) => {
            let cy = y - axis - H / 2
            cells.forEach((r, i) => {
              cy += rowA[i]
              let cx = x
              for (let j = 0; j < ncol; j++) {
                const c = r[j]
                if (c) c.draw(cx + (align(j) === 'c' ? (colW[j] - c.w) / 2 : align(j) === 'r' ? colW[j] - c.w : 0), cy, o)
                cx += colW[j] + cgap
              }
              cy += rowD[i] + rgap
            })
          },
        }
        const D: Record<string, [string, string]> = { pmatrix: ['(', ')'], bmatrix: ['[', ']'], Bmatrix: ['{', '}'], vmatrix: ['|', '|'], Vmatrix: ['‖', '‖'], cases: ['{', ''] }
        const dl = D[n.env]
        if (!dl) return { ...body, w: body.w + em * 0.2, draw: (x, y, o) => body.draw(x + em * 0.1, y, o) }
        const half = H / 2 + em * 0.12
        const L = delim(dl[0], half, (y) => y - axis, em), R = delim(dl[1], half, (y) => y - axis, em)
        const pad = em * 0.12
        return {
          w: L.w + body.w + R.w + pad * 2, a: Math.max(body.a, L.a), d: Math.max(body.d, L.d), cls: 'ord',
          draw: (x, y, o) => { L.draw(x, y, o); body.draw(x + L.w + pad, y, o); R.draw(x + L.w + body.w + pad * 2, y, o) },
        }
      }
    }
  }

  // split top level into lines
  const lines: Node[][] = [[]]
  for (const nd of nodes) if (nd.t === 'newline') lines.push([]); else lines[lines.length - 1].push(nd)
  const st: Style = opts.display ? 0 : 1
  const boxes = lines.map((l) => hlist(l, st))
  const pad = PX * 0.25, lgap = PX * 0.45
  const W = Math.max(PX, ...boxes.map((b) => b.w)) + pad * 2
  const H = boxes.reduce((s, b) => s + b.a + b.d, 0) + lgap * (boxes.length - 1) + pad * 2
  const o: string[] = []
  let y = pad
  for (const b of boxes) {
    y += b.a
    b.draw(pad + (W - pad * 2 - b.w) / 2, y, o)
    y += b.d + lgap
  }
  const w = Math.ceil(W), h = Math.ceil(H)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family="${FONT.replace(/"/g, "'")}">${o.join('')}</svg>`
  return { svg, width: w, height: h, errors }
}
