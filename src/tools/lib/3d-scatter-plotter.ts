// 3D scatter plotter: point parsing, a safe math-expression compiler, parametric/surface sampling
// and a least-squares regression plane z = a + b·x + c·y.

export type P3 = [number, number, number]

/** Parses "x y z" / "x, y, z" / "x;y;z" lines. Header lines and comments (#) are skipped. */
export function parsePoints(text: string): { pts: P3[]; bad: number[] } {
  const pts: P3[] = []
  const bad: number[] = []
  text.split(/\r?\n/).forEach((line, i) => {
    const l = line.replace(/#.*/, '').trim()
    if (!l) return
    const parts = l.split(/[\s,;\t]+/).filter(Boolean)
    const nums = parts.map(Number)
    if (parts.length >= 3 && nums.slice(0, 3).every(Number.isFinite)) pts.push([nums[0], nums[1], nums[2]])
    else if (!(i === 0 && nums.every((n) => !Number.isFinite(n)))) bad.push(i + 1)
  })
  return { pts, bad }
}

// ---------- expressions ----------

const FN: Record<string, (...a: number[]) => number> = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan, atan2: Math.atan2,
  sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh, sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs, exp: Math.exp,
  ln: Math.log, log: Math.log10, log2: Math.log2, floor: Math.floor, ceil: Math.ceil, round: Math.round, sign: Math.sign,
  min: Math.min, max: Math.max, pow: Math.pow, hypot: Math.hypot,
}
const CONST: Record<string, number> = { pi: Math.PI, e: Math.E, tau: Math.PI * 2 }

type Node = (v: Record<string, number>) => number

/** Compiles an expression like "2*sin(t) + x^2" into a function of the given variables. Throws on syntax errors. */
export function compile(src: string, vars: string[]): Node {
  const toks = src.match(/\d+\.?\d*(?:e[+-]?\d+)?|\.\d+(?:e[+-]?\d+)?|[a-z_][a-z0-9_]*|\*\*|[-+*/^(),%]|\S/gi) ?? []
  let i = 0
  const peek = () => toks[i]
  const eat = (t?: string) => {
    const x = toks[i]
    if (t !== undefined && x !== t) throw new Error(`Expected “${t}” but found “${x ?? 'end'}”`)
    i++
    return x
  }
  const expr = (): Node => {
    let l = term()
    while (peek() === '+' || peek() === '-') {
      const op = eat(), a = l, b = term()
      l = op === '+' ? (v) => a(v) + b(v) : (v) => a(v) - b(v)
    }
    return l
  }
  const term = (): Node => {
    let l = unary()
    for (;;) {
      const p = peek()
      if (p === '*' || p === '/' || p === '%') {
        eat()
        const a = l, b = unary()
        l = p === '*' ? (v) => a(v) * b(v) : p === '/' ? (v) => a(v) / b(v) : (v) => a(v) % b(v)
      } else if (p !== undefined && (p === '(' || /^[a-z_.\d]/i.test(p))) {
        const a = l, b = unary() // implicit multiplication: 2x, 3sin(t)
        l = (v) => a(v) * b(v)
      } else return l
    }
  }
  const unary = (): Node => {
    if (peek() === '-') { eat(); const a = unary(); return (v) => -a(v) }
    if (peek() === '+') { eat(); return unary() }
    return power()
  }
  const power = (): Node => {
    const base = atom()
    if (peek() === '^' || peek() === '**') {
      eat()
      const ex = unary()
      return (v) => Math.pow(base(v), ex(v))
    }
    return base
  }
  const atom = (): Node => {
    const t = eat()
    if (t === undefined) throw new Error('Unexpected end of expression')
    if (t === '(') { const e = expr(); eat(')'); return e }
    if (/^[\d.]/.test(t)) { const n = Number(t); if (!Number.isFinite(n)) throw new Error(`Bad number ${t}`); return () => n }
    const id = t.toLowerCase()
    if (vars.includes(id)) return (v) => v[id]
    if (id in CONST) { const c = CONST[id]; return () => c }
    if (id in FN) {
      const f = FN[id]
      eat('(')
      const args: Node[] = [expr()]
      while (peek() === ',') { eat(); args.push(expr()) }
      eat(')')
      return (v) => f(...args.map((a) => a(v)))
    }
    throw new Error(`Unknown name “${t}”`)
  }
  const root = expr()
  if (i < toks.length) throw new Error(`Unexpected “${toks[i]}”`)
  return root
}

