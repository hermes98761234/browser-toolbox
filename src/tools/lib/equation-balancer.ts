// Chemical equation balancer: formula parser, element matrix, exact rational null space (BigInt fractions).

const W =
  'H 1.008 He 4.0026 Li 6.94 Be 9.0122 B 10.81 C 12.011 N 14.007 O 15.999 F 18.998 Ne 20.18 Na 22.99 Mg 24.305 Al 26.982 Si 28.085 P 30.974 S 32.06 Cl 35.45 Ar 39.948 K 39.098 Ca 40.078 Sc 44.956 Ti 47.867 V 50.942 Cr 51.996 Mn 54.938 Fe 55.845 Co 58.933 Ni 58.693 Cu 63.546 Zn 65.38 Ga 69.723 Ge 72.63 As 74.922 Se 78.971 Br 79.904 Kr 83.798 Rb 85.468 Sr 87.62 Y 88.906 Zr 91.224 Nb 92.906 Mo 95.95 Tc 98 Ru 101.07 Rh 102.91 Pd 106.42 Ag 107.87 Cd 112.41 In 114.82 Sn 118.71 Sb 121.76 Te 127.6 I 126.9 Xe 131.29 Cs 132.91 Ba 137.33 La 138.91 Ce 140.12 Pr 140.91 Nd 144.24 Pm 145 Sm 150.36 Eu 151.96 Gd 157.25 Tb 158.93 Dy 162.5 Ho 164.93 Er 167.26 Tm 168.93 Yb 173.05 Lu 174.97 Hf 178.49 Ta 180.95 W 183.84 Re 186.21 Os 190.23 Ir 192.22 Pt 195.08 Au 196.97 Hg 200.59 Tl 204.38 Pb 207.2 Bi 208.98 Po 209 At 210 Rn 222 Fr 223 Ra 226 Ac 227 Th 232.04 Pa 231.04 U 238.03 Np 237 Pu 244 Am 243 Cm 247 Bk 247 Cf 251 Es 252 Fm 257 D 2.014 T 3.016'
export const MASS: Record<string, number> = {}
{
  const p = W.split(' ')
  for (let i = 0; i < p.length; i += 2) MASS[p[i]] = Number(p[i + 1])
}

export interface Species {
  text: string // as typed (trimmed, state removed)
  atoms: Record<string, number>
  charge: number
  state: string
}

/** Parses e.g. "Ca3(PO4)2", "CuSO4·5H2O", "[Fe(CN)6]^3-", "MnO4^-", "NH4+", "e-", "H2O(l)". */
export function parseFormula(input: string): Species {
  let s = input.trim().replace(/\s+/g, '')
  let state = ''
  const st = /\((s|l|g|aq)\)$/i.exec(s)
  if (st) { state = st[1].toLowerCase(); s = s.slice(0, -st[0].length) }
  if (!s) throw new Error('Empty formula')
  let charge = 0
  const ch = /(?:\^\{?(\d*)([+-])\}?|\{(\d*)([+-])\}|([+-])(\d*))$/.exec(s)
  if (ch && ch.index > 0 || s === 'e-' || s === 'e') {
    if (s === 'e-' || s === 'e') return { text: 'e⁻', atoms: {}, charge: -1, state }
    const digits = ch![1] ?? ch![3] ?? ch![6] ?? ''
    const sign = ch![2] ?? ch![4] ?? ch![5]
    charge = (sign === '-' ? -1 : 1) * (digits ? Number(digits) : 1)
    s = s.slice(0, ch!.index)
  }
  const atoms: Record<string, number> = {}
  // hydrates / adducts: CuSO4·5H2O, CuSO4.5H2O, CuSO4*5H2O
  for (const part of s.split(/[·.*•]/)) {
    const m = /^(\d+)(.*)$/.exec(part)
    const mult = m ? Number(m[1]) : 1
    const body = m ? m[2] : part
    if (!body) throw new Error(`Bad formula “${input}”`)
    const a = parseGroup(body, input)
    for (const [k, v] of Object.entries(a)) atoms[k] = (atoms[k] ?? 0) + v * mult
  }
  return { text: input.trim().replace(/\((s|l|g|aq)\)$/i, ''), atoms, charge, state }
}

