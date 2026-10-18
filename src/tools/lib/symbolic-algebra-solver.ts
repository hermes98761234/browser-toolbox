// A small computer algebra system: exact rationals (BigInt), canonical expression trees,
// expand / factor / cancel, differentiation, integration (table, linearity, u-substitution,
// by parts, partial fractions, trig rewrites), equation solving, LaTeX and plain-text output.

// ───────────── rationals ─────────────
export interface Q { n: bigint; d: bigint }
const babs = (a: bigint) => (a < 0n ? -a : a)
export function bgcd(a: bigint, b: bigint): bigint {
  a = babs(a)
  b = babs(b)
  while (b) [a, b] = [b, a % b]
  return a
}
export function q(n: bigint | number, d: bigint | number = 1n): Q {
  let N = BigInt(n), D = BigInt(d)
  if (D === 0n) throw new Error('Division by zero')
  if (D < 0n) {
    N = -N
    D = -D
  }
  const g = bgcd(N, D) || 1n
  return { n: N / g, d: D / g }
}
export const qadd = (a: Q, b: Q) => q(a.n * b.d + b.n * a.d, a.d * b.d)
export const qsub = (a: Q, b: Q) => q(a.n * b.d - b.n * a.d, a.d * b.d)
export const qmul = (a: Q, b: Q) => q(a.n * b.n, a.d * b.d)
export const qdiv = (a: Q, b: Q) => q(a.n * b.d, a.d * b.n)
export const qneg = (a: Q): Q => ({ n: -a.n, d: a.d })
export const qnum = (a: Q) => Number(a.n) / Number(a.d)
const qz = (a: Q) => a.n === 0n
const qint = (a: Q) => a.d === 1n
const qeq = (a: Q, b: Q) => a.n === b.n && a.d === b.d
function qpow(a: Q, k: bigint): Q {
  if (k < 0n) return qpow(qdiv(q(1), a), -k)
  return q(a.n ** k, a.d ** k)
}
function qFromString(s: string): Q {
  const m = /^(\d*)(?:\.(\d*))?(?:[eE]([-+]?\d+))?$/.exec(s)
  if (!m) throw new Error(`Bad number ${s}`)
  const int = m[1] || '0', frac = m[2] ?? '', ex = Number(m[3] ?? 0)
  let r = q(BigInt(int + frac), 10n ** BigInt(frac.length))
  if (ex) r = qmul(r, ex > 0 ? q(10n ** BigInt(ex)) : q(1n, 10n ** BigInt(-ex)))
  return r
}

// ───────────── expressions ─────────────
export type Expr =
  | { k: 'num'; q: Q }
  | { k: 'sym'; n: string }
  | { k: 'add'; a: Expr[] }
  | { k: 'mul'; a: Expr[] }
  | { k: 'pow'; b: Expr; e: Expr }
  | { k: 'fn'; f: string; a: Expr }

export const num = (n: number | bigint | Q, d: number | bigint = 1): Expr => ({ k: 'num', q: typeof n === 'object' ? n : q(n, d) })
export const sym = (n: string): Expr => ({ k: 'sym', n })
export const ZERO = num(0), ONE = num(1), NEG1 = num(-1), HALF = num(1, 2)
export const E = sym('e'), PI = sym('pi')
const isNum = (e: Expr, v?: number) => e.k === 'num' && (v === undefined || qeq(e.q, q(v)))
const CONSTS = new Set(['pi', 'e'])

/** Deterministic text form, also used as the structural key. */
export function str(e: Expr): string {
  switch (e.k) {
    case 'num':
      return e.q.d === 1n ? String(e.q.n) : `${e.q.n}/${e.q.d}`
    case 'sym':
      return e.n
    case 'fn':
      return `${e.f}(${str(e.a)})`
    case 'pow': {
      const b = e.b.k === 'sym' || e.b.k === 'fn' || (e.b.k === 'num' && e.b.q.d === 1n && e.b.q.n >= 0n) ? str(e.b) : `(${str(e.b)})`
      if (e.e.k === 'num' && qeq(e.e.q, q(1, 2))) return `sqrt(${str(e.b)})`
      const x = e.e.k === 'sym' || (e.e.k === 'num' && e.e.q.d === 1n && e.e.q.n >= 0n) ? str(e.e) : `(${str(e.e)})`
      return `${b}^${x}`
    }
    case 'mul': {
      let s = ''
      e.a.forEach((f, i) => {
        const t = f.k === 'add' || (f.k === 'num' && (f.q.d !== 1n || f.q.n < 0n) && i > 0) ? `(${str(f)})` : str(f)
        if (i === 0 && f.k === 'num' && qeq(f.q, q(-1))) s = '-'
        else s += (i === 0 || s === '-' ? '' : '*') + t
      })
      return s
    }
    case 'add':
      return e.a.map((t, i) => {
        const s = str(t)
        return i === 0 ? s : s.startsWith('-') ? ` - ${s.slice(1)}` : ` + ${s}`
      }).join('')
  }
}
export const eq = (a: Expr, b: Expr) => str(a) === str(b)

export function free(e: Expr, x: string): boolean {
  switch (e.k) {
    case 'num': return true
    case 'sym': return e.n !== x
    case 'fn': return free(e.a, x)
    case 'pow': return free(e.b, x) && free(e.e, x)
    default: return e.a.every((t) => free(t, x))
  }
}
const syms = (e: Expr, out = new Set<string>()): Set<string> => {
  if (e.k === 'sym' && !CONSTS.has(e.n)) out.add(e.n)
  else if (e.k === 'fn') syms(e.a, out)
  else if (e.k === 'pow') {
    syms(e.b, out)
    syms(e.e, out)
  } else if (e.k === 'add' || e.k === 'mul') e.a.forEach((t) => syms(t, out))
  return out
}
export const symbols = (e: Expr) => [...syms(e)].sort()

// ── ordering ──
function degree(e: Expr): number {
  if (e.k === 'sym') return CONSTS.has(e.n) ? 0 : 1
  if (e.k === 'pow' && e.e.k === 'num') return degree(e.b) * qnum(e.e.q)
  if (e.k === 'mul') return e.a.reduce((s, f) => s + degree(f), 0)
  return 0
}
function rank(e: Expr): number {
  if (e.k === 'num') return 0
  if (e.k === 'sym') return CONSTS.has(e.n) ? 1 : 2
  if (e.k === 'pow') return e.b.k === 'sym' ? (e.b.n === 'e' ? 3 : CONSTS.has(e.b.n) ? 1 : 2) : e.b.k === 'fn' ? 4 : e.b.k === 'num' ? 1 : 5
  if (e.k === 'fn') return 4
  return 5
}
const baseName = (e: Expr): string => (e.k === 'pow' ? baseName(e.b) : str(e))
function cmpFactor(a: Expr, b: Expr) {
  return rank(a) - rank(b) || (baseName(a) < baseName(b) ? -1 : baseName(a) > baseName(b) ? 1 : 0) || (str(a) < str(b) ? -1 : str(a) > str(b) ? 1 : 0)
}
function cmpTerm(a: Expr, b: Expr) {
  const ca = symbols(a).length === 0, cb = symbols(b).length === 0
  if (ca !== cb) return ca ? 1 : -1
  const d = degree(b) - degree(a)
  if (d) return d
  for (const v of [...new Set([...symbols(a), ...symbols(b)])].sort()) {
    const dv = symDegree(b, v) - symDegree(a, v)
    if (dv) return dv
  }
  return str(a) < str(b) ? -1 : str(a) > str(b) ? 1 : 0
}
function symDegree(e: Expr, v: string): number {
  if (e.k === 'sym') return e.n === v ? 1 : 0
  if (e.k === 'pow' && e.e.k === 'num') return symDegree(e.b, v) * qnum(e.e.q)
  if (e.k === 'mul') return e.a.reduce((s, f) => s + symDegree(f, v), 0)
  return 0
}

// ── constructors (auto-simplifying) ──
function split(t: Expr): [Q, Expr] {
  if (t.k === 'num') return [t.q, ONE]
  if (t.k === 'mul' && t.a[0].k === 'num') return [t.a[0].q, t.a.length === 2 ? t.a[1] : { k: 'mul', a: t.a.slice(1) }]
  return [q(1), t]
}

export function add(...xs: Expr[]): Expr {
  const flat: Expr[] = []
  for (const x of xs) {
    if (x.k === 'add') flat.push(...x.a)
    else flat.push(x)
  }
  let c = q(0)
  const terms = new Map<string, [Q, Expr]>()
  for (const t of flat) {
    if (t.k === 'num') {
      c = qadd(c, t.q)
      continue
    }
    const [k, r] = split(t)
    const key = str(r)
    const prev = terms.get(key)
    terms.set(key, [prev ? qadd(prev[0], k) : k, r])
  }
  const out: Expr[] = []
  for (const [k, r] of terms.values()) if (!qz(k)) out.push(qeq(k, q(1)) ? r : mul(num(k), r))
  if (!qz(c)) out.push(num(c))
  const fl: Expr[] = []
  for (const t of out) {
    if (t.k === 'add') fl.push(...t.a)
    else fl.push(t)
  }
  if (fl.length !== out.length) return add(...fl)
  if (out.length === 0) return ZERO
  if (out.length === 1) return out[0]
  return { k: 'add', a: out.sort(cmpTerm) }
}

export function mul(...xs: Expr[]): Expr {
  let c = q(1)
  const bases = new Map<string, [Expr, Expr[]]>()
  const stack = [...xs]
  while (stack.length) {
    const x = stack.shift()!
    if (x.k === 'num') {
      c = qmul(c, x.q)
      continue
    }
    if (x.k === 'mul') {
      stack.unshift(...x.a)
      continue
    }
    const [b, ex] = x.k === 'pow' ? [x.b, x.e] : [x, ONE]
    const key = str(b)
    const prev = bases.get(key)
    if (prev) prev[1].push(ex)
    else bases.set(key, [b, [ex]])
  }
  if (qz(c)) return ZERO
  let factors: Expr[] = []
  let again = false
  for (const [b, exs] of bases.values()) {
    const f = pow(b, add(...exs))
    if (f.k === 'num') c = qmul(c, f.q)
    else if (f.k === 'mul') {
      factors.push(...f.a)
      again = true
    } else factors.push(f)
  }
  if (again) return mul(num(c), ...factors)
  factors = factors.filter((f) => !isNum(f, 1))
  // √3·√31 → √93: merge numeric bases that share a rational exponent
  const surds = new Map<string, Expr[]>()
  for (const f of factors) if (f.k === 'pow' && f.b.k === 'num' && f.e.k === 'num') surds.set(str(f.e), [...(surds.get(str(f.e)) ?? []), f])
  for (const group of surds.values())
    if (group.length > 1) {
      const e0 = (group[0] as { e: Expr }).e
      const base = group.reduce((acc, g) => qmul(acc, ((g as { b: Expr }).b as { q: Q }).q), q(1))
      return mul(num(c), ...factors.filter((f) => !group.includes(f)), pow(num(base), e0))
    }
  if (factors.length === 0) return num(c)
  // distribute a numeric coefficient over a single sum: 2(x+1) → 2x + 2
  if (!qeq(c, q(1)) && factors.length === 1 && factors[0].k === 'add') return add(...factors[0].a.map((t) => mul(num(c), t)))
  factors.sort(cmpFactor)
  if (qeq(c, q(1)) && factors.length === 1) return factors[0]
  return { k: 'mul', a: qeq(c, q(1)) ? factors : [num(c), ...factors] }
}

