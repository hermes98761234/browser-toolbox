// Seeded math problem generators with exact answers.

export type Tok = string | { f: [string, string]; w?: string } | { sup: [string, string] } | { sqrt: string } | { blank: true }
export interface Problem {
  q: Tok[]
  a: Tok[]
  /** Column-arithmetic layout: top, operator, bottom. */
  v?: [string, string, string]
}
export type Level = 1 | 2 | 3

export const TOPICS = {
  add: 'Addition',
  sub: 'Subtraction',
  mul: 'Multiplication',
  div: 'Division',
  missing: 'Missing numbers',
  order: 'Order of operations',
  fracAdd: 'Adding & subtracting fractions',
  fracMul: 'Multiplying & dividing fractions',
  simplify: 'Simplifying fractions',
  decimal: 'Decimals',
  percent: 'Percentages',
  equation: 'Linear equations',
  powers: 'Squares, cubes & roots',
  round: 'Rounding',
  compare: 'Comparing numbers',
} as const
export type Topic = keyof typeof TOPICS

/** mulberry32 */
export function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const gcd = (a: number, b: number): number => {
  a = Math.abs(a)
  b = Math.abs(b)
  while (b) [a, b] = [b, a % b]
  return a || 1
}
const N = (x: number) => (x < 0 ? `−${Math.abs(x).toLocaleString('en-US')}` : x.toLocaleString('en-US'))

/** Fraction token, simplified, as a mixed number when improper (mixed=true). */
export function frac(n: number, d: number, mixed = true): Tok[] {
  if (d < 0) [n, d] = [-n, -d]
  const g = gcd(n, d)
  n /= g
  d /= g
  if (d === 1) return [N(n)]
  if (mixed && Math.abs(n) > d) {
    const w = Math.trunc(n / d), r = Math.abs(n % d)
    return [{ f: [String(r), String(d)], w: N(w) }]
  }
  return [{ f: [N(n), String(d)] }]
}

/** Decimal string without floating-point noise. */
export const dec = (x: number, dp = 4) => N(+x.toFixed(dp))