function parseGroup(s: string, orig: string): Record<string, number> {
  let i = 0
  const num = () => {
    const m = /^\d+/.exec(s.slice(i))
    if (!m) return 1
    i += m[0].length
    return Number(m[0])
  }
  const seq = (close?: string): Record<string, number> => {
    const out: Record<string, number> = {}
    const add = (k: string, v: number) => (out[k] = (out[k] ?? 0) + v)
    while (i < s.length) {
      const c = s[i]
      if (c === '(' || c === '[' || c === '{') {
        i++
        const inner = seq(c === '(' ? ')' : c === '[' ? ']' : '}')
        const n = num()
        for (const [k, v] of Object.entries(inner)) add(k, v * n)
      } else if (c === ')' || c === ']' || c === '}') {
        if (c !== close) throw new Error(`Unbalanced brackets in “${orig}”`)
        i++
        return out
      } else {
        const m = /^[A-Z][a-z]?/.exec(s.slice(i))
        if (!m) throw new Error(`Unexpected “${c}” in “${orig}”`)
        let el = m[0]
        // prefer a known one-letter symbol when the two-letter one does not exist (e.g. "Co" vs "CO" handled by case)
        if (!(el in MASS) && el.length === 2 && el[0] in MASS) el = el[0]
        if (!(el in MASS)) throw new Error(`Unknown element “${el}” in “${orig}”`)
        i += el.length
        add(el, num())
      }
    }
    if (close) throw new Error(`Missing “${close}” in “${orig}”`)
    return out
  }
  return seq()
}

// ---------- exact rationals ----------
type F = [bigint, bigint]
const babs = (a: bigint) => (a < 0n ? -a : a)
const gcd = (a: bigint, b: bigint): bigint => { a = babs(a); b = babs(b); while (b) [a, b] = [b, a % b]; return a }
const norm = ([n, d]: F): F => { if (d < 0n) { n = -n; d = -d } const g = gcd(n, d) || 1n; return [n / g, d / g] }
const sub = (a: F, b: F): F => norm([a[0] * b[1] - b[0] * a[1], a[1] * b[1]])
const mul = (a: F, b: F): F => norm([a[0] * b[0], a[1] * b[1]])
const div = (a: F, b: F): F => norm([a[0] * b[1], a[1] * b[0]])

/** Null-space basis of an integer matrix (rows × cols), each vector as reduced integers. */
export function nullspace(M: number[][]): bigint[][] {
  const rows = M.length, cols = M[0]?.length ?? 0
  const A: F[][] = M.map((r) => r.map((v) => [BigInt(v), 1n] as F))
  const pivots: number[] = []
  let r = 0
  for (let c = 0; c < cols && r < rows; c++) {
    let p = r
    while (p < rows && A[p][c][0] === 0n) p++
    if (p === rows) continue
    ;[A[r], A[p]] = [A[p], A[r]]
    const pv = A[r][c]
    A[r] = A[r].map((x) => div(x, pv))
    for (let i = 0; i < rows; i++) {
      if (i === r || A[i][c][0] === 0n) continue
      const f = A[i][c]
      A[i] = A[i].map((x, j) => sub(x, mul(f, A[r][j])))
    }
    pivots.push(c)
    r++
  }
  const free = Array.from({ length: cols }, (_, i) => i).filter((c) => !pivots.includes(c))
  return free.map((fc) => {
    const v: F[] = Array.from({ length: cols }, () => [0n, 1n] as F)
    v[fc] = [1n, 1n]
    pivots.forEach((pc, i) => (v[pc] = norm([-A[i][fc][0], A[i][fc][1]])))
    const l = v.reduce((acc, [, d]) => (acc * d) / gcd(acc, d), 1n)
    let ints = v.map(([n, d]) => (n * l) / d)
    const g = ints.reduce((a, b) => gcd(a, b), 0n) || 1n
    ints = ints.map((x) => x / g)
    if (ints.find((x) => x !== 0n)! < 0n) ints = ints.map((x) => -x)
    return ints
  })
}