/** Largest k-th power dividing n (trial division; big numbers are left alone). */
function perfectPart(n: bigint, k: number): [bigint, bigint] {
  let out = 1n, rest = n
  if (n > 10n ** 10n) return [1n, n]
  for (let p = 2n; p * p <= rest || p <= 3n; p++) {
    const pk = p ** BigInt(k)
    if (pk > rest) break
    while (rest % pk === 0n) {
      rest /= pk
      out *= p
    }
  }
  return [out, rest]
}

export function pow(b: Expr, e: Expr): Expr {
  if (isNum(e, 0)) return ONE
  if (isNum(e, 1)) return b
  if (isNum(b, 1)) return ONE
  if (isNum(b, 0) && e.k === 'num' && e.q.n > 0n) return ZERO
  if (b.k === 'num' && e.k === 'num') {
    if (qint(e.q)) {
      if (qz(b.q) && e.q.n < 0n) throw new Error('Division by zero')
      return num(qpow(b.q, e.q.n))
    }
    const r = Number(e.q.d), p = e.q.n
    let n = b.q.n, d = b.q.d
    let sign = 1n
    if (n < 0n) {
      if (r % 2 === 0) return { k: 'pow', b, e }
      n = -n
      sign = (p % 2n === 0n) ? 1n : -1n
    }
    const [an, rn] = perfectPart(n, r), [ad, rd] = perfectPart(d, r)
    const outer = qpow(q(an, ad), p)
    const whole = p >= 0n ? p / BigInt(r) : -((-p + BigInt(r) - 1n) / BigInt(r))
    const frac = q(p - whole * BigInt(r), BigInt(r)) // in [0, 1)
    const intPart = qpow(q(rn, rd), whole)
    const parts: Expr[] = [num(qmul(q(sign), qmul(outer, intPart)))]
    if (!qz(frac)) {
      if (rn !== 1n) parts.push({ k: 'pow', b: num(rn), e: num(frac) })
      if (rd !== 1n) parts.push({ k: 'pow', b: num(rd), e: num(qneg(frac)) })
    }
    const fs = parts.filter((x) => !isNum(x, 1))
    if (fs.length === 0) return ONE
    if (fs.length === 1) return fs[0]
    return { k: 'mul', a: fs.sort(cmpFactor) }
  }
  if (b.k === 'pow' && e.k === 'num' && qint(e.q)) return pow(b.b, mul(b.e, e))
  if (b.k === 'pow' && e.k === 'num' && b.e.k === 'num' && (b.b.k === 'num' ? b.b.q.n > 0n : b.b.k === 'sym' && CONSTS.has(b.b.n))) return pow(b.b, mul(b.e, e))
  if (b.k === 'mul' && e.k === 'num' && qint(e.q)) return mul(...b.a.map((f) => pow(f, e)))
  if (b.k === 'mul' && b.a[0].k === 'num' && b.a[0].q.n > 0n && !isNum(b.a[0], 1)) return mul(pow(b.a[0], e), pow(mul(...b.a.slice(1)), e))
  if (b.k === 'sym' && b.n === 'e') {
    if (e.k === 'fn' && e.f === 'ln') return e.a
    if (e.k === 'mul' && e.a.length === 2 && e.a[0].k === 'num' && e.a[1].k === 'fn' && e.a[1].f === 'ln') return pow(e.a[1].a, e.a[0])
  }
  return { k: 'pow', b, e }
}

export const neg = (e: Expr) => mul(NEG1, e)
export const sub = (a: Expr, b: Expr) => add(a, neg(b))
export const div = (a: Expr, b: Expr) => mul(a, pow(b, NEG1))
export const sqrt = (a: Expr) => pow(a, HALF)

// special values of trig functions at rational multiples of π
const piMultiple = (a: Expr): Q | null => {
  if (a.k === 'sym' && a.n === 'pi') return q(1)
  if (a.k === 'mul' && a.a.length === 2 && a.a[0].k === 'num' && a.a[1].k === 'sym' && a.a[1].n === 'pi') return a.a[0].q
  if (isNum(a, 0)) return q(0)
  return null
}
function sinPi(r: Q): Expr | null {
  // sin(rπ) for r with denominator 1,2,3,4,6
  let t = qsub(r, qmul(q(2), q((r.n / r.d / 2n) * 1n))) // r mod 2 (roughly)
  while (qnum(t) < 0) t = qadd(t, q(2))
  while (qnum(t) >= 2) t = qsub(t, q(2))
  const table: [Q, Expr][] = [
    [q(0), ZERO], [q(1, 6), HALF], [q(1, 4), mul(HALF, sqrt(num(2)))], [q(1, 3), mul(HALF, sqrt(num(3)))], [q(1, 2), ONE],
    [q(2, 3), mul(HALF, sqrt(num(3)))], [q(3, 4), mul(HALF, sqrt(num(2)))], [q(5, 6), HALF], [q(1), ZERO],
  ]
  const sign = qnum(t) >= 1 ? -1 : 1
  if (sign < 0) t = qsub(t, q(1))
  const hit = table.find(([k]) => qeq(k, t))
  return hit ? mul(num(sign), hit[1]) : null
}

const ODD = new Set(['sin', 'tan', 'asin', 'atan', 'sinh', 'tanh', 'asinh', 'atanh', 'csc', 'cot'])
const EVEN = new Set(['cos', 'sec', 'cosh', 'abs'])
export function fn(f: string, a: Expr): Expr {
  if (f === 'exp') return pow(E, a)
  if (f === 'sqrt') return sqrt(a)
  if (f === 'cbrt') return pow(a, num(1, 3))
  if (f === 'log') f = 'ln'
  if (f === 'arcsin') f = 'asin'
  if (f === 'arccos') f = 'acos'
  if (f === 'arctan') f = 'atan'
  // odd / even symmetry for a negative coefficient
  if ((ODD.has(f) || EVEN.has(f)) && ((a.k === 'num' && a.q.n < 0n) || (a.k === 'mul' && a.a[0].k === 'num' && a.a[0].q.n < 0n))) {
    const pa = neg(a)
    return ODD.has(f) ? neg(fn(f, pa)) : fn(f, pa)
  }
  if (f === 'ln') {
    if (isNum(a, 1)) return ZERO
    if (a.k === 'sym' && a.n === 'e') return ONE
    if (a.k === 'pow' && a.b.k === 'sym' && a.b.n === 'e') return a.e
    if (isNum(a, 0)) throw new Error('ln(0) is undefined')
  }
  if (f === 'abs') {
    if (a.k === 'num') return num(a.q.n < 0n ? qneg(a.q) : a.q)
    if (a.k === 'sym' && CONSTS.has(a.n)) return a
    if (a.k === 'pow' && a.b.k === 'sym' && a.b.n === 'e') return a
    if (a.k === 'pow' && a.e.k === 'num' && a.e.q.d === 1n && a.e.q.n % 2n === 0n) return a
  }
  const pm = piMultiple(a)
  if (pm) {
    if (f === 'sin') { const v = sinPi(pm); if (v) return v }
    if (f === 'cos') { const v = sinPi(qadd(pm, q(1, 2))); if (v) return v }
    if (f === 'tan') {
      const s = sinPi(pm), c = sinPi(qadd(pm, q(1, 2)))
      if (s && c && !isNum(c, 0)) return div(s, c)
    }
  }
  if (isNum(a, 0)) {
    const z: Record<string, Expr> = { sin: ZERO, tan: ZERO, asin: ZERO, atan: ZERO, sinh: ZERO, tanh: ZERO, asinh: ZERO, atanh: ZERO, cos: ONE, cosh: ONE, sec: ONE, acos: div(PI, num(2)) }
    if (z[f]) return z[f]
  }
  if (isNum(a, 1)) {
    const o: Record<string, Expr> = { asin: div(PI, num(2)), acos: ZERO, atan: div(PI, num(4)), acosh: ZERO }
    if (o[f]) return o[f]
  }
  if (f === 'asin' || f === 'acos' || f === 'atan') {
    const k = str(a)
    const tbl: Record<string, Record<string, [number, number]>> = {
      asin: { '1/2': [1, 6], '1/2*sqrt(2)': [1, 4], '1/2*sqrt(3)': [1, 3] },
      acos: { '1/2': [1, 3], '1/2*sqrt(2)': [1, 4], '1/2*sqrt(3)': [1, 6], '-1': [1, 1], '-1/2': [2, 3] },
      atan: { 'sqrt(3)': [1, 3], '3^(-1/2)': [1, 6], '1/3*sqrt(3)': [1, 6] },
    }
    const hit = tbl[f][k]
    if (hit) return mul(num(hit[0], hit[1]), PI)
  }
  return { k: 'fn', f, a }
}

/** Rebuilds an expression bottom-up through the constructors. */
function rebuild(e: Expr, map: (x: Expr) => Expr): Expr {
  switch (e.k) {
    case 'add': return add(...e.a.map(map))
    case 'mul': return mul(...e.a.map(map))
    case 'pow': return pow(map(e.b), map(e.e))
    case 'fn': return fn(e.f, map(e.a))
    default: return e
  }
}
export function subs(e: Expr, from: Expr, to: Expr): Expr {
  if (eq(e, from)) return to
  return rebuild(e, (x) => subs(x, from, to))
}

