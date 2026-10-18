// A small spreadsheet formula engine: A1 references, ranges, Excel operator precedence, array broadcasting,
// ~80 common functions with Excel-style error values, and a dependency graph. Written for this project.

export class XErr {
  code: string
  constructor(code: string) { this.code = code }
  toString() { return this.code }
}
export const E = { div0: '#DIV/0!', na: '#N/A', name: '#NAME?', num: '#NUM!', ref: '#REF!', value: '#VALUE!', circ: '#CIRC!', nul: '#NULL!' } as const
export const ERR_HELP: Record<string, string> = {
  '#DIV/0!': 'A number was divided by zero (or by an empty cell).',
  '#N/A': 'A lookup did not find the value you asked for.',
  '#NAME?': 'Unknown function or name — check the spelling, and put text in "double quotes".',
  '#NUM!': 'The numbers are out of range for this function (e.g. square root of a negative number).',
  '#REF!': 'A reference points outside the grid or an index is out of range.',
  '#VALUE!': 'Wrong type of value — for example text where a number was expected.',
  '#CIRC!': 'Circular reference: the formula depends on its own result (Excel shows a warning and 0).',
  '#NULL!': 'Invalid range intersection.',
}
export type Scalar = number | string | boolean | null | XErr
export interface Arr { arr: Scalar[][] }
export type V = Scalar | Arr
export const isArr = (v: V): v is Arr => typeof v === 'object' && v !== null && !(v instanceof XErr)
const fail = (code: string): never => { throw new XErr(code) }

// ---------- A1 helpers ----------

export const colName = (c: number) => { let s = ''; c++; while (c > 0) { s = String.fromCharCode(65 + ((c - 1) % 26)) + s; c = Math.floor((c - 1) / 26) } return s }
export const colIndex = (s: string) => [...s.toUpperCase()].reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0) - 1
export const key = (r: number, c: number) => `${colName(c)}${r + 1}`
export function parseRef(a1: string): { r: number; c: number } | null {
  const m = /^\$?([A-Za-z]{1,3})\$?(\d+)$/.exec(a1)
  return m ? { r: +m[2] - 1, c: colIndex(m[1]) } : null
}

// ---------- tokenizer + parser ----------

type Tok = { t: 'num'; v: number } | { t: 'str'; v: string } | { t: 'bool'; v: boolean } | { t: 'err'; v: string } | { t: 'ref'; v: string } | { t: 'fn'; v: string } | { t: 'name'; v: string } | { t: 'op'; v: string }