export interface Balanced {
  reactants: Species[]
  products: Species[]
  coef: bigint[]
  elements: string[]
  ambiguous: boolean
}

export function splitEquation(eq: string): [string[], string[]] {
  const sides = eq.split(/\s*(?:<=>|<->|⇌|⟶|→|->|=+>?)\s*/)
  if (sides.length !== 2) throw new Error('Write the equation as “reactants = products” (or use →)')
  // species are separated by " + " (a "+" followed by a space or start of a formula, not a charge sign)
  const terms = (side: string) => side.split(/\s+\+\s+|\s*\+\s*(?=\d*[A-Z([e])/).map((t) => t.trim()).filter(Boolean)
  const [l, r] = sides.map(terms)
  if (!l.length || !r.length) throw new Error('Both sides need at least one species')
  return [l, r]
}

/** Strips a leading coefficient the user may have typed (e.g. "2H2O"). */
const stripCoef = (t: string) => t.replace(/^\d+(?=[A-Z([])/, '')

export function balance(eq: string): Balanced {
  const [L, R] = splitEquation(eq)
  const reactants = L.map((t) => parseFormula(stripCoef(t)))
  const products = R.map((t) => parseFormula(stripCoef(t)))
  const all = [...reactants, ...products]
  const elements = [...new Set(all.flatMap((sp) => Object.keys(sp.atoms)))]
  const charged = all.some((sp) => sp.charge !== 0)
  const M = elements.map((el) => all.map((sp, j) => (sp.atoms[el] ?? 0) * (j < reactants.length ? 1 : -1)))
  if (charged) M.push(all.map((sp, j) => sp.charge * (j < reactants.length ? 1 : -1)))
  const ns = nullspace(M)
  if (!ns.length) throw new Error('This equation cannot be balanced — check the formulas (an element may appear on one side only).')
  let v = ns[0]
  if (ns.length > 1) {
    // several independent reactions: take the simplest all-positive combination we can find
    v = ns.reduce((acc, x) => acc.map((a, i) => a + x[i]))
    const g = v.reduce((a, b) => gcd(a, b), 0n) || 1n
    v = v.map((x) => x / g)
  }
  if (v.some((x) => x <= 0n)) throw new Error('No all-positive solution — a species may be on the wrong side or unnecessary.')
  return { reactants, products, coef: v, elements: charged ? [...elements, 'charge'] : elements, ambiguous: ns.length > 1 }
}

export function molarMass(sp: Species): number {
  return Object.entries(sp.atoms).reduce((a, [el, n]) => a + MASS[el] * n, 0)
}

const SUB = '₀₁₂₃₄₅₆₇₈₉'
const SUP: Record<string, string> = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '+': '⁺', '-': '⁻' }

/** Pretty text: subscripts for counts, superscript charge. */
export function pretty(sp: Species): string {
  if (sp.text === 'e⁻') return 'e⁻'
  let body = sp.text.replace(/(\^\{?\d*[+-]\}?|\{\d*[+-]\}|[+-]\d*)$/, '')
  body = body.replace(/([A-Za-z)\]}])(\d+)/g, (_, a, d: string) => a + [...d].map((c) => SUB[+c]).join(''))
  body = body.replace(/[.*•]/g, '·')
  const q = sp.charge
  const chs = q === 0 ? '' : `${Math.abs(q) === 1 ? '' : Math.abs(q)}${q > 0 ? '+' : '-'}`
  return body + [...chs].map((c) => SUP[c]).join('') + (sp.state ? `(${sp.state})` : '')
}