/** Samples a parametric curve (x(t), y(t), z(t)) for t in [t0, t1]. */
export function parametric(fx: string, fy: string, fz: string, t0: number, t1: number, n: number): P3[] {
  const [a, b, c] = [fx, fy, fz].map((s) => compile(s, ['t']))
  const out: P3[] = []
  const steps = Math.max(2, Math.min(5000, Math.round(n)))
  for (let k = 0; k < steps; k++) {
    const t = t0 + ((t1 - t0) * k) / (steps - 1)
    const p: P3 = [a({ t }), b({ t }), c({ t })]
    if (p.every(Number.isFinite)) out.push(p)
  }
  return out
}

/** Samples z = f(x, y) on an n×n grid over [x0,x1]×[y0,y1]. */
export function surface(fz: string, x0: number, x1: number, y0: number, y1: number, n: number): P3[] {
  const f = compile(fz, ['x', 'y'])
  const m = Math.max(2, Math.min(80, Math.round(n)))
  const out: P3[] = []
  for (let i = 0; i < m; i++)
    for (let j = 0; j < m; j++) {
      const x = x0 + ((x1 - x0) * i) / (m - 1), y = y0 + ((y1 - y0) * j) / (m - 1)
      const z = f({ x, y })
      if (Number.isFinite(z)) out.push([x, y, z])
    }
  return out
}

// ---------- regression ----------

/** Solves a 3×3 linear system with Gaussian elimination + partial pivoting. */
export function solve3(A: number[][], b: number[]): number[] | null {
  const M = A.map((r, i) => [...r, b[i]])
  for (let c = 0; c < 3; c++) {
    let p = c
    for (let r = c + 1; r < 3; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r
    if (Math.abs(M[p][c]) < 1e-12) return null
    ;[M[c], M[p]] = [M[p], M[c]]
    for (let r = 0; r < 3; r++) {
      if (r === c) continue
      const f = M[r][c] / M[c][c]
      for (let k = c; k < 4; k++) M[r][k] -= f * M[c][k]
    }
  }
  return [M[0][3] / M[0][0], M[1][3] / M[1][1], M[2][3] / M[2][2]]
}

export interface Plane { a: number; b: number; c: number; r2: number; rmse: number; n: number }

/** Ordinary least squares fit of z = a + b·x + c·y. */
export function fitPlane(pts: P3[]): Plane | null {
  const n = pts.length
  if (n < 3) return null
  let sx = 0, sy = 0, sz = 0, sxx = 0, syy = 0, sxy = 0, sxz = 0, syz = 0
  for (const [x, y, z] of pts) { sx += x; sy += y; sz += z; sxx += x * x; syy += y * y; sxy += x * y; sxz += x * z; syz += y * z }
  const s = solve3([[n, sx, sy], [sx, sxx, sxy], [sy, sxy, syy]], [sz, sxz, syz])
  if (!s) return null
  const [a, b, c] = s
  const mz = sz / n
  let ssr = 0, sst = 0
  for (const [x, y, z] of pts) { ssr += (z - (a + b * x + c * y)) ** 2; sst += (z - mz) ** 2 }
  return { a, b, c, r2: sst > 0 ? 1 - ssr / sst : 1, rmse: Math.sqrt(ssr / n), n }
}

export function bounds(pts: P3[]): { min: P3; max: P3 } {
  const min: P3 = [Infinity, Infinity, Infinity], max: P3 = [-Infinity, -Infinity, -Infinity]
  for (const p of pts) for (let k = 0; k < 3; k++) { if (p[k] < min[k]) min[k] = p[k]; if (p[k] > max[k]) max[k] = p[k] }
  for (let k = 0; k < 3; k++) {
    if (!Number.isFinite(min[k])) { min[k] = 0; max[k] = 1 }
    if (min[k] === max[k]) { min[k] -= 1; max[k] += 1 }
  }
  return { min, max }
}