export function tokenize(src: string): Tok[] {
  const out: Tok[] = []
  let i = 0
  while (i < src.length) {
    const rest = src.slice(i)
    let m: RegExpExecArray | null
    if ((m = /^\s+/.exec(rest))) { i += m[0].length; continue }
    if ((m = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(rest))) out.push({ t: 'num', v: parseFloat(m[0]) })
    else if ((m = /^"((?:[^"]|"")*)"/.exec(rest))) out.push({ t: 'str', v: m[1].replace(/""/g, '"') })
    else if ((m = /^#(DIV\/0!|N\/A|NAME\?|NUM!|REF!|VALUE!|NULL!|CIRC!)/i.exec(rest))) out.push({ t: 'err', v: m[0].toUpperCase() })
    else if ((m = /^([A-Za-z_][A-Za-z0-9_.]*)(?=\s*\()/.exec(rest))) out.push({ t: 'fn', v: m[1].toUpperCase() })
    else if ((m = /^\$?[A-Za-z]{1,3}\$?\d+(?![A-Za-z0-9_])/.exec(rest))) out.push({ t: 'ref', v: m[0].toUpperCase() })
    else if ((m = /^(TRUE|FALSE)(?![A-Za-z0-9_])/i.exec(rest))) out.push({ t: 'bool', v: m[1].toUpperCase() === 'TRUE' })
    else if ((m = /^[A-Za-z_][A-Za-z0-9_.]*/.exec(rest))) out.push({ t: 'name', v: m[0] })
    else if ((m = /^(<=|>=|<>|[-+*/^&=<>%(),;:])/.exec(rest))) out.push({ t: 'op', v: m[0] === ';' ? ',' : m[0] })
    else throw new SyntaxError(`Unexpected character “${rest[0]}” at position ${i + 1}`)
    i += m[0].length
  }
  return out
}

export type Node =
  | { k: 'num'; v: number } | { k: 'str'; v: string } | { k: 'bool'; v: boolean } | { k: 'err'; v: string } | { k: 'miss' } | { k: 'name'; v: string }
  | { k: 'ref'; r: number; c: number } | { k: 'range'; r0: number; c0: number; r1: number; c1: number }
  | { k: 'fn'; name: string; args: Node[] } | { k: 'bin'; op: string; a: Node; b: Node } | { k: 'un'; op: string; a: Node } | { k: 'pct'; a: Node }

export function parse(src: string): Node {
  const toks = tokenize(src.replace(/^=/, ''))
  let p = 0
  const peek = () => toks[p]
  const isOp = (v: string) => peek()?.t === 'op' && (peek() as { v: string }).v === v
  const expect = (v: string) => { if (!isOp(v)) throw new SyntaxError(`Expected “${v}”${peek() ? '' : ' before the end of the formula'}`); p++ }
  const bin = (next: () => Node, ops: string[]) => () => {
    let a = next()
    while (peek()?.t === 'op' && ops.includes((peek() as { v: string }).v)) {
      const op = (toks[p++] as { v: string }).v
      a = { k: 'bin', op, a, b: next() }
    }
    return a
  }
  const primary = (): Node => {
    const t = toks[p++]
    if (!t) throw new SyntaxError('Formula ends too early')
    switch (t.t) {
      case 'num': return { k: 'num', v: t.v }
      case 'str': return { k: 'str', v: t.v }
      case 'bool': return { k: 'bool', v: t.v }
      case 'err': return { k: 'err', v: t.v }
      case 'name': return { k: 'name', v: t.v }
      case 'ref': {
        const a = parseRef(t.v)!
        if (isOp(':')) {
          p++
          const t2 = toks[p++]
          if (t2?.t !== 'ref') throw new SyntaxError('A range needs a cell after “:”, e.g. A1:B5')
          const b = parseRef(t2.v)!
          return { k: 'range', r0: Math.min(a.r, b.r), c0: Math.min(a.c, b.c), r1: Math.max(a.r, b.r), c1: Math.max(a.c, b.c) }
        }
        return { k: 'ref', ...a }
      }
      case 'fn': {
        expect('(')
        const args: Node[] = []
        if (isOp(')')) { p++; return { k: 'fn', name: t.v, args } }
        for (;;) {
          args.push(isOp(',') || isOp(')') ? { k: 'miss' } : compare())
          if (isOp(',')) { p++; continue }
          expect(')')
          return { k: 'fn', name: t.v, args }
        }
      }
      case 'op':
        if (t.v === '(') { const e = compare(); expect(')'); return e }
        if (t.v === '-' || t.v === '+') return { k: 'un', op: t.v, a: postfix() }
        throw new SyntaxError(`Unexpected “${t.v}”`)
    }
  }
  const postfix = (): Node => { let a = primary(); while (isOp('%')) { p++; a = { k: 'pct', a } } return a }
  const pow = bin(postfix, ['^'])
  const mul = bin(pow, ['*', '/'])
  const add = bin(mul, ['+', '-'])
  const cat = bin(add, ['&'])
  const compare: () => Node = bin(cat, ['=', '<>', '<', '>', '<=', '>='])
  const root = compare()
  if (p < toks.length) throw new SyntaxError(`Unexpected “${'v' in toks[p] ? String((toks[p] as { v: unknown }).v) : '?'}” after a complete expression`)
  return root
}

/** Formula text for a node (used by the step-by-step explanation). */
export function show(n: Node): string {
  switch (n.k) {
    case 'num': return String(n.v)
    case 'str': return `"${n.v.replace(/"/g, '""')}"`
    case 'bool': return n.v ? 'TRUE' : 'FALSE'
    case 'err': return n.v
    case 'miss': return ''
    case 'name': return n.v
    case 'ref': return key(n.r, n.c)
    case 'range': return `${key(n.r0, n.c0)}:${key(n.r1, n.c1)}`
    case 'fn': return `${n.name}(${n.args.map(show).join(', ')})`
    case 'bin': return `${show(n.a)}${n.op}${show(n.b)}`
    case 'un': return `${n.op}${show(n.a)}`
    case 'pct': return `${show(n.a)}%`
  }
}

export function refsOf(n: Node, out: string[] = [], cap = 5000): string[] {
  if (n.k === 'ref') out.push(key(n.r, n.c))
  else if (n.k === 'range') { for (let r = n.r0; r <= n.r1 && out.length < cap; r++) for (let c = n.c0; c <= n.c1; c++) out.push(key(r, c)) }
  else if (n.k === 'fn') n.args.forEach((a) => refsOf(a, out, cap))
  else if (n.k === 'bin') { refsOf(n.a, out, cap); refsOf(n.b, out, cap) }
  else if (n.k === 'un' || n.k === 'pct') refsOf(n.a, out, cap)
  return out
}

// ---------- coercion ----------

const DAY0 = Date.UTC(1899, 11, 30)
export const toSerial = (y: number, m: number, d: number) => Math.round((Date.UTC(y, m - 1, d) - DAY0) / 864e5)
export const fromSerial = (s: number) => new Date(DAY0 + Math.floor(s) * 864e5)

export function general(v: Scalar): string {
  if (v === null) return ''
  if (v instanceof XErr) return v.code
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'
  if (typeof v === 'string') return v
  if (!Number.isFinite(v)) return E.num
  if (Number.isInteger(v) && Math.abs(v) < 1e15) return String(v)
  const a = Math.abs(v)
  if (a >= 1e11 || a < 1e-9) return v.toExponential(5).replace(/\.?0+e/, 'E').replace('E+', 'E+')
  return String(Number(v.toPrecision(10)))
}

/** Converts a typed cell input: numbers, percentages, booleans, ISO dates → serials; otherwise text. */
export function literal(raw: string): Scalar {
  const s = raw.trim()
  if (s === '') return null
  if (/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(s)) return parseFloat(s)
  if (/^[-+]?(\d+\.?\d*|\.\d+)%$/.test(s)) return parseFloat(s) / 100
  if (/^(true|false)$/i.test(s)) return s.toUpperCase() === 'TRUE'
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (d) return toSerial(+d[1], +d[2], +d[3])
  return raw
}

function scalar(v: V): Scalar {
  if (isArr(v)) return v.arr[0]?.[0] ?? null
  return v
}
export function num(v: V): number {
  const s = scalar(v)
  if (s instanceof XErr) throw s
  if (s === null) return 0
  if (typeof s === 'boolean') return s ? 1 : 0
  if (typeof s === 'number') return s
  const t = literal(s)
  if (typeof t === 'number') return t
  return fail(E.value)
}
export function str(v: V): string {
  const s = scalar(v)
  if (s instanceof XErr) throw s
  return general(s)
}
export function bool(v: V): boolean {
  const s = scalar(v)
  if (s instanceof XErr) throw s
  if (typeof s === 'string') { if (/^true$/i.test(s)) return true; if (/^false$/i.test(s)) return false; return fail(E.value) }
  return !!s
}
const flat = (v: V): Scalar[] => (isArr(v) ? v.arr.flat() : [v])
const grid = (v: V): Scalar[][] => (isArr(v) ? v.arr : [[v]])

/** Numbers for SUM-like functions: from ranges only real numbers count; direct arguments are coerced. */
function numbers(args: V[]): number[] {
  const out: number[] = []
  for (const a of args) {
    if (isArr(a)) for (const x of a.arr.flat()) { if (x instanceof XErr) throw x; if (typeof x === 'number') out.push(x) }
    else if (a !== null) out.push(num(a))
  }
  return out
}

/** Excel ordering: numbers < text < booleans; text compares case-insensitively. Returns -1/0/1. */
export function cmp(a: Scalar, b: Scalar): number {
  if (a instanceof XErr) throw a
  if (b instanceof XErr) throw b
  if (a === null) a = typeof b === 'string' ? '' : typeof b === 'boolean' ? false : 0
  if (b === null) b = typeof a === 'string' ? '' : typeof a === 'boolean' ? false : 0
  const rank = (x: Scalar) => (typeof x === 'number' ? 0 : typeof x === 'string' ? 1 : 2)
  if (rank(a) !== rank(b)) return rank(a) < rank(b) ? -1 : 1
  if (typeof a === 'string') { const x = a.toLowerCase(), y = (b as string).toLowerCase(); return x < y ? -1 : x > y ? 1 : 0 }
  return (a as number) < (b as number) ? -1 : (a as number) > (b as number) ? 1 : 0
}

const wild = (pat: string) => new RegExp('^' + pat.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/~\*/g, '\uE000').replace(/~\?/g, '\uE001').replace(/\*/g, '.*').replace(/\?/g, '.').replace(/\uE000/g, '\\*').replace(/\uE001/g, '\\?') + '$', 'i')

/** Builds a test for COUNTIF-style criteria such as 5, ">=10", "<>North", "Wid*". */
export function criterion(c: Scalar): (x: Scalar) => boolean {
  if (c instanceof XErr) throw c
  if (typeof c === 'number' || typeof c === 'boolean') return (x) => x !== null && !(x instanceof XErr) && cmp(typeof x === 'string' && typeof c === 'number' ? (literal(x) as Scalar) : x, c) === 0
  const s = c === null ? '' : c
  const m = /^(<=|>=|<>|<|>|=)?(.*)$/s.exec(s)!
  const op = m[1] ?? '=', rhsRaw = m[2]
  const rhs = literal(rhsRaw)
  if (typeof rhs === 'number' || typeof rhs === 'boolean') {
    return (x) => {
      if (x instanceof XErr) return false
      const xv = typeof x === 'string' ? literal(x) : x
      if (typeof xv !== typeof rhs) return op === '<>'
      const r = cmp(xv, rhs)
      return op === '=' ? r === 0 : op === '<>' ? r !== 0 : op === '<' ? r < 0 : op === '>' ? r > 0 : op === '<=' ? r <= 0 : r >= 0
    }
  }
  const text = rhsRaw
  if (op === '=' || op === '<>') {
    const re = wild(text)
    const eq = (x: Scalar) => (text === '' ? x === null || x === '' : typeof x === 'string' && re.test(x))
    return op === '=' ? eq : (x) => !eq(x)
  }
  return (x) => typeof x === 'string' && ((r) => (op === '<' ? r < 0 : op === '>' ? r > 0 : op === '<=' ? r <= 0 : r >= 0))(cmp(x, text))
}

// ---------- TEXT() formatting ----------

const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function formatValue(v: number, fmt: string): string {
  const secs = fmt.split(/;(?=(?:[^"]*"[^"]*")*[^"]*$)/)
  let f = secs[0]
  if (v < 0 && secs[1] !== undefined) { f = secs[1]; v = -v } else if (v === 0 && secs[2] !== undefined) f = secs[2]
  const bare = f.replace(/"[^"]*"|\\./g, '')
  if (/[yd]|m{3,}|h|s/i.test(bare) && !/[0#]/.test(bare)) {
    const dt = fromSerial(v)
    const frac = v - Math.floor(v)
    const tot = Math.round(frac * 86400)
    const H = Math.floor(tot / 3600), Mi = Math.floor((tot % 3600) / 60), S = tot % 60
    const ampm = /AM\/PM/i.test(f)
    const toks = f.match(/"[^"]*"|\\.|yyyy|yy|mmmm|mmm|mm|m|dddd|ddd|dd|d|hh|h|ss|s|AM\/PM|./gi) ?? []
    return toks.map((t, i) => {
      const l = t.toLowerCase()
      const near = (re: RegExp) => toks.slice(Math.max(0, i - 3), i).some((x) => re.test(x)) || toks.slice(i + 1, i + 4).some((x) => /^s+$/i.test(x))
      const h12 = ampm ? ((H + 11) % 12) + 1 : H
      switch (l) {
        case 'yyyy': return String(dt.getUTCFullYear())
        case 'yy': return String(dt.getUTCFullYear()).slice(-2)
        case 'mmmm': return MON[dt.getUTCMonth()]
        case 'mmm': return MON[dt.getUTCMonth()].slice(0, 3)
        case 'mm': return near(/^h+$/i) ? String(Mi).padStart(2, '0') : String(dt.getUTCMonth() + 1).padStart(2, '0')
        case 'm': return near(/^h+$/i) ? String(Mi) : String(dt.getUTCMonth() + 1)
        case 'dddd': return DOW[dt.getUTCDay()]
        case 'ddd': return DOW[dt.getUTCDay()].slice(0, 3)
        case 'dd': return String(dt.getUTCDate()).padStart(2, '0')
        case 'd': return String(dt.getUTCDate())
        case 'hh': return String(h12).padStart(2, '0')
        case 'h': return String(h12)
        case 'ss': return String(S).padStart(2, '0')
        case 's': return String(S)
        case 'am/pm': return H < 12 ? 'AM' : 'PM'
        default: return t.startsWith('"') ? t.slice(1, -1) : t.startsWith('\\') ? t.slice(1) : t
      }
    }).join('')
  }
  const masked = f.replace(/"[^"]*"|\\./g, (q) => '\u0000'.repeat(q.length))
  const m = /[#0?][#0?,]*(\.[#0?]*)?(E[+-]0+)?|\.[#0?]+/i.exec(masked)
  const lit = (q: string) => q.replace(/"([^"]*)"/g, '$1').replace(/\\(.)/g, '$1')
  if (!m) return lit(f)
  const pre = lit(f.slice(0, m.index)), post = lit(f.slice(m.index + m[0].length))
  const pat = m[0]
  let x = v
  if (/%/.test(bare)) x *= 100
  const dec = (pat.split('.')[1] ?? '').replace(/E.*/i, '')
  const minDec = (dec.match(/0/g) ?? []).length, maxDec = dec.length
  if (/E[+-]/i.test(pat)) {
    const [mant, ex] = x.toExponential(maxDec).split('e')
    return pre + mant + 'E' + (+ex < 0 ? '-' : '+') + String(Math.abs(+ex)).padStart((pat.split(/E[+-]/i)[1] ?? '00').length, '0') + post
  }
  let s = roundHalf(Math.abs(x), maxDec).toFixed(maxDec)
  if (maxDec > minDec) s = s.replace(new RegExp(`0{1,${maxDec - minDec}}$`), '').replace(/\.$/, '')
  let [ip, fp] = s.split('.')
  const minInt = (pat.split('.')[0].match(/0/g) ?? []).length
  if (ip === '0' && minInt === 0) ip = ''
  ip = ip.padStart(minInt, '0')
  if (/,/.test(pat.split('.')[0])) ip = ip.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const sign = x < 0 && secs[1] === undefined ? '-' : ''
  return sign + pre + ip + (fp ? '.' + fp : '') + post
}

export function roundHalf(x: number, d: number): number {
  const s = Math.sign(x), a = Math.abs(x)
  if (d >= 0) return s * Number(Math.round(Number(`${a}e${d}`)) + `e-${d}`)
  const p = 10 ** -d
  return s * Math.round(a / p) * p
}

// ---------- functions ----------

type Thunk = () => V
type Fn = (a: Thunk[], ctx: { now: Date }) => V
const all = (a: Thunk[]) => a.map((t) => t())
const need = (a: Thunk[], lo: number, hi = lo) => { if (a.length < lo || a.length > hi) fail(E.value) }
const agg = (f: (xs: number[]) => number) => (a: Thunk[]) => f(numbers(all(a)))
const ifs = (pairs: Thunk[], start: number): ((i: number) => boolean) => {
  const tests: { range: Scalar[]; test: (x: Scalar) => boolean }[] = []
  for (let i = start; i + 1 < pairs.length; i += 2) tests.push({ range: flat(pairs[i]()), test: criterion(scalar(pairs[i + 1]())) })
  return (i) => tests.every((t) => t.test(t.range[i] ?? null))
}
const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : fail(E.div0))
const variance = (xs: number[], pop: boolean) => {
  if (xs.length < (pop ? 1 : 2)) fail(E.div0)
  const m = mean(xs)
  return xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - (pop ? 0 : 1))
}
const dateParts = (v: V) => { const n = num(v); if (n < 0) fail(E.num); return fromSerial(n) }
const addMonths = (s: number, m: number, eom: boolean) => {
  const d = fromSerial(s)
  const y = d.getUTCFullYear(), mo = d.getUTCMonth() + m
  const last = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate()
  return toSerial(y, mo + 1, eom ? last : Math.min(d.getUTCDate(), last))
}
function lookupIndex(v: Scalar, list: Scalar[], mode: number, wildcard: boolean): number {
  if (mode === 0) {
    const test = wildcard && typeof v === 'string' ? ((re: RegExp) => (x: Scalar) => typeof x === 'string' && re.test(x))(wild(v)) : (x: Scalar) => x !== null && !(x instanceof XErr) && cmp(x, v) === 0
    return list.findIndex(test)
  }
  // approximate: sorted ascending (mode 1 → largest ≤ v) or descending (mode −1 → smallest ≥ v)
  let best = -1
  for (let i = 0; i < list.length; i++) {
    const x = list[i]
    if (x === null || x instanceof XErr || typeof x !== typeof v) continue
    const r = cmp(x, v)
    if (mode > 0) { if (r <= 0) best = i; else break } else { if (r >= 0) best = i; else break }
  }
  return best
}

export const FN: Record<string, Fn> = {
  SUM: agg((x) => x.reduce((s, v) => s + v, 0)),
  AVERAGE: agg(mean),
  MIN: agg((x) => (x.length ? Math.min(...x) : 0)),
  MAX: agg((x) => (x.length ? Math.max(...x) : 0)),
  PRODUCT: agg((x) => x.reduce((s, v) => s * v, 1)),
  MEDIAN: agg((x) => { if (!x.length) fail(E.num); const s = [...x].sort((a, b) => a - b), h = s.length >> 1; return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2 }),
  'STDEV.S': agg((x) => Math.sqrt(variance(x, false))),
  STDEV: agg((x) => Math.sqrt(variance(x, false))),
  'STDEV.P': agg((x) => Math.sqrt(variance(x, true))),
  VAR: agg((x) => variance(x, false)),
  COUNT: (a) => all(a).flatMap(flat).filter((x) => typeof x === 'number').length,
  COUNTA: (a) => all(a).flatMap(flat).filter((x) => x !== null && x !== '').length,
  COUNTBLANK: (a) => all(a).flatMap(flat).filter((x) => x === null || x === '').length,
  LARGE: (a) => { need(a, 2); const xs = numbers([a[0]()]).sort((p, q) => q - p); const k = num(a[1]()); return k >= 1 && k <= xs.length ? xs[Math.ceil(k) - 1] : fail(E.num) },
  SMALL: (a) => { need(a, 2); const xs = numbers([a[0]()]).sort((p, q) => p - q); const k = num(a[1]()); return k >= 1 && k <= xs.length ? xs[Math.ceil(k) - 1] : fail(E.num) },
  RANK: (a) => { need(a, 2, 3); const v = num(a[0]()); const xs = numbers([a[1]()]); const asc = a[2] ? bool(a[2]()) : false; if (!xs.includes(v)) fail(E.na); return 1 + xs.filter((x) => (asc ? x < v : x > v)).length },
  SUMPRODUCT: (a) => {
    const gs = all(a).map(grid)
    const R = gs[0].length, C = gs[0][0]?.length ?? 0
    if (gs.some((g) => g.length !== R || (g[0]?.length ?? 0) !== C)) fail(E.value)
    let s = 0
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) s += gs.reduce((p, g) => { const x = g[r][c]; if (x instanceof XErr) throw x; return p * (typeof x === 'number' ? x : typeof x === 'boolean' ? 0 : 0) }, 1)
    return s
  },
  SUMIF: (a) => { need(a, 2, 3); const rng = flat(a[0]()); const t = criterion(scalar(a[1]())); const sum = a[2] ? flat(a[2]()) : rng; return rng.reduce<number>((s, x, i) => (t(x) && typeof sum[i] === 'number' ? s + (sum[i] as number) : s), 0) },
  SUMIFS: (a) => { const sum = flat(a[0]()); const ok = ifs(a, 1); return sum.reduce<number>((s, x, i) => (typeof x === 'number' && ok(i) ? s + x : s), 0) },
  COUNTIF: (a) => { need(a, 2); const t = criterion(scalar(a[1]())); return flat(a[0]()).filter(t).length },
  COUNTIFS: (a) => { if (a.length < 2 || a.length % 2) fail(E.value); const n = flat(a[0]()).length; const ok = ifs(a, 0); let c = 0; for (let i = 0; i < n; i++) if (ok(i)) c++; return c },
  AVERAGEIF: (a) => { need(a, 2, 3); const rng = flat(a[0]()); const t = criterion(scalar(a[1]())); const av = a[2] ? flat(a[2]()) : rng; return mean(rng.flatMap((x, i) => (t(x) && typeof av[i] === 'number' ? [av[i] as number] : []))) },
  AVERAGEIFS: (a) => { const v = flat(a[0]()); const ok = ifs(a, 1); return mean(v.flatMap((x, i) => (typeof x === 'number' && ok(i) ? [x] : []))) },
  MAXIFS: (a) => { const v = flat(a[0]()); const ok = ifs(a, 1); const xs = v.flatMap((x, i) => (typeof x === 'number' && ok(i) ? [x] : [])); return xs.length ? Math.max(...xs) : 0 },
  MINIFS: (a) => { const v = flat(a[0]()); const ok = ifs(a, 1); const xs = v.flatMap((x, i) => (typeof x === 'number' && ok(i) ? [x] : [])); return xs.length ? Math.min(...xs) : 0 },

  ROUND: (a) => { need(a, 1, 2); return roundHalf(num(a[0]()), a[1] ? Math.trunc(num(a[1]())) : 0) },
  ROUNDUP: (a) => { need(a, 1, 2); const x = num(a[0]()), p = 10 ** (a[1] ? Math.trunc(num(a[1]())) : 0); return (Math.sign(x) * Math.ceil(roundHalf(Math.abs(x) * p, 9))) / p },
  ROUNDDOWN: (a) => { need(a, 1, 2); const x = num(a[0]()), p = 10 ** (a[1] ? Math.trunc(num(a[1]())) : 0); return (Math.sign(x) * Math.floor(roundHalf(Math.abs(x) * p, 9))) / p },
  INT: (a) => { need(a, 1); return Math.floor(num(a[0]())) },
  TRUNC: (a) => { need(a, 1, 2); const p = 10 ** (a[1] ? Math.trunc(num(a[1]())) : 0); return Math.trunc(num(a[0]()) * p) / p },
  MOD: (a) => { need(a, 2); const n = num(a[0]()), d = num(a[1]()); if (d === 0) fail(E.div0); return n - d * Math.floor(n / d) },
  ABS: (a) => { need(a, 1); return Math.abs(num(a[0]())) },
  SQRT: (a) => { need(a, 1); const x = num(a[0]()); return x < 0 ? fail(E.num) : Math.sqrt(x) },
  POWER: (a) => { need(a, 2); const r = num(a[0]()) ** num(a[1]()); return Number.isFinite(r) ? r : fail(E.num) },
  CEILING: (a) => { need(a, 1, 2); const x = num(a[0]()), s = a[1] ? num(a[1]()) : 1; return s === 0 ? 0 : Math.ceil(roundHalf(x / s, 9)) * s },
  FLOOR: (a) => { need(a, 1, 2); const x = num(a[0]()), s = a[1] ? num(a[1]()) : 1; if (s === 0) fail(E.div0); return Math.floor(roundHalf(x / s, 9)) * s },
  PI: () => Math.PI,
  SIGN: (a) => { need(a, 1); return Math.sign(num(a[0]())) },

  IF: (a) => { need(a, 1, 3); return bool(a[0]()) ? (a[1] ? a[1]() : true) : a[2] ? a[2]() : false },
  IFS: (a) => { if (a.length % 2) fail(E.value); for (let i = 0; i < a.length; i += 2) if (bool(a[i]())) return a[i + 1](); return fail(E.na) },
  IFERROR: (a) => { need(a, 2); try { const v = a[0](); if (scalar(v) instanceof XErr) return a[1](); return v } catch (e) { if (e instanceof XErr) return a[1](); throw e } },
  IFNA: (a) => { need(a, 2); try { const v = a[0](); const s = scalar(v); if (s instanceof XErr && s.code === E.na) return a[1](); return v } catch (e) { if (e instanceof XErr && e.code === E.na) return a[1](); throw e } },
  AND: (a) => all(a).flatMap(flat).filter((x) => x !== null && typeof x !== 'string').every((x) => bool(x)),
  OR: (a) => all(a).flatMap(flat).filter((x) => x !== null && typeof x !== 'string').some((x) => bool(x)),
  XOR: (a) => all(a).flatMap(flat).filter((x) => x !== null && typeof x !== 'string').filter((x) => bool(x)).length % 2 === 1,
  NOT: (a) => { need(a, 1); return !bool(a[0]()) },
  SWITCH: (a) => {
    if (a.length < 3) fail(E.value)
    const v = scalar(a[0]())
    for (let i = 1; i + 1 < a.length; i += 2) if (cmp(v, scalar(a[i]())) === 0) return a[i + 1]()
    return a.length % 2 === 0 ? a[a.length - 1]() : fail(E.na)
  },
  CHOOSE: (a) => { const i = Math.trunc(num(a[0]())); return i >= 1 && i < a.length ? a[i]() : fail(E.value) },

  VLOOKUP: (a) => {
    need(a, 3, 4)
    const v = scalar(a[0]()), t = grid(a[1]()), col = Math.trunc(num(a[2]()))
    if (col < 1 || col > (t[0]?.length ?? 0)) fail(E.ref)
    const approx = a[3] ? bool(a[3]()) : true
    const i = lookupIndex(v, t.map((r) => r[0]), approx ? 1 : 0, !approx)
    return i < 0 ? fail(E.na) : t[i][col - 1]
  },
  HLOOKUP: (a) => {
    need(a, 3, 4)
    const v = scalar(a[0]()), t = grid(a[1]()), row = Math.trunc(num(a[2]()))
    if (row < 1 || row > t.length) fail(E.ref)
    const approx = a[3] ? bool(a[3]()) : true
    const i = lookupIndex(v, t[0], approx ? 1 : 0, !approx)
    return i < 0 ? fail(E.na) : t[row - 1][i]
  },
  MATCH: (a) => {
    need(a, 2, 3)
    const v = scalar(a[0]()), list = flat(a[1]())
    const mode = a[2] ? Math.sign(num(a[2]())) : 1
    const i = lookupIndex(v, list, mode, mode === 0)
    return i < 0 ? fail(E.na) : i + 1
  },
  INDEX: (a) => {
    need(a, 2, 3)
    const g = grid(a[0]())
    let r = Math.trunc(num(a[1]())), c = a[2] ? Math.trunc(num(a[2]())) : 0
    if (g.length === 1 && !a[2]) { c = r; r = 1 }
    if (r < 0 || c < 0 || r > g.length || c > (g[0]?.length ?? 0)) fail(E.ref)
    if (r === 0) return { arr: g.map((row) => [row[(c || 1) - 1]]) }
    if (c === 0) return g[0].length === 1 ? g[r - 1][0] : { arr: [g[r - 1]] }
    return g[r - 1][c - 1]
  },
  XLOOKUP: (a) => {
    need(a, 3, 6)
    const v = scalar(a[0]()), list = flat(a[1]()), ret = grid(a[2]())
    const mode = a[4] ? Math.trunc(num(a[4]())) : 0
    const rev = a[5] ? num(a[5]()) < 0 : false
    const idx = list.map((_, i) => i)
    if (rev) idx.reverse()
    let hit = -1
    if (mode === 2) { const re = wild(str(v)); hit = idx.find((i) => typeof list[i] === 'string' && re.test(list[i] as string)) ?? -1 }
    else {
      hit = idx.find((i) => list[i] !== null && !(list[i] instanceof XErr) && cmp(list[i], v) === 0) ?? -1
      if (hit < 0 && mode !== 0) {
        let best = -1
        for (const i of idx) {
          const x = list[i]
          if (x === null || x instanceof XErr || typeof x !== typeof v) continue
          const r = cmp(x, v)
          if (mode === -1 && r < 0 && (best < 0 || cmp(x, list[best]) > 0)) best = i
          if (mode === 1 && r > 0 && (best < 0 || cmp(x, list[best]) < 0)) best = i
        }
        hit = best
      }
    }
    if (hit < 0) return a[3] ? a[3]() : fail(E.na)
    if (ret.length === list.length && ret.length > 1) return ret[hit].length === 1 ? ret[hit][0] : { arr: [ret[hit]] }
    if (ret[0]?.length === list.length) return ret.length === 1 ? ret[0][hit] : { arr: ret.map((row) => [row[hit]]) }
    return fail(E.value)
  },
  ROWS: (a) => grid(a[0]()).length,
  COLUMNS: (a) => grid(a[0]())[0]?.length ?? 0,

  LEN: (a) => { need(a, 1); return [...str(a[0]())].length },
  LEFT: (a) => { need(a, 1, 2); const n = a[1] ? num(a[1]()) : 1; if (n < 0) fail(E.value); return [...str(a[0]())].slice(0, n).join('') },
  RIGHT: (a) => { need(a, 1, 2); const n = a[1] ? num(a[1]()) : 1; if (n < 0) fail(E.value); const s = [...str(a[0]())]; return n ? s.slice(-n).join('') : '' },
  MID: (a) => { need(a, 3); const s = [...str(a[0]())], st = num(a[1]()), n = num(a[2]()); if (st < 1 || n < 0) fail(E.value); return s.slice(st - 1, st - 1 + n).join('') },
  UPPER: (a) => str(a[0]()).toUpperCase(),
  LOWER: (a) => str(a[0]()).toLowerCase(),
  PROPER: (a) => str(a[0]()).toLowerCase().replace(/(^|[^\p{L}'])(\p{L})/gu, (_, p: string, c: string) => p + c.toUpperCase()),
  TRIM: (a) => str(a[0]()).trim().replace(/ {2,}/g, ' '),
  CONCAT: (a) => all(a).flatMap(flat).map((x) => str(x)).join(''),
  CONCATENATE: (a) => all(a).map((x) => str(x)).join(''),
  TEXTJOIN: (a) => { const d = str(a[0]()), skip = bool(a[1]()); return all(a.slice(2)).flatMap(flat).map((x) => str(x)).filter((x) => !skip || x !== '').join(d) },
  SUBSTITUTE: (a) => {
    need(a, 3, 4)
    const s = str(a[0]()), o = str(a[1]()), n = str(a[2]())
    if (!o) return s
    if (!a[3]) return s.split(o).join(n)
    const k = num(a[3]())
    let idx = -1
    for (let i = 0; i < k; i++) { idx = s.indexOf(o, idx + 1); if (idx < 0) return s }
    return s.slice(0, idx) + n + s.slice(idx + o.length)
  },
  FIND: (a) => { need(a, 2, 3); const i = str(a[1]()).indexOf(str(a[0]()), (a[2] ? num(a[2]()) : 1) - 1); return i < 0 ? fail(E.value) : i + 1 },
  SEARCH: (a) => { need(a, 2, 3); const s = str(a[1]()), st = (a[2] ? num(a[2]()) : 1) - 1; const m = new RegExp(wild(str(a[0]())).source.slice(1, -1), 'i').exec(s.slice(st)); return m ? m.index + st + 1 : fail(E.value) },
  REPT: (a) => { need(a, 2); const n = num(a[1]()); if (n < 0 || n > 32767) fail(E.value); return str(a[0]()).repeat(n) },
  EXACT: (a) => str(a[0]()) === str(a[1]()),
  VALUE: (a) => { const s = scalar(a[0]()); if (typeof s === 'number') return s; const t = literal(str(s).replace(/[$,\s]/g, '')); return typeof t === 'number' ? t : fail(E.value) },
  TEXT: (a) => { need(a, 2); const v = scalar(a[0]()); if (typeof v === 'string' && typeof literal(v) !== 'number') return v; return formatValue(num(v), str(a[1]())) },

  DATE: (a) => { need(a, 3); const y = Math.trunc(num(a[0]())); const s = toSerial(y < 1900 ? y + 1900 : y, Math.trunc(num(a[1]())), Math.trunc(num(a[2]()))); return s < 0 ? fail(E.num) : s },
  YEAR: (a) => dateParts(a[0]()).getUTCFullYear(),
  MONTH: (a) => dateParts(a[0]()).getUTCMonth() + 1,
  DAY: (a) => dateParts(a[0]()).getUTCDate(),
  WEEKDAY: (a) => { const d = dateParts(a[0]()).getUTCDay(); const t = a[1] ? num(a[1]()) : 1; return t === 2 ? ((d + 6) % 7) + 1 : t === 3 ? (d + 6) % 7 : d + 1 },
  TODAY: (_a, ctx) => toSerial(ctx.now.getFullYear(), ctx.now.getMonth() + 1, ctx.now.getDate()),
  EDATE: (a) => { need(a, 2); return addMonths(num(a[0]()), Math.trunc(num(a[1]())), false) },
  EOMONTH: (a) => { need(a, 2); return addMonths(num(a[0]()), Math.trunc(num(a[1]())), true) },
  DAYS: (a) => { need(a, 2); return Math.floor(num(a[0]())) - Math.floor(num(a[1]())) },
  DATEDIF: (a) => {
    need(a, 3)
    const s = num(a[0]()), e = num(a[1]())
    if (s > e) fail(E.num)
    const d1 = fromSerial(s), d2 = fromSerial(e)
    let months = (d2.getUTCFullYear() - d1.getUTCFullYear()) * 12 + d2.getUTCMonth() - d1.getUTCMonth()
    if (d2.getUTCDate() < d1.getUTCDate()) months--
    switch (str(a[2]()).toUpperCase()) {
      case 'D': return Math.floor(e) - Math.floor(s)
      case 'M': return months
      case 'Y': return Math.floor(months / 12)
      case 'YM': return months % 12
      case 'MD': { const anchor = addMonths(s, months, false); return Math.floor(e) - anchor }
      case 'YD': { const anchor = addMonths(s, Math.floor(months / 12) * 12, false); return Math.floor(e) - anchor }
      default: return fail(E.num)
    }
  },
  NETWORKDAYS: (a) => { need(a, 2); let s = Math.floor(num(a[0]())), e = Math.floor(num(a[1]())); const sg = s <= e ? 1 : -1; if (sg < 0) [s, e] = [e, s]; let n = 0; for (let d = s; d <= e; d++) { const w = fromSerial(d).getUTCDay(); if (w && w !== 6) n++ } return n * sg },

  ISBLANK: (a) => scalar(a[0]()) === null,
  ISNUMBER: (a) => typeof scalar(a[0]()) === 'number',
  ISTEXT: (a) => typeof scalar(a[0]()) === 'string',
  ISERROR: (a) => { try { return scalar(a[0]()) instanceof XErr } catch { return true } },
  ISNA: (a) => { try { const s = scalar(a[0]()); return s instanceof XErr && s.code === E.na } catch (e) { return e instanceof XErr && e.code === E.na } },
  N: (a) => { const s = scalar(a[0]()); return typeof s === 'number' ? s : s === true ? 1 : 0 },
  NA: () => fail(E.na),
}

// ---------- evaluation ----------

function broadcast(a: V, b: V, f: (x: Scalar, y: Scalar) => Scalar): V {
  if (!isArr(a) && !isArr(b)) return f(a, b)
  const ga = grid(a), gb = grid(b)
  const R = Math.max(ga.length, gb.length), C = Math.max(ga[0]?.length ?? 0, gb[0]?.length ?? 0)
  const pick = (g: Scalar[][], r: number, c: number): Scalar | undefined => (g.length === 1 ? (g[0].length === 1 ? g[0][0] : g[0][c]) : g[0].length === 1 ? g[r]?.[0] : g[r]?.[c])
  const out: Scalar[][] = []
  for (let r = 0; r < R; r++) {
    const row: Scalar[] = []
    for (let c = 0; c < C; c++) {
      const x = pick(ga, r, c), y = pick(gb, r, c)
      row.push(x === undefined || y === undefined ? new XErr(E.na) : f(x, y))
    }
    out.push(row)
  }
  return { arr: out }
}
const safe = (f: (x: Scalar, y: Scalar) => Scalar) => (x: Scalar, y: Scalar): Scalar => { try { return f(x, y) } catch (e) { if (e instanceof XErr) return e; throw e } }
const OPS: Record<string, (x: Scalar, y: Scalar) => Scalar> = {
  '+': safe((x, y) => num(x) + num(y)),
  '-': safe((x, y) => num(x) - num(y)),
  '*': safe((x, y) => num(x) * num(y)),
  '/': safe((x, y) => { const d = num(y); const n = num(x); return d === 0 ? new XErr(E.div0) : n / d }),
  '^': safe((x, y) => { const r = num(x) ** num(y); return Number.isFinite(r) ? r : new XErr(E.num) }),
  '&': safe((x, y) => str(x) + str(y)),
  '=': safe((x, y) => cmp(x, y) === 0),
  '<>': safe((x, y) => cmp(x, y) !== 0),
  '<': safe((x, y) => cmp(x, y) < 0),
  '>': safe((x, y) => cmp(x, y) > 0),
  '<=': safe((x, y) => cmp(x, y) <= 0),
  '>=': safe((x, y) => cmp(x, y) >= 0),
}

export interface Step { text: string; value: V; depth: number }

export class Sheet {
  private cache = new Map<string, Scalar>()
  private ast = new Map<string, Node | SyntaxError>()
  private busy = new Set<string>()
  cells: Record<string, string>
  rows: number
  cols: number
  now: Date
  constructor(cells: Record<string, string>, rows = 100, cols = 26, now = new Date()) {
    this.cells = cells
    this.rows = rows
    this.cols = cols
    this.now = now
  }

  formula(k: string): Node | SyntaxError | null {
    const raw = this.cells[k]
    if (!raw?.startsWith('=')) return null
    if (!this.ast.has(k)) { try { this.ast.set(k, parse(raw)) } catch (e) { this.ast.set(k, e instanceof SyntaxError ? e : new SyntaxError(String(e))) } }
    return this.ast.get(k)!
  }

  value(k: string): Scalar {
    if (this.cache.has(k)) return this.cache.get(k)!
    const f = this.formula(k)
    if (!f) { const v = literal(this.cells[k] ?? ''); this.cache.set(k, v); return v }
    if (f instanceof SyntaxError) return new XErr(E.name)
    if (this.busy.has(k)) return new XErr(E.circ)
    this.busy.add(k)
    const v = scalar(this.eval(f))
    this.busy.delete(k)
    this.cache.set(k, v)
    return v
  }

  eval(n: Node, steps?: Step[], depth = 0): V {
    let v: V
    try { v = this.evalInner(n, steps, depth) } catch (e) { if (e instanceof XErr) v = e; else throw e }
    if (steps && n.k !== 'num' && n.k !== 'str' && n.k !== 'bool' && n.k !== 'miss') steps.push({ text: show(n), value: v, depth })
    return v
  }

  private evalInner(n: Node, steps: Step[] | undefined, depth: number): V {
    switch (n.k) {
      case 'num': case 'str': case 'bool': return n.v
      case 'err': return new XErr(n.v)
      case 'miss': return null
      case 'name': return new XErr(E.name)
      case 'ref':
        if (n.r >= this.rows || n.c >= this.cols) return new XErr(E.ref)
        return this.value(key(n.r, n.c))
      case 'range': {
        if (n.r1 >= this.rows || n.c1 >= this.cols) return new XErr(E.ref)
        const arr: Scalar[][] = []
        for (let r = n.r0; r <= n.r1; r++) { const row: Scalar[] = []; for (let c = n.c0; c <= n.c1; c++) row.push(this.value(key(r, c))); arr.push(row) }
        return { arr }
      }
      case 'un': { const a = this.eval(n.a, steps, depth + 1); return broadcast(a, 0, safe((x) => (n.op === '-' ? -num(x) : num(x)))) }
      case 'pct': return broadcast(this.eval(n.a, steps, depth + 1), 0, safe((x) => num(x) / 100))
      case 'bin': {
        const a = this.eval(n.a, steps, depth + 1), b = this.eval(n.b, steps, depth + 1)
        return broadcast(a, b, OPS[n.op])
      }
      case 'fn': {
        const f = FN[n.name] ?? FN[n.name.replace(/^_XLFN\./, '')]
        if (!f) return new XErr(E.name)
        const thunks = n.args.map((a) => () => {
          const v = this.eval(a, steps, depth + 1)
          if (v instanceof XErr) throw v
          return v
        })
        return f(thunks, { now: this.now })
      }
    }
  }

  /** Evaluates an ad-hoc formula against the sheet, collecting a step-by-step trace. */
  run(src: string): { value: V; steps: Step[]; ast: Node | null; error?: string } {
    let ast: Node
    try { ast = parse(src) } catch (e) { return { value: new XErr(E.name), steps: [], ast: null, error: e instanceof Error ? e.message : String(e) } }
    const steps: Step[] = []
    return { value: this.eval(ast, steps), steps, ast }
  }
}

// ---------- dependency graph ----------

export interface Graph { prec: Map<string, string[]>; dep: Map<string, string[]>; order: string[]; cycles: string[] }

export function graph(sheet: Sheet): Graph {
  const prec = new Map<string, string[]>()
  const dep = new Map<string, string[]>()
  for (const k of Object.keys(sheet.cells)) {
    const f = sheet.formula(k)
    if (!f || f instanceof SyntaxError) continue
    const refs = [...new Set(refsOf(f))]
    prec.set(k, refs)
    for (const r of refs) dep.set(r, [...(dep.get(r) ?? []), k])
  }
  const order: string[] = []
  const cycles = new Set<string>()
  const state = new Map<string, 1 | 2>()
  const visit = (k: string, path: string[]) => {
    if (state.get(k) === 2) return
    if (state.get(k) === 1) { path.slice(path.indexOf(k)).forEach((x) => cycles.add(x)); return }
    state.set(k, 1)
    for (const r of prec.get(k) ?? []) if (prec.has(r)) visit(r, [...path, k])
    state.set(k, 2)
    order.push(k)
  }
  for (const k of prec.keys()) visit(k, [])
  return { prec, dep, order, cycles: [...cycles] }
}

/** All cells that (directly or indirectly) feed `k` or are fed by it. */
export function closure(m: Map<string, string[]>, k: string): Set<string> {
  const out = new Set<string>()
  const stack = [...(m.get(k) ?? [])]
  while (stack.length) { const x = stack.pop()!; if (out.has(x)) continue; out.add(x); stack.push(...(m.get(x) ?? [])) }
  return out
}
