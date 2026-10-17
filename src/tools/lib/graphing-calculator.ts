// Math expression compiler (implicit multiplication, functions, constants, parameters),
// adaptive curve sampling with discontinuity detection, and root / intersection / extremum finding.

export type Env = Record<string, number>
export type Fn = (env: Env) => number

const fact = (n: number) => {
  if (n < 0 || !Number.isInteger(n)) return gamma(n + 1)
  if (n > 170) return Infinity
  let r = 1
  for (let i = 2; i <= n; i++) r *= i
  return r
}
// Lanczos approximation
function gamma(z: number): number {
  if (z < 0.5) return Math.PI / (Math.sin(Math.PI * z) * gamma(1 - z))
  const g = 7
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7]
  z -= 1
  let x = c[0]
  for (let i = 1; i < g + 2; i++) x += c[i] / (z + i)
  const t = z + g + 0.5
  return Math.sqrt(2 * Math.PI) * t ** (z + 0.5) * Math.exp(-t) * x
}

export const FUNCS: Record<string, (...a: number[]) => number> = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan,
  sec: (x) => 1 / Math.cos(x), csc: (x) => 1 / Math.sin(x), cot: (x) => 1 / Math.tan(x),
  sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh, asinh: Math.asinh, acosh: Math.acosh, atanh: Math.atanh,
  sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs, exp: Math.exp, ln: Math.log, log: (x, b) => (b === undefined ? Math.log10(x) : Math.log(x) / Math.log(b)),
  log2: Math.log2, log10: Math.log10, floor: Math.floor, ceil: Math.ceil, round: Math.round, sign: Math.sign,
  min: Math.min, max: Math.max, pow: Math.pow, mod: (a, b) => ((a % b) + b) % b, gamma, atan2: Math.atan2,
  hypot: Math.hypot,
}
export const CONSTS: Record<string, number> = { pi: Math.PI, π: Math.PI, e: Math.E, tau: 2 * Math.PI, phi: (1 + Math.sqrt(5)) / 2 }

type Tok = { t: 'num'; v: number } | { t: 'id'; v: string } | { t: 'op'; v: string }