export function generate(topic: Topic, level: Level, count: number, seed: number, opts: { remainders?: boolean; negatives?: boolean } = {}): Problem[] {
  const r = rng(seed * 7919 + topic.length * 131 + level)
  const int = (lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1))
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)]
  const one = (): Problem => {
    switch (topic) {
      case 'add': {
        const [lo, hi] = level === 1 ? [0, 10] : level === 2 ? [10, 99] : [100, 9999]
        const a = int(lo, hi), b = int(lo, hi)
        return { q: [`${N(a)} + ${N(b)} =`, { blank: true }], a: [N(a + b)], v: [N(a), '+', N(b)] }
      }
      case 'sub': {
        const [lo, hi] = level === 1 ? [0, 20] : level === 2 ? [10, 99] : [100, 9999]
        let a = int(lo, hi), b = int(lo, hi)
        if (!opts.negatives && b > a) [a, b] = [b, a]
        return { q: [`${N(a)} − ${N(b)} =`, { blank: true }], a: [N(a - b)], v: [N(a), '−', N(b)] }
      }
      case 'mul': {
        const a = level === 1 ? int(2, 10) : level === 2 ? int(12, 99) : int(100, 999)
        const b = level === 1 ? int(1, 10) : level === 2 ? int(2, 9) : int(11, 99)
        return { q: [`${N(a)} × ${N(b)} =`, { blank: true }], a: [N(a * b)], v: [N(a), '×', N(b)] }
      }
      case 'div': {
        const b = level === 1 ? int(2, 10) : level === 2 ? int(2, 12) : int(11, 49)
        const q = level === 1 ? int(1, 10) : level === 2 ? int(3, 60) : int(12, 250)
        const rem = opts.remainders && level > 1 ? int(0, b - 1) : 0
        const a = b * q + rem
        return { q: [`${N(a)} ÷ ${N(b)} =`, { blank: true }], a: [rem ? `${N(q)} R ${rem}` : N(q)] }
      }
      case 'missing': {
        const hi = level === 1 ? 20 : level === 2 ? 100 : 1000
        const op = pick(level === 1 ? ['+', '−'] : ['+', '−', '×', '÷'])
        if (op === '×' || op === '÷') {
          const a = int(2, level === 2 ? 12 : 25), b = int(2, level === 2 ? 12 : 40)
          return op === '×'
            ? r() < 0.5 ? { q: [`${a} ×`, { blank: true }, `= ${N(a * b)}`], a: [N(b)] } : { q: [{ blank: true }, `× ${b} = ${N(a * b)}`], a: [N(a)] }
            : { q: [`${N(a * b)} ÷`, { blank: true }, `= ${a}`], a: [N(b)] }
        }
        const a = int(0, hi), b = int(0, hi)
        if (op === '+') return r() < 0.5 ? { q: [`${N(a)} +`, { blank: true }, `= ${N(a + b)}`], a: [N(b)] } : { q: [{ blank: true }, `+ ${N(b)} = ${N(a + b)}`], a: [N(a)] }
        const [x, y] = a >= b ? [a, b] : [b, a]
        return { q: [`${N(x)} −`, { blank: true }, `= ${N(x - y)}`], a: [N(y)] }
      }
      case 'order': {
        if (level === 1) {
          const a = int(1, 20), b = int(2, 9), c = int(2, 9)
          return pick([
            { q: [`${a} + ${b} × ${c} =`, { blank: true }], a: [N(a + b * c)] },
            { q: [`${b} × ${c} − ${Math.min(a, b * c)} =`, { blank: true }], a: [N(b * c - Math.min(a, b * c))] },
          ])
        }
        if (level === 2) {
          const a = int(2, 15), b = int(2, 15), c = int(2, 9), d = int(1, 20)
          return { q: [`(${a} + ${b}) × ${c} − ${d} =`, { blank: true }], a: [N((a + b) * c - d)] }
        }
        const a = int(2, 9), b = int(5, 20), c = int(1, 4), e = int(2, 6), d = e * int(1, 5)
        return { q: [{ sup: [String(a), '2'] }, ` + (${b} − ${c}) × ${d} ÷ ${e} =`, { blank: true }], a: [N(a * a + ((b - c) * d) / e)] }
      }
      case 'fracAdd': {
        const sub = r() < 0.5
        let a: number, b: number, c: number, d: number
        if (level === 1) {
          b = d = int(3, 12)
          a = int(1, b - 1)
          c = int(1, b - 1)
        } else {
          b = int(2, level === 2 ? 10 : 12)
          do d = int(2, level === 2 ? 10 : 12)
          while (d === b)
          a = int(1, level === 3 ? 3 * b : b - 1)
          c = int(1, level === 3 ? 2 * d : d - 1)
        }
        if (sub && a * d < c * b) [a, b, c, d] = [c, d, a, b]
        const num = sub ? a * d - c * b : a * d + c * b
        return { q: [...frac(a, b, level === 3), sub ? ' − ' : ' + ', ...frac(c, d, level === 3), ' =', { blank: true }], a: frac(num, b * d) }
      }
      case 'fracMul': {
        const div = level > 1 && r() < 0.5
        const a = int(1, level === 3 ? 15 : 9), b = int(2, 12), c = int(1, level === 3 ? 15 : 9), d = int(2, 12)
        const fa = { f: [String(a), String(b)] as [string, string] }, fc = { f: [String(c), String(d)] as [string, string] }
        return div ? { q: [fa, ' ÷ ', fc, ' =', { blank: true }], a: frac(a * d, b * c) } : { q: [fa, ' × ', fc, ' =', { blank: true }], a: frac(a * c, b * d) }
      }
      case 'simplify': {
        const d = int(2, level === 1 ? 10 : 20)
        const n = int(1, d - 1)
        const k = int(2, level === 1 ? 5 : level === 2 ? 12 : 25)
        return { q: [{ f: [String(n * k), String(d * k)] }, ' =', { blank: true }], a: frac(n, d, false) }
      }
      case 'decimal': {
        const dp = level === 1 ? 1 : 2
        const s = 10 ** dp
        const a = int(1, level === 3 ? 9999 : 999), b = int(1, level === 3 ? 999 : 99)
        const op = pick(level === 1 ? ['+', '−'] : ['+', '−', '×'])
        if (op === '×') {
          const x = int(11, 99) / 10, y = int(2, level === 3 ? 99 : 9) / (level === 3 ? 10 : 1)
          return { q: [`${dec(x)} × ${dec(y)} =`, { blank: true }], a: [dec((Math.round(x * 10) * Math.round(y * 10)) / 100)], v: [dec(x), '×', dec(y)] }
        }
        const [x, y] = op === '−' && b > a ? [b, a] : [a, b]
        return { q: [`${dec(x / s)} ${op} ${dec(y / s)} =`, { blank: true }], a: [dec((op === '+' ? x + y : x - y) / s)], v: [(x / s).toFixed(dp), op, (y / s).toFixed(dp)] }
      }
      case 'percent': {
        if (level === 3) {
          const total = pick([20, 25, 40, 50, 80, 120, 200, 250, 400])
          const p = pick([5, 10, 15, 20, 25, 30, 40, 60, 75])
          return { q: [`${N((total * p) / 100)} is what % of ${N(total)}?`, { blank: true }], a: [`${p}%`] }
        }
        const p = level === 1 ? pick([10, 20, 25, 50, 75, 100]) : pick([5, 12, 15, 30, 35, 40, 60, 65, 80, 120])
        const n = level === 1 ? 4 * int(1, 50) : 20 * int(1, 60)
        return { q: [`${p}% of ${N(n)} =`, { blank: true }], a: [dec((p * n) / 100, 2)] }
      }
      case 'equation': {
        const x = level === 1 ? int(0, 20) : int(-12, 15)
        if (level === 1) {
          const a = int(1, 30)
          return r() < 0.5 ? { q: [`x + ${a} = ${x + a}`], a: [`x = ${N(x)}`] } : { q: [`x − ${a} = ${N(x - a)}`], a: [`x = ${N(x)}`] }
        }
        if (level === 2) {
          const a = int(2, 9), b = int(-20, 20) || 3
          return { q: [`${a}x ${b < 0 ? '−' : '+'} ${Math.abs(b)} = ${N(a * x + b)}`], a: [`x = ${N(x)}`] }
        }
        const a = int(2, 6), b = int(-9, 9) || 2, c = int(1, 9), d = a * (x + b) - c * x
        if (c === a) return one()
        return { q: [`${a}(x ${b < 0 ? '−' : '+'} ${Math.abs(b)}) = ${c === 1 ? '' : c}x ${d < 0 ? '−' : '+'} ${Math.abs(d)}`], a: [`x = ${N(x)}`] }
      }
      case 'powers': {
        const kind = pick(level === 1 ? ['sq', 'sqrt'] : ['sq', 'sqrt', 'cube', 'cbrt'])
        const n = level === 1 ? int(1, 12) : level === 2 ? int(2, 20) : int(5, 30)
        if (kind === 'sq') return { q: [{ sup: [String(n), '2'] }, ' =', { blank: true }], a: [N(n * n)] }
        if (kind === 'sqrt') return { q: [{ sqrt: N(n * n) }, ' =', { blank: true }], a: [N(n)] }
        const m = Math.min(n, level === 2 ? 10 : 15)
        if (kind === 'cube') return { q: [{ sup: [String(m), '3'] }, ' =', { blank: true }], a: [N(m ** 3)] }
        return { q: [`∛${N(m ** 3)} =`, { blank: true }], a: [N(m)] }
      }
      case 'round': {
        if (level === 3) {
          const x = int(10000, 999999) / 1000, dp = pick([1, 2])
          return { q: [`Round ${dec(x, 3)} to ${dp === 1 ? 'the nearest tenth' : 'the nearest hundredth'}:`, { blank: true }], a: [(Math.round(x * 10 ** dp + 1e-9) / 10 ** dp).toFixed(dp)] }
        }
        const to = level === 1 ? pick([10, 100]) : pick([10, 100, 1000])
        const x = level === 1 ? int(11, 999) : int(1001, 99999)
        return { q: [`Round ${N(x)} to the nearest ${N(to)}:`, { blank: true }], a: [N(Math.round(x / to) * to)] }
      }
      case 'compare': {
        if (level === 1) {
          const a = int(0, 999), b = r() < 0.15 ? a : int(0, 999)
          return { q: [N(a), { blank: true }, N(b)], a: [a < b ? '<' : a > b ? '>' : '='] }
        }
        if (level === 2) {
          const a = int(1, 999) / 100, b = r() < 0.2 ? +(a.toFixed(1)) : int(1, 999) / 100
          return { q: [dec(a), { blank: true }, dec(b)], a: [a < b ? '<' : a > b ? '>' : '='] }
        }
        const b = int(2, 12), d = int(2, 12), a = int(1, b), c = r() < 0.2 ? (a * d) / b : int(1, d)
        if (!Number.isInteger(c)) return one()
        return { q: [{ f: [String(a), String(b)] }, { blank: true }, { f: [String(c), String(d)] }], a: [a * d < c * b ? '<' : a * d > c * b ? '>' : '='] }
      }
    }
  }
  const out: Problem[] = []
  const seen = new Set<string>()
  for (let tries = 0; out.length < count && tries < count * 30; tries++) {
    const p = one()
    const k = text(p.q)
    if (seen.has(k) && tries < count * 20) continue
    seen.add(k)
    out.push(p)
  }
  return out
}

/** Plain-text form of a token list (for CSV/clipboard). */
export function text(ts: Tok[]): string {
  return ts
    .map((t) =>
      typeof t === 'string' ? t
      : 'blank' in t ? ' ____ '
      : 'f' in t ? `${t.w ? `${t.w} ` : ''}${t.f[0]}/${t.f[1]}`
      : 'sup' in t ? `${t.sup[0]}^${t.sup[1]}`
      : `√${t.sqrt}`,
    )
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
}