// ───────────── parsing ─────────────
const FUNCS = new Set(['sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'asin', 'acos', 'atan', 'arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh', 'ln', 'log', 'exp', 'sqrt', 'cbrt', 'abs', 'log10'])
const GREEK = new Set(['alpha', 'beta', 'gamma', 'delta', 'theta', 'lambda', 'mu', 'omega', 'phi', 'sigma', 'tau', 'rho'])

export function parse(src: string): Expr {
  const s = src.replace(/\*\*/g, '^').replace(/[·×]/g, '*').replace(/[−–]/g, '-').replace(/÷/g, '/').replace(/π/g, 'pi').replace(/√/g, 'sqrt').replace(/\s+/g, ' ').trim()
  if (!s) throw new Error('Empty expression')
  const toks: string[] = []
  const re = /\s*(\d+\.?\d*(?:[eE][-+]?\d+)?|\.\d+|[A-Za-z_][A-Za-z_0-9]*|[-+*/^(),|!])/y
  let pos = 0
  while (pos < s.length) {
    re.lastIndex = pos
    const m = re.exec(s)
    if (!m) throw new Error(`Unexpected “${s[pos]}” at position ${pos + 1}`)
    pos = re.lastIndex
    const t = m[1]
    if (/^[A-Za-z_]/.test(t) && !FUNCS.has(t) && !CONSTS.has(t) && !GREEK.has(t) && !/^[A-Za-z]\d+$/.test(t) && t.length > 1) {
      // xy → x·y (but keep functions, constants, greek letters and x1-style names)
      let rest = t
      while (rest) {
        const f = [...FUNCS, ...CONSTS, ...GREEK].filter((w) => rest.startsWith(w)).sort((a, b) => b.length - a.length)[0]
        if (f) {
          toks.push(f)
          rest = rest.slice(f.length)
        } else {
          toks.push(rest[0])
          rest = rest.slice(1)
        }
      }
    } else toks.push(t)
  }
  let i = 0
  const peek = () => toks[i]
  const expect = (t: string) => {
    if (toks[i] !== t) throw new Error(`Expected “${t}”${toks[i] ? ` but found “${toks[i]}”` : ' at the end'}`)
    i++
  }
  const startsAtom = (t: string | undefined) => t !== undefined && (/^[\d.A-Za-z_]/.test(t) || t === '(')
  const expr = (): Expr => {
    let l = term()
    while (peek() === '+' || peek() === '-') {
      const op = toks[i++]
      const r = term()
      l = op === '+' ? add(l, r) : sub(l, r)
    }
    return l
  }
  const term = (): Expr => {
    let l = unary()
    for (;;) {
      if (peek() === '*') {
        i++
        l = mul(l, unary())
      } else if (peek() === '/') {
        i++
        const r = unary()
        if (isNum(r, 0)) throw new Error('Division by zero')
        l = div(l, r)
      } else if (startsAtom(peek())) l = mul(l, power())
      else return l
    }
  }
  const unary = (): Expr => {
    if (peek() === '-') {
      i++
      return neg(unary())
    }
    if (peek() === '+') {
      i++
      return unary()
    }
    return power()
  }
  const power = (): Expr => {
    const b = atom()
    if (peek() === '^') {
      i++
      return pow(b, unary())
    }
    return b
  }
  const atom = (): Expr => {
    const t = toks[i++]
    if (t === undefined) throw new Error('Unexpected end of input')
    if (t === '(') {
      const e = expr()
      expect(')')
      return e
    }
    if (t === '|') {
      const e = expr()
      expect('|')
      return fn('abs', e)
    }
    if (/^[\d.]/.test(t)) return num(qFromString(t))
    if (FUNCS.has(t)) {
      let p: Expr | null = null
      if (peek() === '^') {
        // sin^2(x)
        i++
        p = atom()
      }
      let arg: Expr
      if (peek() === '(') {
        i++
        arg = expr()
        if (t === 'log' && peek() === ',') {
          // log(x, base)
          i++
          const base = expr()
          expect(')')
          const v = div(fn('ln', arg), fn('ln', base))
          return p ? pow(v, p) : v
        }
        expect(')')
      } else arg = power()
      const v = t === 'log10' ? div(fn('ln', arg), fn('ln', num(10))) : fn(t, arg)
      return p ? pow(v, p) : v
    }
    if (/^[A-Za-z_]/.test(t)) return sym(t)
    throw new Error(`Unexpected “${t}”`)
  }
  const e = expr()
  if (i < toks.length) throw new Error(`Unexpected “${toks[i]}”`)
  return e
}

// ───────────── numeric evaluation ─────────────
export function evalN(e: Expr, env: Record<string, number> = {}): number {
  switch (e.k) {
    case 'num': return qnum(e.q)
    case 'sym': return e.n === 'pi' ? Math.PI : e.n === 'e' ? Math.E : (env[e.n] ?? NaN)
    case 'add': return e.a.reduce((s, t) => s + evalN(t, env), 0)
    case 'mul': return e.a.reduce((s, t) => s * evalN(t, env), 1)
    case 'pow': {
      const b = evalN(e.b, env), x = evalN(e.e, env)
      if (b < 0 && e.e.k === 'num' && e.e.q.d % 2n === 1n) return (e.e.q.n % 2n === 0n ? 1 : -1) * Math.pow(-b, x)
      return Math.pow(b, x)
    }
    case 'fn': {
      const a = evalN(e.a, env)
      const F: Record<string, (v: number) => number> = {
        sin: Math.sin, cos: Math.cos, tan: Math.tan, sec: (v) => 1 / Math.cos(v), csc: (v) => 1 / Math.sin(v), cot: (v) => 1 / Math.tan(v),
        asin: Math.asin, acos: Math.acos, atan: Math.atan, sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh, asinh: Math.asinh, acosh: Math.acosh, atanh: Math.atanh,
        ln: Math.log, abs: Math.abs,
      }
      return F[e.f] ? F[e.f](a) : NaN
    }
  }
}

// ───────────── expand ─────────────
export function expand(e: Expr): Expr {
  switch (e.k) {
    case 'add': return add(...e.a.map(expand))
    case 'mul': {
      let terms: Expr[] = [ONE]
      for (const f of e.a.map(expand)) {
        const fs = f.k === 'add' ? f.a : [f]
        const next: Expr[] = []
        for (const a of terms) for (const b of fs) next.push(mul(a, b))
        terms = next
        if (terms.length > 4000) throw new Error('Expansion too large')
      }
      return add(...terms)
    }
    case 'pow': {
      const b = expand(e.b), x = expand(e.e)
      if (b.k === 'add' && x.k === 'num' && qint(x.q) && x.q.n > 1n && x.q.n <= 40n) {
        let r: Expr[] = [ONE]
        const bt = b.a
        for (let k = 0n; k < x.q.n; k++) {
          const next: Expr[] = []
          for (const a of r) for (const t of bt) next.push(mul(a, t))
          r = (add(...next) as Expr).k === 'add' ? (add(...next) as { a: Expr[] }).a : [add(...next)]
          if (r.length > 4000) throw new Error('Expansion too large')
        }
        return add(...r)
      }
      if (b.k === 'add' && x.k === 'num' && qint(x.q) && x.q.n < -1n && x.q.n >= -40n) return pow(expand(pow(b, num(-x.q.n))), NEG1)
      if (b.k === 'sym' && b.n === 'e' && x.k === 'add') return mul(...x.a.map((t) => pow(E, t)))
      return pow(b, x)
    }
    case 'fn': return fn(e.f, expand(e.a))
    default: return e
  }
}

// ───────────── polynomials over Q ─────────────
export type P = Q[] // ascending coefficients

const ptrim = (p: P): P => {
  const r = p.slice()
  while (r.length > 1 && qz(r[r.length - 1])) r.pop()
  return r.length ? r : [q(0)]
}
const pdeg = (p: P) => (ptrim(p).length === 1 && qz(p[0]) ? -1 : ptrim(p).length - 1)
const padd = (a: P, b: P): P => ptrim(Array.from({ length: Math.max(a.length, b.length) }, (_, i) => qadd(a[i] ?? q(0), b[i] ?? q(0))))
const pscale = (a: P, k: Q): P => ptrim(a.map((c) => qmul(c, k)))
const psub = (a: P, b: P): P => padd(a, pscale(b, q(-1)))
function pmul(a: P, b: P): P {
  const r: Q[] = Array.from({ length: a.length + b.length - 1 }, () => q(0))
  a.forEach((x, i) => b.forEach((y, j) => (r[i + j] = qadd(r[i + j], qmul(x, y)))))
  return ptrim(r)
}
function pdivmod(a: P, b: P): [P, P] {
  const db = pdeg(b)
  if (db < 0) throw new Error('Polynomial division by zero')
  let r = ptrim(a)
  const quo: Q[] = Array.from({ length: Math.max(1, r.length - db) }, () => q(0))
  while (pdeg(r) >= db) {
    const k = pdeg(r) - db
    const c = qdiv(r[pdeg(r)], b[db])
    quo[k] = c
    const t: Q[] = Array.from({ length: k + 1 }, () => q(0))
    t[k] = c
    r = psub(r, pmul(t, b))
  }
  return [ptrim(quo), r]
}
function pgcd(a: P, b: P): P {
  let x = ptrim(a), y = ptrim(b)
  while (pdeg(y) >= 0) [x, y] = [y, pdivmod(x, y)[1]]
  const lc = x[pdeg(x)] ?? q(1)
  return pdeg(x) < 0 ? [q(1)] : pscale(x, qdiv(q(1), lc))
}
const pevalQ = (a: P, x: Q) => a.reduceRight((s, c) => qadd(qmul(s, x), c), q(0))

/** Coefficients of e as a polynomial in x (Expr coefficients free of x), or null. */
export function polyCoeffs(e: Expr, x: string): Expr[] | null {
  const ex = expand(e)
  const terms = ex.k === 'add' ? ex.a : [ex]
  const out: Expr[] = []
  for (const t of terms) {
    const fs = t.k === 'mul' ? t.a : [t]
    let k = 0
    const rest: Expr[] = []
    for (const f of fs) {
      if (f.k === 'sym' && f.n === x) k += 1
      else if (f.k === 'pow' && f.b.k === 'sym' && f.b.n === x && f.e.k === 'num' && qint(f.e.q) && f.e.q.n > 0n) k += Number(f.e.q.n)
      else if (free(f, x)) rest.push(f)
      else return null
    }
    if (k > 60) return null
    while (out.length <= k) out.push(ZERO)
    out[k] = add(out[k], mul(...rest))
  }
  return out.length ? out : [ZERO]
}
export function polyQ(e: Expr, x: string): P | null {
  const c = polyCoeffs(e, x)
  if (!c || c.some((t) => t.k !== 'num')) return null
  return ptrim(c.map((t) => (t as { q: Q }).q))
}
export function polyToExpr(p: P, x: string): Expr {
  return add(...p.map((c, i) => mul(num(c), pow(sym(x), num(i)))))
}

/** Splits e into numerator / denominator (common denominator over sums). */
export function numDen(e: Expr): [Expr, Expr] {
  if (e.k === 'num') return [num(e.q.n), num(e.q.d)]
  if (e.k === 'pow' && e.e.k === 'num' && e.e.q.n < 0n) return [ONE, pow(e.b, num(qneg(e.e.q)))]
  if (e.k === 'mul') {
    const ns: Expr[] = [], ds: Expr[] = []
    for (const f of e.a) {
      const [n, d] = numDen(f)
      ns.push(n)
      ds.push(d)
    }
    return [mul(...ns), mul(...ds)]
  }
  if (e.k === 'add') {
    let N: Expr = ZERO, D: Expr = ONE
    for (const t of e.a) {
      const [n, d] = numDen(t)
      if (eq(d, D)) N = add(N, n)
      else {
        N = add(mul(N, d), mul(n, D))
        D = mul(D, d)
      }
    }
    return [N, D]
  }
  return [e, ONE]
}

/** Rational root theorem: all rational roots with multiplicity, plus the deflated remainder. */
export function rationalRoots(p0: P): { roots: [Q, number][]; rest: P } {
  let p = ptrim(p0)
  const roots: [Q, number][] = []
  // x = 0 roots
  let z = 0
  while (p.length > 1 && qz(p[0])) {
    p = p.slice(1)
    z++
  }
  if (z) roots.push([q(0), z])
  // integer coefficients
  const L = p.reduce((l, c) => (l * c.d) / bgcd(l, c.d), 1n)
  const ints = p.map((c) => (c.n * L) / c.d)
  const divisors = (n: bigint): bigint[] => {
    n = babs(n)
    if (n === 0n || n > 10n ** 9n) return []
    const out: bigint[] = []
    for (let k = 1n; k * k <= n; k++)
      if (n % k === 0n) {
        out.push(k)
        if (k * k !== n) out.push(n / k)
      }
    return out
  }
  if (pdeg(p) >= 1) {
    const ps = divisors(ints[0]), qs = divisors(ints[ints.length - 1])
    const cands = new Map<string, Q>()
    for (const a of ps) for (const b of qs) for (const s of [1n, -1n]) {
      const r = q(s * a, b)
      cands.set(`${r.n}/${r.d}`, r)
    }
    for (const r of cands.values()) {
      let m = 0
      while (pdeg(p) >= 1 && qz(pevalQ(p, r))) {
        p = pdivmod(p, [qneg(r), q(1)])[0]
        m++
      }
      if (m) roots.push([r, m])
    }
  }
  return { roots: roots.sort((a, b) => qnum(a[0]) - qnum(b[0])), rest: p }
}

/** Tries to split a quartic over Z into two monic quadratics. */
function quarticSplit(p: P): [P, P] | null {
  if (pdeg(p) !== 4) return null
  const lc = p[4]
  const m = p.map((c) => qdiv(c, lc))
  if (!m.every(qint)) return null
  const [a0, a1, a2, a3] = m.map((c) => c.n)
  if (a0 === 0n || babs(a0) > 10n ** 6n) return null
  for (let b = -babs(a0); b <= babs(a0); b++) {
    if (b === 0n || a0 % b !== 0n) continue
    const d = a0 / b
    const tryAC = (a: bigint) => {
      const c = a3 - a
      if (b + d + a * c === a2 && a * d + b * c === a1) return [[q(b), q(a), q(1)], [q(d), q(c), q(1)]] as [P, P]
      return null
    }
    if (d !== b) {
      if ((a1 - b * a3) % (d - b) === 0n) {
        const r = tryAC((a1 - b * a3) / (d - b))
        if (r) return [r[0], pscale(r[1], lc)]
      }
    } else {
      // a + c = a3, a c = a2 − 2b
      const disc = a3 * a3 - 4n * (a2 - 2n * b)
      if (disc >= 0n) {
        const s = BigInt(Math.round(Math.sqrt(Number(disc))))
        if (s * s === disc && (a3 + s) % 2n === 0n) {
          const r = tryAC((a3 + s) / 2n)
          if (r) return [r[0], pscale(r[1], lc)]
        }
      }
    }
  }
  return null
}

export interface Factored { content: Q; linear: [Q, number][]; quads: [P, number][]; rest: P | null }

/** Factorisation over Q: content × Π(x − r)^m × Π(quadratic)^m × rest. */
export function factorQ(p0: P): Factored {
  const p = ptrim(p0)
  const lc = p[p.length - 1]
  const { roots, rest } = rationalRoots(pscale(p, qdiv(q(1), lc)))
  const quads: [P, number][] = []
  let remaining: P | null = rest
  if (pdeg(rest) === 2) {
    quads.push([rest, 1])
    remaining = null
  } else if (pdeg(rest) === 4) {
    const sp = quarticSplit(rest)
    if (sp) {
      if (sp[0].every((c, i) => qeq(c, sp[1][i]))) quads.push([sp[0], 2])
      else quads.push([sp[0], 1], [sp[1], 1])
      remaining = null
    }
  } else if (pdeg(rest) <= 0) remaining = null
  return { content: lc, linear: roots, quads, rest: remaining }
}

export function factor(e: Expr, x: string): Expr {
  const [n, d] = numDen(e)
  const f1 = (t: Expr): Expr => {
    const p = polyQ(t, x)
    if (!p || pdeg(p) < 1) return commonFactor(t)
    const F = factorQ(p)
    let c = F.content
    const parts: Expr[] = []
    for (const [r, m] of F.linear) {
      // (d·x − n) keeps integer coefficients
      c = qdiv(c, qpow(q(r.d), BigInt(m)))
      parts.push(pow(add(mul(num(r.d), sym(x)), num(-r.n)), num(m)))
    }
    for (const [qd, m] of F.quads) parts.push(pow(intPrimitive(qd, x, (k) => (c = qmul(c, qpow(k, BigInt(m))))), num(m)))
    if (F.rest) parts.push(intPrimitive(F.rest, x, (k) => (c = qmul(c, k))))
    return rawMul([num(c), ...parts])
  }
  const top = f1(n), bot = f1(d)
  if (isNum(bot, 1)) return top
  const fs = (t: Expr) => (t.k === 'mul' ? t.a : [t])
  const botC = fs(bot).filter((t) => t.k === 'num')
  const k = botC.length ? (botC[0] as { q: Q }).q : q(1)
  const topFs = fs(top).map((t) => (t.k === 'num' ? num(qdiv(t.q, k)) : t))
  if (!fs(top).some((t) => t.k === 'num')) topFs.unshift(num(qdiv(q(1), k)))
  return rawMul([...topFs, ...fs(bot).filter((t) => t.k !== 'num').map((t) => pow(t, NEG1))])
}
/** Product node without re-canonicalising (keeps factored forms like 2(x + 1)). */
function rawMul(fs: Expr[]): Expr {
  let c = q(1)
  const rest: Expr[] = []
  for (const f of fs) {
    if (f.k === 'num') c = qmul(c, f.q)
    else if (f.k === 'mul') {
      for (const g of f.a) {
        if (g.k === 'num') c = qmul(c, g.q)
        else rest.push(g)
      }
    } else rest.push(f)
  }
  if (qz(c)) return ZERO
  rest.sort(cmpFactor)
  const all = qeq(c, q(1)) ? rest : [num(c), ...rest]
  return all.length === 0 ? ONE : all.length === 1 ? all[0] : { k: 'mul', a: all }
}

/** Polynomial with integer coefficients; reports the rational factor taken out. */
function intPrimitive(p: P, x: string, out: (k: Q) => void): Expr {
  const L = p.reduce((l, c) => (l * c.d) / bgcd(l, c.d), 1n)
  const ints = p.map((c) => (c.n * L) / c.d)
  const g = ints.reduce((a, b) => bgcd(a, b), 0n) || 1n
  const k = q(g, L)
  out(k)
  const prim = p.map((c) => qdiv(c, k))
  // keep the product unexpanded: build as add without distributing into factors
  return polyToExpr(prim, x)
}
/** Pulls out the common numeric and monomial factor of a sum: 2x²y + 4xy² → 2xy(x + 2y). */
export function commonFactor(e: Expr): Expr {
  const ex = expand(e)
  if (ex.k !== 'add') return ex
  let g: Q | null = null
  const minPow = new Map<string, [Expr, Q]>()
  ex.a.forEach((t, idx) => {
    const [c, r] = split(t)
    g = g ? q(bgcd(g.n * c.d, c.n * g.d), g.d * c.d) : q(babs(c.n), c.d)
    const fs = r.k === 'mul' ? r.a : isNum(r, 1) ? [] : [r]
    const here = new Map<string, [Expr, Q]>()
    for (const f of fs) {
      const [b, k] = f.k === 'pow' && f.e.k === 'num' ? [f.b, f.e.q] : [f, q(1)]
      here.set(str(b), [b, k])
    }
    if (idx === 0) here.forEach((v, key) => minPow.set(key, v))
    else
      for (const key of [...minPow.keys()]) {
        const h = here.get(key)
        if (!h) minPow.delete(key)
        else if (qnum(h[1]) < qnum(minPow.get(key)![1])) minPow.set(key, h)
      }
  })
  const lead = split(ex.a[0])[0]
  const gq = (g ?? q(1)) as Q
  const G = mul(num(lead.n < 0n ? qneg(gq) : gq), ...[...minPow.values()].map(([b, k]) => pow(b, num(k))))
  if (isNum(G, 1)) return ex
  const inner = add(...ex.a.map((t) => expand(div(t, G))))
  return { k: 'mul', a: [...(G.k === 'mul' ? G.a : [G]), inner] }
}

/** Cancels the polynomial gcd of numerator and denominator (univariate rational coefficients). */
export function cancel(e: Expr, x: string): Expr {
  const [n, d] = numDen(e)
  const pn = polyQ(n, x), pd = polyQ(d, x)
  if (!pn || !pd || pdeg(pd) < 1) return add(...[expand(n)].map((t) => div(t, expand(d))))
  const g = pgcd(pn, pd)
  const nn = pdivmod(pn, g)[0], dd = pdivmod(pd, g)[0]
  const lc = dd[pdeg(dd)]
  return div(polyToExpr(pscale(nn, qdiv(q(1), lc)), x), polyToExpr(pscale(dd, qdiv(q(1), lc)), x))
}

/** Pythagorean identities: a·sin²u + a·cos²u → a, and 1 + tan²u → sec²u is left alone. */
function trigSimp(e: Expr): Expr {
  const r = rebuild(e, trigSimp)
  if (r.k !== 'add') return r
  const terms = r.a.slice()
  for (let i = 0; i < terms.length; i++) {
    const [ci, ri] = split(terms[i])
    if (!(ri.k === 'pow' && ri.b.k === 'fn' && ri.b.f === 'sin' && isNum(ri.e, 2))) continue
    for (let j = 0; j < terms.length; j++) {
      const [cj, rj] = split(terms[j])
      if (rj.k === 'pow' && rj.b.k === 'fn' && rj.b.f === 'cos' && isNum(rj.e, 2) && eq(rj.b.a, ri.b.a)) {
        const m = qnum(ci) <= qnum(cj) ? ci : cj
        const rest = terms.filter((_, k) => k !== i && k !== j)
        return trigSimp(add(...rest, num(m), mul(num(qsub(ci, m)), ri), mul(num(qsub(cj, m)), rj)))
      }
    }
  }
  return r
}

const size = (e: Expr) => str(e).length
/** Picks the shortest equivalent form among canonical, expanded, cancelled and factored. */
export function simplify(e: Expr, x?: string): Expr {
  const v = x ?? symbols(e)[0] ?? 'x'
  const cands: Expr[] = [trigSimp(e)]
  try { cands.push(trigSimp(expand(e))) } catch { /* too large */ }
  try { cands.push(cancel(e, v)) } catch { /* not rational */ }
  try { cands.push(factor(e, v)) } catch { /* not polynomial */ }
  return cands.reduce((b, c) => (size(c) < size(b) ? c : b))
}

// ───────────── differentiation ─────────────
export interface Step { text: string; tex?: string }

export function diff(e: Expr, x: string, steps?: Step[]): Expr {
  const d = (t: Expr) => diff(t, x, steps)
  const note = (rule: string, from: Expr, to: Expr) => {
    if (steps && steps.length < 14) steps.push({ text: rule, tex: `\\frac{d}{d${x}}\\left[${tex(from)}\\right] = ${tex(to)}` })
    return to
  }
  if (free(e, x)) return ZERO
  switch (e.k) {
    case 'sym': return ONE
    case 'add': return note('Sum rule: differentiate term by term', e, add(...e.a.map(d)))
    case 'mul': {
      const c = e.a.filter((f) => free(f, x)), v = e.a.filter((f) => !free(f, x))
      if (c.length) return mul(...c, d(mul(...v)))
      if (v.length === 1) return d(v[0])
      const terms = v.map((_, i) => mul(...v.map((f, j) => (i === j ? d(f) : f))))
      return note('Product rule', e, add(...terms))
    }
    case 'pow': {
      const { b, e: n } = e
      if (free(n, x)) {
        const r = mul(n, pow(b, sub(n, ONE)), d(b))
        return b.k === 'sym' ? r : note('Power rule + chain rule', e, r)
      }
      if (free(b, x)) return note(b.k === 'sym' && b.n === 'e' ? 'Exponential rule (eᵘ)′ = eᵘ·u′' : 'Exponential rule (aᵘ)′ = aᵘ·ln a·u′', e, mul(e, fn('ln', b), d(n)))
      return note('Logarithmic differentiation: (uᵛ)′ = uᵛ(v′ ln u + v u′/u)', e, mul(e, add(mul(d(n), fn('ln', b)), mul(n, d(b), pow(b, NEG1)))))
    }
    case 'fn': {
      const u = e.a
      const D: Record<string, () => Expr> = {
        sin: () => fn('cos', u), cos: () => neg(fn('sin', u)), tan: () => pow(fn('sec', u), num(2)), sec: () => mul(fn('sec', u), fn('tan', u)),
        csc: () => neg(mul(fn('csc', u), fn('cot', u))), cot: () => neg(pow(fn('csc', u), num(2))),
        asin: () => pow(sub(ONE, pow(u, num(2))), num(-1, 2)), acos: () => neg(pow(sub(ONE, pow(u, num(2))), num(-1, 2))), atan: () => pow(add(ONE, pow(u, num(2))), NEG1),
        sinh: () => fn('cosh', u), cosh: () => fn('sinh', u), tanh: () => pow(fn('cosh', u), num(-2)),
        asinh: () => pow(add(pow(u, num(2)), ONE), num(-1, 2)), acosh: () => pow(sub(pow(u, num(2)), ONE), num(-1, 2)), atanh: () => pow(sub(ONE, pow(u, num(2))), NEG1),
        ln: () => pow(u, NEG1), abs: () => div(u, fn('abs', u)),
      }
      if (!D[e.f]) throw new Error(`Cannot differentiate ${e.f}`)
      const r = mul(D[e.f](), d(u))
      return u.k === 'sym' ? note(`Derivative of ${e.f}`, e, r) : note(`Chain rule: ${e.f}′(u)·u′ with u = ${str(u)}`, e, r)
    }
    default: return ZERO
  }
}

// ───────────── integration ─────────────
const T = '_t'
const lnAbs = (u: Expr) => fn('ln', fn('abs', u))

/** Linear coefficients if e = a·x + b (a, b free of x). */
function linear(e: Expr, x: string): [Expr, Expr] | null {
  const c = polyCoeffs(e, x)
  if (!c || c.length !== 2 || isNum(c[1], 0)) return null
  return [c[1], c[0]]
}

function table(e: Expr, x: string): Expr | null {
  const X = sym(x)
  if (e.k === 'sym' && e.n === x) return mul(HALF, pow(X, num(2)))
  if (e.k === 'pow' && e.b.k === 'sym' && e.b.n === x && free(e.e, x)) return isNum(e.e, -1) ? lnAbs(X) : div(pow(X, add(e.e, ONE)), add(e.e, ONE))
  if (e.k === 'pow' && free(e.b, x) && e.e.k === 'sym' && e.e.n === x) return div(e, fn('ln', e.b))
  if (e.k === 'fn' && e.a.k === 'sym' && e.a.n === x) {
    const I: Record<string, () => Expr> = {
      sin: () => neg(fn('cos', X)), cos: () => fn('sin', X), tan: () => neg(lnAbs(fn('cos', X))), cot: () => lnAbs(fn('sin', X)),
      sec: () => lnAbs(add(fn('sec', X), fn('tan', X))), csc: () => neg(lnAbs(add(fn('csc', X), fn('cot', X)))),
      sinh: () => fn('cosh', X), cosh: () => fn('sinh', X), tanh: () => fn('ln', fn('cosh', X)),
      ln: () => sub(mul(X, fn('ln', X)), X), atan: () => sub(mul(X, fn('atan', X)), mul(HALF, fn('ln', add(pow(X, num(2)), ONE)))),
      asin: () => add(mul(X, fn('asin', X)), sqrt(sub(ONE, pow(X, num(2))))), acos: () => sub(mul(X, fn('acos', X)), sqrt(sub(ONE, pow(X, num(2))))),
      abs: () => mul(HALF, X, fn('abs', X)),
    }
    if (I[e.f]) return I[e.f]()
  }
  if (e.k === 'pow' && e.b.k === 'fn' && e.b.a.k === 'sym' && e.b.a.n === x) {
    const f = e.b.f, n = e.e
    if ((f === 'sec' && isNum(n, 2)) || (f === 'cos' && isNum(n, -2))) return fn('tan', X)
    if ((f === 'csc' && isNum(n, 2)) || (f === 'sin' && isNum(n, -2))) return neg(fn('cot', X))
    if (f === 'cosh' && isNum(n, -2)) return fn('tanh', X)
  }
  if (e.k === 'mul' && e.a.length === 2 && e.a.every((f) => f.k === 'fn' && f.a.k === 'sym' && f.a.n === x)) {
    const fs = e.a.map((f) => (f as { f: string }).f).sort().join(',')
    if (fs === 'sec,tan') return fn('sec', X)
    if (fs === 'cot,csc') return neg(fn('csc', X))
  }
  return null
}

/** (quadratic)^(−1/2) with rational coefficients: arcsin or log forms after completing the square. */
function invSqrtQuadratic(e: Expr, x: string): Expr | null {
  if (!(e.k === 'pow' && e.e.k === 'num' && qeq(e.e.q, q(-1, 2)))) return null
  const p = polyQ((e as { b: Expr }).b, x)
  if (!p || pdeg(p) !== 2) return null
  const [c, b, a] = p
  const X = sym(x)
  const h = qdiv(b, qmul(q(2), a)) // x + h
  const k = qsub(c, qdiv(qmul(b, b), qmul(q(4), a))) // a(x+h)² + k
  const t = add(X, num(h))
  if (qnum(a) < 0 && qnum(k) > 0) return mul(pow(num(qneg(a)), num(-1, 2)), fn('asin', mul(t, sqrt(num(qdiv(qneg(a), k))))))
  if (qnum(a) > 0) return mul(pow(num(a), num(-1, 2)), lnAbs(add(t, sqrt(add(pow(t, num(2)), num(qdiv(k, a)))))))
  return null
}

/** √(quadratic) with rational coefficients, after completing the square. */
function sqrtQuadratic(e: Expr, x: string): Expr | null {
  if (!(e.k === 'pow' && e.e.k === 'num' && qeq(e.e.q, q(1, 2)))) return null
  const p = polyQ(e.b, x)
  if (!p || pdeg(p) !== 2) return null
  const [c, b, a] = p
  const t = add(sym(x), num(qdiv(b, qmul(q(2), a))))
  const k = qsub(c, qdiv(qmul(b, b), qmul(q(4), a)))
  const m = qdiv(k, a) // a(t² + m)
  const root = sqrt(add(pow(t, num(2)), num(m)))
  if (qnum(a) > 0) return mul(sqrt(num(a)), add(mul(HALF, t, root), mul(num(qdiv(m, q(2))), lnAbs(add(t, root)))))
  if (qnum(k) > 0) {
    const c2 = qneg(m) // −a(c² − t²), c² = −m
    const r2 = sqrt(sub(num(c2), pow(t, num(2))))
    return mul(sqrt(num(qneg(a))), add(mul(HALF, t, r2), mul(num(qdiv(c2, q(2))), fn('asin', div(t, sqrt(num(c2)))))))
  }
  return null
}

/** e^(a x + b)·sin/cos(c x + d). */
function expTrig(e: Expr, x: string): Expr | null {
  if (e.k !== 'mul') return null
  const c = e.a.filter((f) => free(f, x)), v = e.a.filter((f) => !free(f, x))
  if (v.length !== 2) return null
  const ex = v.find((f) => f.k === 'pow' && f.b.k === 'sym' && f.b.n === 'e') as { b: Expr; e: Expr } | undefined
  const tr = v.find((f) => f.k === 'fn' && (f.f === 'sin' || f.f === 'cos')) as { f: string; a: Expr } | undefined
  if (!ex || !tr) return null
  const la = linear(ex.e, x), lb = linear(tr.a, x)
  if (!la || !lb) return null
  const [a] = la, [b] = lb
  const den = add(pow(a, num(2)), pow(b, num(2)))
  const S = fn('sin', tr.a), C = fn('cos', tr.a)
  const core = tr.f === 'sin' ? sub(mul(a, S), mul(b, C)) : add(mul(a, C), mul(b, S))
  return mul(...c, div(mul(pow(E, ex.e), core), den))
}

function isPoly(e: Expr, x: string) {
  const c = polyCoeffs(e, x)
  return !!c && c.length >= 2
}

/** Partial fractions for N/D with rational coefficients. */
function rationalIntegral(e: Expr, x: string, steps: Step[]): Expr | null {
  const [n, d] = numDen(e)
  const pn = polyQ(n, x), pd = polyQ(d, x)
  if (!pn || !pd || pdeg(pd) < 1) return null
  const X = sym(x)
  const g = pgcd(pn, pd)
  const N0 = pdivmod(pn, g)[0], D0 = pdivmod(pd, g)[0]
  const lc = D0[pdeg(D0)]
  const N = pscale(N0, qdiv(q(1), lc)), D = pscale(D0, qdiv(q(1), lc))
  const [quo, rem] = pdivmod(N, D)
  const parts: Expr[] = []
  if (pdeg(quo) >= 0) {
    parts.push(add(...quo.map((c, i) => mul(num(c), div(pow(X, num(i + 1)), num(i + 1))))))
    steps.push({ text: 'Polynomial long division', tex: `${tex(e)} = ${tex(polyToExpr(quo, x))} + ${tex(div(polyToExpr(rem, x), polyToExpr(D, x)))}` })
  }
  if (pdeg(rem) < 0) return add(...parts)
  const F = factorQ(D)
  if (F.rest) return null
  // basis polynomials D / factor^j and their integrals
  type Term = { kind: 'lin'; r: Q; j: number } | { kind: 'quad'; p: P; j: number; xcoef: boolean }
  const fac: [P, number, 'lin' | 'quad', Q | null][] = [...F.linear.map(([r, m]) => [[qneg(r), q(1)], m, 'lin', r] as [P, number, 'lin', Q]), ...F.quads.map(([p, m]) => [p, m, 'quad', null] as [P, number, 'quad', null])]
  const terms: Term[] = []
  const basis: P[] = []
  fac.forEach(([p, m, kind, r], fi) => {
    for (let j = 1; j <= m; j++) {
      // D / p^j
      let b: P = [q(1)]
      fac.forEach(([p2, m2], k) => {
        const times = k === fi ? m - j : m2
        for (let t = 0; t < times; t++) b = pmul(b, p2)
      })
      if (kind === 'lin') {
        terms.push({ kind: 'lin', r: r!, j })
        basis.push(b)
      } else {
        terms.push({ kind: 'quad', p, j, xcoef: true }, { kind: 'quad', p, j, xcoef: false })
        basis.push(pmul(b, [q(0), q(1)]), b)
      }
    }
  })
  const nU = basis.length, deg = pdeg(D)
  if (nU !== deg) return null
  // linear system: Σ c_i basis_i = rem
  const M = Array.from({ length: deg }, (_, row) => [...basis.map((b) => b[row] ?? q(0)), rem[row] ?? q(0)])
  for (let c = 0; c < nU; c++) {
    const piv = M.findIndex((r, i) => i >= c && !qz(r[c]))
    if (piv < 0) return null
    ;[M[c], M[piv]] = [M[piv], M[c]]
    for (let r = 0; r < deg; r++) {
      if (r === c || qz(M[r][c])) continue
      const f = qdiv(M[r][c], M[c][c])
      M[r] = M[r].map((v, k) => qsub(v, qmul(f, M[c][k])))
    }
  }
  const coef = M.map((r, i) => qdiv(r[nU], r[i]))
  const pfTerms: Expr[] = []
  for (let i = 0; i < terms.length; i++) {
    const t = terms[i]
    if (t.kind === 'lin') {
      const A = coef[i]
      if (qz(A)) continue
      const u = sub(X, num(t.r))
      pfTerms.push(div(num(A), pow(u, num(t.j))))
      parts.push(t.j === 1 ? mul(num(A), lnAbs(u)) : mul(num(qdiv(qneg(A), q(t.j - 1))), pow(u, num(1 - t.j))))
    } else if (t.xcoef) {
      const B = coef[i], C = coef[i + 1]
      i++
      if (qz(B) && qz(C)) continue
      const [c0, c1] = t.p // x² + c1 x + c0
      const Qx = polyToExpr(t.p, x)
      pfTerms.push(div(add(mul(num(B), X), num(C)), pow(Qx, num(t.j))))
      const disc = qsub(qmul(q(4), c0), qmul(c1, c1)) // 4q − p²
      const lin = qsub(C, qdiv(qmul(B, c1), q(2))) // C − Bp/2
      if (t.j === 1) {
        if (!qz(B)) parts.push(mul(num(qdiv(B, q(2))), fn('ln', qnum(disc) > 0 ? Qx : fn('abs', Qx))))
        if (!qz(lin)) {
          const s = sqrt(num(qnum(disc) > 0 ? disc : qneg(disc)))
          const z = add(mul(num(2), X), num(c1))
          parts.push(qnum(disc) > 0 ? mul(num(qmul(q(2), lin)), pow(s, NEG1), fn('atan', div(z, s))) : mul(num(lin), pow(s, NEG1), lnAbs(div(sub(z, s), add(z, s)))))
        }
      } else {
        if (qnum(disc) <= 0) return null
        // t = x + p/2, a² = disc/4
        const tt = add(X, num(qdiv(c1, q(2)))), a2 = qdiv(disc, q(4))
        const a = sqrt(num(a2))
        const S = add(pow(tt, num(2)), num(a2))
        if (!qz(B)) parts.push(mul(num(qdiv(qneg(B), q(2 * (t.j - 1)))), pow(S, num(1 - t.j))))
        // I_k recursion
        const Ik = (k: number): Expr => (k === 1 ? mul(pow(a, NEG1), fn('atan', div(tt, a))) : add(div(tt, mul(num(2 * (k - 1)), num(a2), pow(S, num(k - 1)))), mul(num(q(2 * k - 3, 2 * (k - 1))), num(qdiv(q(1), a2)), Ik(k - 1))))
        if (!qz(lin)) parts.push(mul(num(lin), Ik(t.j)))
      }
    }
  }
  steps.push({ text: 'Partial fraction decomposition', tex: `${tex(div(polyToExpr(rem, x), polyToExpr(D, x)))} = ${tex(add(...pfTerms))}` })
  return add(...parts)
}

/** Odd powers and squares of sin / cos / tan rewritten so substitution or the table applies. */
function trigRewrite(e: Expr): Expr {
  const r = rebuild(e, trigRewrite)
  if (r.k === 'pow' && r.b.k === 'fn' && r.e.k === 'num' && qint(r.e.q) && r.e.q.n >= 2n && r.e.q.n <= 12n) {
    const n = Number(r.e.q.n), u = r.b.a, f = r.b.f
    if (f === 'sin' || f === 'cos') {
      const other = fn(f === 'sin' ? 'cos' : 'sin', u)
      if (n % 2 === 1) return mul(r.b, pow(sub(ONE, pow(other, num(2))), num((n - 1) / 2)))
      const half = f === 'sin' ? mul(HALF, sub(ONE, fn('cos', mul(num(2), u)))) : mul(HALF, add(ONE, fn('cos', mul(num(2), u))))
      return pow(half, num(n / 2))
    }
    if (f === 'tan') return mul(pow(r.b, num(n - 2)), sub(pow(fn('sec', u), num(2)), ONE))
    if (f === 'cot') return mul(pow(r.b, num(n - 2)), sub(pow(fn('csc', u), num(2)), ONE))
  }
  return r
}

function candidates(e: Expr, x: string, out: Expr[] = []): Expr[] {
  const push = (c: Expr) => {
    if (!free(c, x) && !(c.k === 'sym' && c.n === x) && !out.some((o) => eq(o, c))) out.push(c)
  }
  if (e.k === 'fn') {
    push(e.a)
    push(e)
    candidates(e.a, x, out)
  } else if (e.k === 'pow') {
    push(e.b)
    if (!free(e.e, x)) push(e.e)
    if (e.e.k === 'num' && qint(e.e.q) && e.e.q.n > 1n) push(e)
    candidates(e.b, x, out)
    candidates(e.e, x, out)
  } else if (e.k === 'add' || e.k === 'mul') e.a.forEach((t) => candidates(t, x, out))
  return out
}

export interface IntResult { result: Expr | null; steps: Step[] }

let budget = 0
export function integrate(e0: Expr, x: string): IntResult {
  const steps: Step[] = []
  budget = 4000
  const r = integ(e0, x, steps, 0)
  return { result: r, steps }
}

function integ(e: Expr, x: string, steps: Step[], depth: number): Expr | null {
  if (depth > 7 || --budget < 0) return null
  const X = sym(x)
  const say = (text: string, t?: string) => {
    if (steps.length < 24) steps.push({ text, tex: t })
  }
  if (free(e, x)) return mul(e, X)
  if (e.k === 'add') {
    const parts = e.a.map((t) => integ(t, x, steps, depth + 1))
    if (parts.every(Boolean)) {
      if (depth === 0) say('Linearity: integrate term by term')
      return add(...(parts as Expr[]))
    }
  }
  if (e.k === 'mul') {
    const c = e.a.filter((f) => free(f, x)), v = e.a.filter((f) => !free(f, x))
    if (c.length) {
      const r = integ(mul(...v), x, steps, depth + 1)
      return r ? mul(...c, r) : null
    }
  }
  const t = table(e, x)
  if (t) {
    say('Standard integral', `\\int ${tex(e)}\\,d${x} = ${tex(t)}`)
    return t
  }
  const et = expTrig(e, x)
  if (et) {
    say('e^{ax}·sin/cos(bx): integrate by parts twice and solve for the integral', `\\int ${tex(e)}\\,d${x} = ${tex(et)}`)
    return et
  }
  const sq = sqrtQuadratic(e, x)
  if (sq) {
    say('Complete the square: standard integral of √(t² ± c²) / √(c² − t²)', `\\int ${tex(e)}\\,d${x} = ${tex(sq)}`)
    return sq
  }
  const iq = invSqrtQuadratic(e, x)
  if (iq) {
    say('Complete the square under the root', `\\int ${tex(e)}\\,d${x} = ${tex(iq)}`)
    return iq
  }
  // rational functions → partial fractions
  const [nn, dd] = numDen(e)
  if (polyQ(nn, x) && polyQ(dd, x) && !free(dd, x)) {
    const r = rationalIntegral(e, x, steps)
    if (r) return r
  }
  // u-substitution
  for (const u of candidates(e, x)) {
    const du = diff(u, x)
    if (isNum(du, 0)) continue
    let qd = div(e, du)
    for (const form of [qd, (() => { try { return cancel(qd, x) } catch { return qd } })()]) {
      qd = subs(form, u, sym(T))
      const lin = polyCoeffs(u, x)
      if (!free(qd, x) && lin && lin.filter((c) => !isNum(c, 0)).length === 2 && lin.every((c) => free(c, x))) {
        // u = a·x^k + b → replace x^k by (t − b)/a
        const k = lin.length - 1
        const a = lin[k], b = lin[0]
        if (lin.slice(1, k).every((c) => isNum(c, 0))) {
          const rep = div(sub(sym(T), b), a)
          qd = subs(qd, pow(X, num(k)), rep)
          for (let m = 2; m <= 6; m++) qd = subs(qd, pow(X, num(m * k)), pow(rep, num(m)))
          if (k === 1) qd = subs(qd, X, rep)
        }
      }
      if (free(qd, x)) {
        const sub1 = steps.length
        const G = integ(qd, T, steps, depth + 1)
        if (G) {
          steps.splice(sub1, 0, { text: `Substitute u = ${str(u)}, du = (${str(du)}) d${x}`, tex: `\\int ${tex(e)}\\,d${x} = \\int ${tex(subs(qd, sym(T), sym('u')))}\\,du` })
          return subs(G, sym(T), u)
        }
        break
      }
    }
  }
  // integration by parts
  if (e.k === 'mul' || e.k === 'fn') {
    const fs = e.k === 'mul' ? e.a : [e]
    const logi = fs.find((f) => f.k === 'fn' && ['ln', 'atan', 'asin', 'acos', 'asinh', 'atanh'].includes(f.f))
    const polyPart = fs.filter((f) => f !== logi)
    if (logi && (polyPart.length === 0 || isPoly(mul(...polyPart), x) || free(mul(...polyPart), x) || polyPart.every((f) => f.k === 'sym' || (f.k === 'pow' && f.b.k === 'sym' && free(f.e, x))))) {
      const dv = mul(...polyPart)
      const v = integ(dv, x, [], depth + 1)
      if (v) {
        const rest = integ(expand(mul(v, diff(logi, x))), x, steps, depth + 1)
        if (rest) {
          say(`Integration by parts: u = ${str(logi)}, dv = ${str(dv)} d${x}`, `\\int u\\,dv = uv - \\int v\\,du`)
          return sub(mul(logi, v), rest)
        }
      }
    }
    const P = fs.filter((f) => isPoly(f, x) || f.k === 'sym' || (f.k === 'pow' && f.b.k === 'sym' && f.b.n === x && f.e.k === 'num' && qint(f.e.q) && f.e.q.n > 0n))
    const rest = fs.filter((f) => !P.includes(f))
    if (P.length && rest.length) {
      const u = mul(...P), dv = mul(...rest)
      const ok = rest.length === 1 && ((dv.k === 'pow' && free(dv.b, x) && !!linear(dv.e, x)) || (dv.k === 'fn' && ['sin', 'cos', 'sinh', 'cosh'].includes(dv.f) && !!linear(dv.a, x)))
      if (ok) {
        const v = integ(dv, x, [], depth + 1)
        if (v) {
          const r2 = integ(expand(mul(diff(u, x), v)), x, steps, depth + 1)
          if (r2) {
            say(`Integration by parts: u = ${str(u)}, dv = ${str(dv)} d${x}`, `\\int u\\,dv = uv - \\int v\\,du`)
            return sub(mul(u, v), r2)
          }
        }
      }
    }
  }
  // trig power rewrites and expansion
  const tr = trigRewrite(e)
  if (!eq(tr, e)) {
    const ex = expand(tr)
    const r = integ(ex, x, steps, depth + 1)
    if (r) {
      say('Rewrite trig powers (Pythagorean / power-reduction identities)', `${tex(e)} = ${tex(ex)}`)
      return r
    }
  }
  let ex: Expr = e
  try { ex = expand(e) } catch { /* too big */ }
  if (!eq(ex, e)) {
    const r = integ(ex, x, steps, depth + 1)
    if (r) {
      say('Expand the integrand', `${tex(e)} = ${tex(ex)}`)
      return r
    }
  }
  return null
}

/** Checks F′ = f symbolically, then numerically at sample points. */
export function verifyAntiderivative(F: Expr, f: Expr, x: string): 'symbolic' | 'numeric' | 'failed' {
  const d = diff(F, x)
  try {
    if (isNum(simplify(sub(d, f), x), 0)) return 'symbolic'
  } catch { /* fall through */ }
  const others = symbols(f).filter((s) => s !== x)
  let ok = 0
  for (const t of [0.37, 1.13, 2.71, -0.83, 0.61, 1.9, -1.4]) {
    const env: Record<string, number> = { [x]: t }
    others.forEach((s, i) => (env[s] = 1.3 + 0.7 * i))
    const a = evalN(d, env), b = evalN(f, env)
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue
    if (Math.abs(a - b) > 1e-7 * (1 + Math.abs(b))) return 'failed'
    ok++
  }
  return ok >= 3 ? 'numeric' : 'failed'
}

/** Simpson's rule with adaptive refinement (for checking definite integrals). */
export function numIntegrate(f: (t: number) => number, a: number, b: number, n = 2000): number {
  const h = (b - a) / n
  let s = f(a) + f(b)
  for (let i = 1; i < n; i++) s += (i % 2 ? 4 : 2) * f(a + i * h)
  return (s * h) / 3
}

// ───────────── solving ─────────────
export interface Solution { value: Expr; numeric: number; im?: number; exact: boolean; note?: string }

function cubeRoot(e: Expr): Expr {
  return pow(e, num(1, 3))
}

export function solve(lhs: Expr, rhs: Expr, x: string, steps: Step[] = []): Solution[] {
  const f = sub(lhs, rhs)
  const [N, D] = numDen(f)
  const nexp = expand(N)
  const coeffs = polyCoeffs(nexp, x)
  const sols: Solution[] = []
  const okDen = (v: number) => {
    const dv = evalN(D, { [x]: v })
    return !(Number.isFinite(dv) && Math.abs(dv) < 1e-12)
  }
  const push = (value: Expr, note?: string) => {
    const v = evalN(value, {})
    if (Number.isFinite(v) && !okDen(v)) return
    if (sols.some((s) => eq(s.value, value))) return
    sols.push({ value, numeric: v, exact: true, note })
  }
  if (coeffs && coeffs.length > 1) {
    const deg = coeffs.length - 1
    const symbolic = coeffs.some((c) => c.k !== 'num')
    steps.push({ text: `Polynomial equation of degree ${deg}`, tex: `${tex(polyFromCoeffs(coeffs, x))} = 0` })
    if (symbolic) {
      if (deg === 1) push(neg(div(coeffs[0], coeffs[1])))
      else if (deg === 2) {
        const [c, b, a] = coeffs
        const disc = sub(pow(b, num(2)), mul(num(4), a, c))
        steps.push({ text: 'Quadratic formula', tex: `${x} = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a},\\quad b^2-4ac = ${tex(disc)}` })
        push(div(add(neg(b), sqrt(disc)), mul(num(2), a)))
        push(div(sub(neg(b), sqrt(disc)), mul(num(2), a)))
      } else throw new Error('Symbolic coefficients are supported up to degree 2')
      return sols
    }
    const p = ptrim(coeffs.map((c) => (c as { q: Q }).q))
    const { roots, rest } = rationalRoots(p)
    if (roots.length) steps.push({ text: 'Rational root theorem', tex: roots.map(([r, m]) => `${x} = ${tex(num(r))}${m > 1 ? `\\;(\\times ${m})` : ''}`).join(',\\quad ') })
    for (const [r, m] of roots) push(num(r), m > 1 ? `multiplicity ${m}` : undefined)
    const d = pdeg(rest)
    if (d === 1) push(num(qneg(qdiv(rest[0], rest[1]))))
    else if (d === 2) {
      const [c, b, a] = rest
      const disc = qsub(qmul(b, b), qmul(q(4), qmul(a, c)))
      steps.push({ text: 'Quadratic formula on the remaining factor', tex: `${tex(polyToExpr(rest, x))} = 0,\\quad \\Delta = ${tex(num(disc))}` })
      const s = sqrt(num(qnum(disc) < 0 ? qneg(disc) : disc))
      if (qnum(disc) >= 0) {
        push(div(add(num(qneg(b)), s), num(qmul(q(2), a))))
        push(div(sub(num(qneg(b)), s), num(qmul(q(2), a))))
      } else {
        const re = qdiv(qneg(b), qmul(q(2), a))
        const im = mul(s, num(qdiv(q(1), qmul(q(2), a))))
        for (const sg of [1, -1]) sols.push({ value: add(num(re), mul(num(sg), im, sym('i'))), numeric: qnum(re), im: sg * evalN(im), exact: true, note: 'complex' })
      }
    } else if (d === 3) {
      // depressed cubic t³ + pt + q (x = t − b/3a)
      const [d0, c1, b2, a3] = rest.map(qnum)
      const B = b2 / a3, C = c1 / a3, Dd = d0 / a3
      const pp = C - (B * B) / 3, qq = (2 * B * B * B) / 27 - (B * C) / 3 + Dd
      const disc = (qq * qq) / 4 + (pp * pp * pp) / 27
      const [qdd, qc, qb, qa] = rest
      const Pq = qsub(qdiv(qc, qa), qdiv(qmul(qb, qb), qmul(q(3), qmul(qa, qa))))
      const Qq = qadd(qsub(qdiv(qmul(q(2), qpow(qb, 3n)), qmul(q(27), qpow(qa, 3n))), qdiv(qmul(qb, qc), qmul(q(3), qmul(qa, qa)))), qdiv(qdd, qa))
      if (disc > 1e-12) {
        const inner = sqrt(add(div(pow(num(Qq), num(2)), num(4)), div(pow(num(Pq), num(3)), num(27))))
        const root = sub(add(cubeRoot(add(neg(div(num(Qq), num(2))), inner)), cubeRoot(sub(neg(div(num(Qq), num(2))), inner))), div(num(qdiv(qb, qa)), num(3)))
        steps.push({ text: 'Cardano’s formula (one real root)', tex: `${x} = ${tex(root)}` })
        push(root)
        // complex pair numerically
        const r = evalN(root)
        const [, b1, c0] = [1, B + r, C + r * (B + r)]
        const dd2 = b1 * b1 - 4 * c0
        if (dd2 < 0) for (const sg of [1, -1]) sols.push({ value: sym('?'), numeric: -b1 / 2, im: (sg * Math.sqrt(-dd2)) / 2, exact: false, note: 'complex' })
      } else {
        // three real roots: trigonometric method
        steps.push({ text: 'Three real roots (casus irreducibilis): trigonometric method' })
        const m = 2 * Math.sqrt(-pp / 3)
        const th = Math.acos(Math.max(-1, Math.min(1, (3 * qq) / (pp * m)))) / 3
        for (let k = 0; k < 3; k++) {
          const t = m * Math.cos(th - (2 * Math.PI * k) / 3) - B / 3
          sols.push({ value: num(0), numeric: t, exact: false })
        }
      }
    } else if (d >= 4) {
      steps.push({ text: `Degree ${d} factor: roots found numerically (Aberth iteration)` })
      for (const [re, im] of complexRoots(rest.map(qnum))) sols.push({ value: sym('?'), numeric: re, im: Math.abs(im) > 1e-9 ? im : undefined, exact: false, note: Math.abs(im) > 1e-9 ? 'complex' : undefined })
    }
    return sols.sort((a, b) => (a.im ? 1 : 0) - (b.im ? 1 : 0) || a.numeric - b.numeric)
  }
  // isolate a single occurrence of x
  const iso = isolate(f, ZERO, x, steps)
  if (iso.length) {
    iso.forEach((v) => push(v))
    return sols
  }
  steps.push({ text: 'No closed form found: real roots located numerically on [−50, 50] (sign changes + bisection, then Newton polish)' })
  return numericRoots(f, x).map((v) => ({ value: num(0), numeric: v, exact: false }))
}

function polyFromCoeffs(c: Expr[], x: string): Expr {
  return add(...c.map((k, i) => mul(k, pow(sym(x), num(i)))))
}

function isolate(l: Expr, r: Expr, x: string, steps: Step[]): Expr[] {
  for (let guard = 0; guard < 20; guard++) {
    if (l.k === 'sym' && l.n === x) return [r]
    if (l.k === 'add') {
      const dep = l.a.filter((t) => !free(t, x))
      if (dep.length !== 1) return []
      r = sub(r, add(...l.a.filter((t) => free(t, x))))
      l = dep[0]
    } else if (l.k === 'mul') {
      const dep = l.a.filter((t) => !free(t, x))
      if (dep.length !== 1) return []
      r = div(r, mul(...l.a.filter((t) => free(t, x))))
      l = dep[0]
    } else if (l.k === 'pow') {
      if (free(l.e, x)) {
        const inv = pow(r, pow(l.e, NEG1))
        if (l.e.k === 'num' && l.e.q.n % 2n === 0n && qint(l.e.q)) {
          const a = isolate(l.b, inv, x, steps), b = isolate(l.b, neg(inv), x, steps)
          return [...a, ...b]
        }
        r = inv
        l = l.b
      } else if (free(l.b, x)) {
        r = div(fn('ln', r), fn('ln', l.b))
        l = l.e
      } else return []
    } else if (l.k === 'fn') {
      const inv: Record<string, (v: Expr) => Expr> = { ln: (v) => pow(E, v), sin: (v) => fn('asin', v), cos: (v) => fn('acos', v), tan: (v) => fn('atan', v), asin: (v) => fn('sin', v), acos: (v) => fn('cos', v), atan: (v) => fn('tan', v), sinh: (v) => fn('asinh', v), cosh: (v) => fn('acosh', v), tanh: (v) => fn('atanh', v) }
      if (!inv[l.f]) return []
      if (['sin', 'cos', 'tan'].includes(l.f) && !steps.some((s) => s.text.startsWith('Principal'))) steps.push({ text: `Principal value only: ${l.f} is periodic, add multiples of ${l.f === 'tan' ? 'π' : '2π'} (and the mirrored solution for sin/cos) for the general solution` })
      r = inv[l.f](r)
      l = l.a
    } else return []
  }
  return []
}

export function complexRoots(c: number[]): [number, number][] {
  const n = c.length - 1
  const a = c.map((v) => v / c[n])
  type C = [number, number]
  const mulc = (p: C, s: C): C => [p[0] * s[0] - p[1] * s[1], p[0] * s[1] + p[1] * s[0]]
  const divc = (p: C, s: C): C => {
    const d = s[0] * s[0] + s[1] * s[1]
    return [(p[0] * s[0] + p[1] * s[1]) / d, (p[1] * s[0] - p[0] * s[1]) / d]
  }
  const ev = (z: C, co: number[]): C => co.reduceRight<C>((s, k) => [mulc(s, z)[0] + k, mulc(s, z)[1]], [0, 0])
  const da = a.slice(1).map((v, i) => v * (i + 1))
  const R = 1 + Math.max(...a.slice(0, n).map(Math.abs))
  let z: C[] = Array.from({ length: n }, (_, k) => [0.5 * R * Math.cos((2 * Math.PI * k) / n + 0.4), 0.5 * R * Math.sin((2 * Math.PI * k) / n + 0.4)])
  for (let it = 0; it < 400; it++) {
    z = z.map((zi, i) => {
      const ratio = divc(ev(zi, a), ev(zi, da))
      let s: C = [0, 0]
      z.forEach((zj, j) => {
        if (j !== i) {
          const t = divc([1, 0], [zi[0] - zj[0], zi[1] - zj[1]])
          s = [s[0] + t[0], s[1] + t[1]]
        }
      })
      const w = divc(ratio, [1 - mulc(ratio, s)[0], -mulc(ratio, s)[1]])
      return Number.isFinite(w[0]) ? [zi[0] - w[0], zi[1] - w[1]] : zi
    })
  }
  return z.map(([re, im]) => [Math.abs(re) < 1e-12 ? 0 : re, Math.abs(im) < 1e-9 ? 0 : im])
}

export function numericRoots(f: Expr, x: string, lo = -50, hi = 50, n = 20000): number[] {
  const g = (t: number) => evalN(f, { [x]: t })
  const out: number[] = []
  const add1 = (v: number) => {
    if (Number.isFinite(v) && Math.abs(g(v)) < 1e-8 * (1 + Math.abs(v)) && !out.some((o) => Math.abs(o - v) < 1e-6 * (1 + Math.abs(v)))) out.push(v)
  }
  let px = lo, py = g(lo)
  for (let i = 1; i <= n; i++) {
    const cx = lo + ((hi - lo) * i) / n, cy = g(cx)
    if (Number.isFinite(py) && Number.isFinite(cy)) {
      if (py === 0) add1(px)
      else if (py * cy < 0) {
        let a = px, b = cx, fa = py
        for (let k = 0; k < 80; k++) {
          const m = (a + b) / 2, fm = g(m)
          if (fa * fm <= 0) b = m
          else {
            a = m
            fa = fm
          }
        }
        const v = (a + b) / 2
        if (Math.abs(g(v)) < 1e-6 * (1 + Math.abs(py) + Math.abs(cy))) add1(v)
      }
    }
    px = cx
    py = cy
  }
  return out.sort((a, b) => a - b).slice(0, 40)
}

// ───────────── LaTeX ─────────────
const GREEK_TEX = new Set([...GREEK])
const FN_TEX: Record<string, string> = { sin: '\\sin', cos: '\\cos', tan: '\\tan', sec: '\\sec', csc: '\\csc', cot: '\\cot', asin: '\\arcsin', acos: '\\arccos', atan: '\\arctan', sinh: '\\sinh', cosh: '\\cosh', tanh: '\\tanh', asinh: '\\operatorname{arsinh}', acosh: '\\operatorname{arcosh}', atanh: '\\operatorname{artanh}', ln: '\\ln' }

const negative = (e: Expr) => (e.k === 'num' && e.q.n < 0n) || (e.k === 'mul' && e.a[0].k === 'num' && e.a[0].q.n < 0n)

export function tex(e: Expr): string {
  switch (e.k) {
    case 'num': {
      const { n, d } = e.q
      if (d === 1n) return String(n)
      return `${n < 0n ? '-' : ''}\\frac{${babs(n)}}{${d}}`
    }
    case 'sym':
      return e.n === 'pi' ? '\\pi' : GREEK_TEX.has(e.n) ? `\\${e.n}` : e.n === T ? 'u' : e.n.length > 1 && !/^[a-z]\d+$/i.test(e.n) ? `\\mathrm{${e.n}}` : e.n.replace(/^([a-z])(\d+)$/i, '$1_{$2}')
    case 'add':
      return e.a.map((t, i) => (i === 0 ? tex(t) : negative(t) ? ` - ${tex(neg(t))}` : ` + ${tex(t)}`)).join('')
    case 'fn': {
      if (e.f === 'abs') return `\\left|${tex(e.a)}\\right|`
      return `${FN_TEX[e.f] ?? `\\operatorname{${e.f}}`}\\left(${tex(e.a)}\\right)`
    }
    case 'pow': {
      const { b, e: x } = e
      if (x.k === 'num' && x.q.n < 0n) return `\\frac{1}{${tex(pow(b, num(qneg(x.q))))}}`
      if (x.k === 'num' && x.q.n === 1n && x.q.d === 2n) return `\\sqrt{${tex(b)}}`
      if (x.k === 'num' && x.q.n === 1n && x.q.d === 3n) return `\\sqrt[3]{${tex(b)}}`
      if (b.k === 'fn' && b.f !== 'abs' && x.k === 'num' && qint(x.q) && x.q.n > 0n) return `${FN_TEX[b.f] ?? `\\operatorname{${b.f}}`}^{${tex(x)}}\\left(${tex(b.a)}\\right)`
      const bt = b.k === 'sym' || (b.k === 'num' && b.q.d === 1n && b.q.n >= 0n) || b.k === 'fn' && b.f === 'abs' ? tex(b) : `\\left(${tex(b)}\\right)`
      return `${bt}^{${tex(x)}}`
    }
    case 'mul': {
      let c = q(1)
      const top: Expr[] = [], bot: Expr[] = []
      for (const f of e.a) {
        if (f.k === 'num') c = f.q
        else if (f.k === 'pow' && f.e.k === 'num' && f.e.q.n < 0n) bot.push(pow(f.b, num(qneg(f.e.q))))
        else top.push(f)
      }
      const sign = c.n < 0n ? '-' : ''
      const cn = babs(c.n), cd = c.d
      const frac = bot.length > 0 || cd !== 1n
      const join = (fs: Expr[], coef: bigint) => {
        const bare = frac && fs.length === 1 && coef === 1n // sole factor of a numerator/denominator needs no parentheses
        const parts = fs.map((f) => (f.k === 'add' && !bare ? `\\left(${tex(f)}\\right)` : tex(f)))
        let s = coef !== 1n || parts.length === 0 ? String(coef) : ''
        for (const p of parts) s += (s ? (/^\d/.test(p) ? ' \\cdot ' : ' ') : '') + p
        return s
      }
      if (frac) return `${sign}\\frac{${join(top, cn)}}{${join(bot, cd)}}`
      return sign + join(top, cn)
    }
  }
}