function tokenize(src: string, vars: string[]): Tok[] {
  const known = [...Object.keys(FUNCS), ...Object.keys(CONSTS), ...vars].sort((a, b) => b.length - a.length)
  const out: Tok[] = []
  let i = 0
  while (i < src.length) {
    const c = src[i]
    if (/\s/.test(c)) {
      i++
      continue
    }
    const num = /^(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/.exec(src.slice(i))
    if (num) {
      out.push({ t: 'num', v: Number(num[0]) })
      i += num[0].length
      continue
    }
    const id = /^[a-zA-Zπ_][a-zA-Z0-9_]*/.exec(src.slice(i))
    if (id) {
      // split runs like "ax" or "xsin" into known names
      let w = id[0]
      while (w) {
        const k = known.find((n) => w.startsWith(n))
        if (!k) throw new Error(`Unknown name "${w}"`)
        out.push({ t: 'id', v: k })
        w = w.slice(k.length)
      }
      i += id[0].length
      continue
    }
    if ('+-*/^(),!|'.includes(c)) {
      out.push({ t: 'op', v: c })
      i++
      continue
    }
    if (c === '·' || c === '×') {
      out.push({ t: 'op', v: '*' })
      i++
      continue
    }
    if (c === '÷') {
      out.push({ t: 'op', v: '/' })
      i++
      continue
    }
    throw new Error(`Unexpected "${c}"`)
  }
  return out
}

/** Compiles an expression in the given variables to a fast closure. */
export function compile(expr: string, vars: string[] = ['x']): Fn {
  const src = expr.replace(/^\s*(?:y|f\s*\(\s*x\s*\))\s*=/, '')
  const toks = tokenize(src, vars)
  let p = 0
  let absDepth = 0
  const peek = () => toks[p]
  const isOp = (v: string) => peek()?.t === 'op' && peek()!.v === v
  const expect = (v: string) => {
    if (!isOp(v)) throw new Error(`Expected "${v}"`)
    p++
  }
  const startsPrimary = () => {
    const t = peek()
    if (!t) return false
    if (t.t !== 'op') return true
    return t.v === '(' || (t.v === '|' && absDepth === 0)
  }

  const additive = (): Fn => {
    let l = term()
    while (isOp('+') || isOp('-')) {
      const op = toks[p++].v
      const r = term()
      const a = l
      l = op === '+' ? (e) => a(e) + r(e) : (e) => a(e) - r(e)
    }
    return l
  }
  const term = (): Fn => {
    let l = unary()
    for (;;) {
      if (isOp('*') || isOp('/')) {
        const op = toks[p++].v
        const r = unary()
        const a = l
        l = op === '*' ? (e) => a(e) * r(e) : (e) => a(e) / r(e)
      } else if (startsPrimary()) {
        const r = power()
        const a = l
        l = (e) => a(e) * r(e)
      } else return l
    }
  }
  const unary = (): Fn => {
    if (isOp('-')) {
      p++
      const r = unary()
      return (e) => -r(e)
    }
    if (isOp('+')) {
      p++
      return unary()
    }
    return power()
  }
  const power = (): Fn => {
    const b = postfix()
    if (isOp('^')) {
      p++
      const ex = unary()
      return (e) => Math.pow(b(e), ex(e))
    }
    return b
  }
  const postfix = (): Fn => {
    let v = primary()
    while (isOp('!')) {
      p++
      const a = v
      v = (e) => fact(a(e))
    }
    return v
  }
  const primary = (): Fn => {
    const t = peek()
    if (!t) throw new Error('Unexpected end of expression')
    if (t.t === 'num') {
      p++
      const v = t.v
      return () => v
    }
    if (t.t === 'op' && t.v === '(') {
      p++
      const v = additive()
      expect(')')
      return v
    }
    if (t.t === 'op' && t.v === '|') {
      p++
      absDepth++
      const v = additive()
      absDepth--
      expect('|')
      return (e) => Math.abs(v(e))
    }
    if (t.t === 'id') {
      p++
      const name = t.v
      if (name in FUNCS) {
        const f = FUNCS[name]
        let args: Fn[]
        if (isOp('(')) {
          p++
          args = [additive()]
          while (isOp(',')) {
            p++
            args.push(additive())
          }
          expect(')')
        } else args = [power()]
        if (args.length === 1) {
          const a = args[0]
          return (e) => f(a(e))
        }
        return (e) => f(...args.map((a) => a(e)))
      }
      if (name in CONSTS) {
        const v = CONSTS[name]
        return () => v
      }
      return (e) => e[name]
    }
    throw new Error(`Unexpected "${t.v}"`)
  }
  if (!toks.length) throw new Error('Empty expression')
  const fn = additive()
  if (p < toks.length) throw new Error(`Unexpected "${(toks[p] as { v: string | number }).v}"`)
  return fn
}

// ---------- sampling ----------

export type Curve = [number, number][][]

/**
 * Samples y = f(x) on [x0, x1] for a viewport of the given pixel size. Adds points where the curve bends
 * (adaptive subdivision) and breaks the polyline at undefined values and vertical asymptotes.
 */
export function sampleCurve(f: (x: number) => number, x0: number, x1: number, y0: number, y1: number, widthPx: number, heightPx: number): Curve {
  const n = Math.max(50, Math.min(4000, Math.round(widthPx)))
  const sy = heightPx / (y1 - y0)
  const yr = y1 - y0
  const segs: Curve = []
  let cur: [number, number][] = []
  const flush = () => {
    if (cur.length > 1) segs.push(cur)
    cur = []
  }
  const ok = (y: number) => Number.isFinite(y)
  const push = (x: number, y: number) => cur.push([x, Math.max(y0 - yr * 50, Math.min(y1 + yr * 50, y))])
  let budget = 200_000
  const refine = (xa: number, ya: number, xb: number, yb: number, depth: number) => {
    if ((ya > y1 && yb > y1) || (ya < y0 && yb < y0)) return // entirely off-screen on one side
    if (budget-- <= 0) return
    const jumpPx = Math.abs(yb - ya) * sy
    if (depth >= 12) {
      if (jumpPx > heightPx) flush() // vertical asymptote
      return
    }
    const xm = (xa + xb) / 2
    const ym = f(xm)
    if (!ok(ym)) {
      flush()
      return
    }
    const errPx = Math.abs(ym - (ya + yb) / 2) * sy
    if (errPx > 0.5 || jumpPx > 40) {
      refine(xa, ya, xm, ym, depth + 1)
      push(xm, ym)
      refine(xm, ym, xb, yb, depth + 1)
    }
  }
  let px = x0, py = f(x0)
  if (ok(py)) push(px, py)
  for (let i = 1; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n
    const y = f(x)
    if (ok(py) && ok(y)) {
      refine(px, py, x, y, 0)
      if (!cur.length) push(px, py)
      push(x, y)
    } else if (ok(y)) {
      flush()
      push(x, y)
    } else flush()
    px = x
    py = y
  }
  flush()
  return segs
}

// ---------- key points ----------

function bisect(g: (x: number) => number, a: number, b: number): number {
  let ga = g(a)
  for (let i = 0; i < 80; i++) {
    const m = (a + b) / 2
    const gm = g(m)
    if (gm === 0) return m
    if (Math.sign(gm) === Math.sign(ga)) {
      a = m
      ga = gm
    } else b = m
  }
  return (a + b) / 2
}

/** Zeros of g on [x0, x1] (sign changes that are not poles). */
export function findZeros(g: (x: number) => number, x0: number, x1: number, n = 1200, tolY = 1e-6): number[] {
  const out: number[] = []
  let pa = x0, pg = g(x0)
  for (let i = 1; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n
    const v = g(x)
    if (Number.isFinite(pg) && Number.isFinite(v)) {
      if (pg === 0) out.push(pa)
      else if (Math.sign(pg) !== Math.sign(v) && v !== 0) {
        const r = bisect(g, pa, x)
        const gr = g(r)
        if (Number.isFinite(gr) && Math.abs(gr) < Math.max(tolY, 1e-3 * (Math.abs(pg) + Math.abs(v)))) out.push(r)
      }
    }
    pa = x
    pg = v
  }
  if (g(x1) === 0) out.push(x1)
  return out.filter((x, i, a) => i === 0 || Math.abs(x - a[i - 1]) > (x1 - x0) * 1e-9)
}

/** Local extrema of f on [x0, x1]: zeros of the numerical derivative, classified as min / max. */
export function findExtrema(f: (x: number) => number, x0: number, x1: number, n = 800): { x: number; y: number; kind: 'min' | 'max' }[] {
  const h = (x1 - x0) * 1e-6
  const d = (x: number) => (f(x + h) - f(x - h)) / (2 * h)
  const out: { x: number; y: number; kind: 'min' | 'max' }[] = []
  for (const x of findZeros(d, x0, x1, n, Infinity)) {
    const y = f(x), l = f(x - (x1 - x0) / n), r = f(x + (x1 - x0) / n)
    if (!Number.isFinite(y) || !Number.isFinite(l) || !Number.isFinite(r)) continue
    if (y < l && y < r) out.push({ x, y, kind: 'min' })
    else if (y > l && y > r) out.push({ x, y, kind: 'max' })
  }
  return out
}

/** Nice grid step for a range spanning `span` over `px` pixels. */
export function gridStep(span: number, px: number, minPx = 60): number {
  const raw = (span / px) * minPx
  const p = 10 ** Math.floor(Math.log10(raw))
  for (const m of [1, 2, 5, 10]) if (m * p >= raw) return m * p
  return 10 * p
}
