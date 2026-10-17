// Safe math-expression compiler (no eval): numbers, variables, functions, ^, implicit multiplication.

type Fn = (v: Record<string, number>) => number

const FUNCS: Record<string, (...a: number[]) => number> = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan,
  sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh, exp: Math.exp, ln: Math.log, log: Math.log, log10: Math.log10, log2: Math.log2,
  sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs, floor: Math.floor, ceil: Math.ceil, round: Math.round, sign: Math.sign,
  min: Math.min, max: Math.max, pow: Math.pow, atan2: Math.atan2, hypot: Math.hypot, sec: (x) => 1 / Math.cos(x), csc: (x) => 1 / Math.sin(x),
  cot: (x) => 1 / Math.tan(x), sinc: (x) => (x === 0 ? 1 : Math.sin(x) / x), mod: (a, b) => ((a % b) + b) % b,
}
const CONSTS: Record<string, number> = { pi: Math.PI, e: Math.E, tau: Math.PI * 2, phi: (1 + Math.sqrt(5)) / 2 }

type Tok = { t: 'num'; v: number } | { t: 'id'; v: string } | { t: 'op'; v: string }

function tokenize(src: string): Tok[] {
  const out: Tok[] = []
  let i = 0
  while (i < src.length) {
    const c = src[i]
    if (/\s/.test(c)) { i++; continue }
    const num = /^(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?/.exec(src.slice(i))
    if (num) { out.push({ t: 'num', v: parseFloat(num[0]) }); i += num[0].length; continue }
    const id = /^[A-Za-z_][A-Za-z_0-9]*/.exec(src.slice(i))
    if (id) { out.push({ t: 'id', v: id[0].toLowerCase() }); i += id[0].length; continue }
    if (src.startsWith('**', i)) { out.push({ t: 'op', v: '^' }); i += 2; continue }
    if ('+-*/^%(),'.includes(c)) { out.push({ t: 'op', v: c }); i++; continue }
    throw new Error(`Unexpected character "${c}"`)
  }
  // implicit multiplication: 2x, 2(…), )(, )x, x(…) when x is not a function
  const res: Tok[] = []
  for (let k = 0; k < out.length; k++) {
    const a = out[k - 1], b = out[k]
    if (a && b) {
      const aEnd = a.t === 'num' || (a.t === 'id' && !(a.v in FUNCS)) || (a.t === 'op' && a.v === ')')
      const bStart = b.t === 'num' || b.t === 'id' || (b.t === 'op' && b.v === '(')
      if (aEnd && bStart && !(a.t === 'num' && b.t === 'num')) res.push({ t: 'op', v: '*' })
    }
    res.push(b)
  }
  return res
}

/** Compiles an expression in the given variables into a fast closure. */
export function compile(src: string, vars: string[] = ['x', 'y']): Fn {
  const toks = tokenize(src)
  let p = 0
  const peek = () => toks[p]
  const isOp = (v: string) => peek()?.t === 'op' && peek().v === v
  const expect = (v: string) => { if (!isOp(v)) throw new Error(`Expected "${v}"`); p++ }

  const expr = (): Fn => {
    let l = term()
    while (isOp('+') || isOp('-')) {
      const op = toks[p++].v, a = l, b = term()
      l = op === '+' ? (s) => a(s) + b(s) : (s) => a(s) - b(s)
    }
    return l
  }
  const term = (): Fn => {
    let l = unary()
    while (isOp('*') || isOp('/') || isOp('%')) {
      const op = toks[p++].v, a = l, b = unary()
      l = op === '*' ? (s) => a(s) * b(s) : op === '/' ? (s) => a(s) / b(s) : (s) => a(s) % b(s)
    }
    return l
  }
  const unary = (): Fn => {
    if (isOp('-')) { p++; const a = unary(); return (s) => -a(s) }
    if (isOp('+')) { p++; return unary() }
    return power()
  }
  const power = (): Fn => {
    const base = atom()
    if (isOp('^')) { p++; const ex = unary(); return (s) => Math.pow(base(s), ex(s)) } // right-assoc, binds tighter than unary minus on the left
    return base
  }
  const atom = (): Fn => {
    const t = toks[p++]
    if (!t) throw new Error('Unexpected end of expression')
    if (t.t === 'num') { const v = t.v; return () => v }
    if (t.t === 'op' && t.v === '(') { const e = expr(); expect(')'); return e }
    if (t.t === 'id') {
      if (t.v in FUNCS) {
        const f = FUNCS[t.v]
        expect('(')
        const args: Fn[] = [expr()]
        while (isOp(',')) { p++; args.push(expr()) }
        expect(')')
        if (args.length === 1) { const a = args[0]; return (s) => f(a(s)) }
        return (s) => f(...args.map((a) => a(s)))
      }
      if (vars.includes(t.v)) { const n = t.v; return (s) => s[n] }
      if (t.v in CONSTS) { const v = CONSTS[t.v]; return () => v }
      throw new Error(`Unknown name "${t.v}"`)
    }
    throw new Error(`Unexpected "${t.v}"`)
  }
  const f = expr()
  if (p < toks.length) throw new Error(`Unexpected "${(toks[p] as { v: unknown }).v}"`)
  return f
}

export interface Grid { n: number; xs: number[]; ys: number[]; z: Float64Array; min: number; max: number; bad: number }

export function sample(f: Fn, x0: number, x1: number, y0: number, y1: number, n: number, t = 0): Grid {
  const xs = Array.from({ length: n }, (_, i) => x0 + ((x1 - x0) * i) / (n - 1))
  const ys = Array.from({ length: n }, (_, j) => y0 + ((y1 - y0) * j) / (n - 1))
  const z = new Float64Array(n * n)
  let min = Infinity, max = -Infinity, bad = 0
  const sc: Record<string, number> = { x: 0, y: 0, t }
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    sc.x = xs[i]; sc.y = ys[j]
    const v = f(sc)
    z[j * n + i] = v
    if (Number.isFinite(v)) { if (v < min) min = v; if (v > max) max = v } else bad++
  }
  return { n, xs, ys, z, min, max, bad }
}
