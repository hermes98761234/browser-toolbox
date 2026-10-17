// Chemical formula parser with IUPAC standard atomic weights, molar mass, and molarity/dilution solvers.

const SYMBOLS =
  'H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og'.split(' ')
// prettier-ignore
const WEIGHTS = [
  1.008, 4.0026, 6.94, 9.0122, 10.81, 12.011, 14.007, 15.999, 18.998, 20.18, 22.99, 24.305, 26.982, 28.085, 30.974, 32.06, 35.45, 39.948,
  39.098, 40.078, 44.956, 47.867, 50.942, 51.996, 54.938, 55.845, 58.933, 58.693, 63.546, 65.38, 69.723, 72.63, 74.922, 78.971, 79.904, 83.798,
  85.468, 87.62, 88.906, 91.224, 92.906, 95.95, 98, 101.07, 102.91, 106.42, 107.87, 112.41, 114.82, 118.71, 121.76, 127.6, 126.9, 131.29,
  132.91, 137.33, 138.91, 140.12, 140.91, 144.24, 145, 150.36, 151.96, 157.25, 158.93, 162.5, 164.93, 167.26, 168.93, 173.05, 174.97,
  178.49, 180.95, 183.84, 186.21, 190.23, 192.22, 195.08, 196.97, 200.59, 204.38, 207.2, 208.98, 209, 210, 222,
  223, 226, 227, 232.04, 231.04, 238.03, 237, 244, 243, 247, 247, 251, 252, 257, 258, 259, 266,
  267, 268, 269, 270, 269, 278, 281, 282, 285, 286, 289, 290, 293, 294, 294,
]

export interface Element {
  z: number
  symbol: string
  mass: number
  row: number // 1-based grid row (8, 9 = f-block rows)
  col: number // 1-based grid column
}

function position(z: number): [number, number] {
  if (z === 1) return [1, 1]
  if (z === 2) return [1, 18]
  if (z <= 10) return [2, z <= 4 ? z - 2 : z + 8]
  if (z <= 18) return [3, z <= 12 ? z - 10 : z]
  if (z <= 36) return [4, z - 18]
  if (z <= 54) return [5, z - 36]
  if (z >= 57 && z <= 71) return [8, z - 54]
  if (z >= 89 && z <= 103) return [9, z - 86]
  if (z <= 86) return [6, z <= 56 ? z - 54 : z - 68]
  return [7, z <= 88 ? z - 86 : z - 100]
}

export const ELEMENTS: Element[] = SYMBOLS.map((symbol, i) => {
  const [row, col] = position(i + 1)
  return { z: i + 1, symbol, mass: WEIGHTS[i], row, col }
})
const BY_SYMBOL = new Map(ELEMENTS.map((e) => [e.symbol, e]))

export class FormulaError extends Error {}

/** Parses formulas like "CuSO4·5H2O", "Ca(OH)2", "K4[Fe(CN)6]", "2H2O". Returns element counts. */
export function parseFormula(input: string): Map<string, number> {
  const src = input.replace(/\s+/g, '').replace(/\^?\d*[+-]$/, '')
  if (!src) throw new FormulaError('Enter a formula')
  const parts = src.split(/[·•.*]/)
  const total = new Map<string, number>()
  for (const part of parts) {
    if (!part) throw new FormulaError('Empty part around a hydrate dot')
    let i = 0
    const num = () => {
      const m = /^\d+(?:\.\d+)?/.exec(part.slice(i))
      if (!m) return null
      i += m[0].length
      return Number(m[0])
    }
    const coef = num() ?? 1
    const group = (close: string | null): Map<string, number> => {
      const acc = new Map<string, number>()
      const add = (m: Map<string, number>, k: number) => m.forEach((v, e) => acc.set(e, (acc.get(e) ?? 0) + v * k))
      while (i < part.length) {
        const c = part[i]
        if (c === '(' || c === '[' || c === '{') {
          i++
          const inner = group(c === '(' ? ')' : c === '[' ? ']' : '}')
          add(inner, num() ?? 1)
        } else if (c === ')' || c === ']' || c === '}') {
          if (c !== close) throw new FormulaError(`Unexpected "${c}"`)
          i++
          return acc
        } else if (/[A-Z]/.test(c)) {
          const m = /^[A-Z][a-z]?/.exec(part.slice(i))!
          let sym = m[0]
          if (!BY_SYMBOL.has(sym) && sym.length === 2 && BY_SYMBOL.has(sym[0])) sym = sym[0]
          if (!BY_SYMBOL.has(sym)) throw new FormulaError(`Unknown element "${m[0]}"`)
          i += sym.length
          const n = num() ?? 1
          acc.set(sym, (acc.get(sym) ?? 0) + n)
        } else throw new FormulaError(`Unexpected "${c}" in formula`)
      }
      if (close) throw new FormulaError(`Missing "${close}"`)
      return acc
    }
    const g = group(null)
    g.forEach((v, e) => total.set(e, (total.get(e) ?? 0) + v * coef))
  }
  return total
}

export function molarMass(counts: Map<string, number>): number {
  let m = 0
  counts.forEach((n, e) => (m += n * BY_SYMBOL.get(e)!.mass))
  return m
}

export function composition(counts: Map<string, number>) {
  const M = molarMass(counts)
  return [...counts].map(([e, n]) => ({ symbol: e, count: n, mass: n * BY_SYMBOL.get(e)!.mass, fraction: (n * BY_SYMBOL.get(e)!.mass) / M }))
}

/** Hill-system formula string (C first, H second, then alphabetical; alphabetical when no carbon). */
export function hillFormula(counts: Map<string, number>): string {
  const keys = [...counts.keys()].sort()
  const order = counts.has('C') ? ['C', ...(counts.has('H') ? ['H'] : []), ...keys.filter((k) => k !== 'C' && k !== 'H')] : keys
  return order.map((k) => `${k}${counts.get(k) === 1 ? '' : +counts.get(k)!.toFixed(3)}`).join('')
}

// ---------- units & solver ----------

export const MASS_UNITS: [string, number][] = [['kg', 1000], ['g', 1], ['mg', 1e-3], ['µg', 1e-6]]
export const VOL_UNITS: [string, number][] = [['L', 1], ['mL', 1e-3], ['µL', 1e-6]]
export const CONC_UNITS: [string, number][] = [['M', 1], ['mM', 1e-3], ['µM', 1e-6], ['nM', 1e-9]]

export type SolveFor = 'mass' | 'volume' | 'conc'

/** mass (g) = concentration (mol/L) × volume (L) × molar mass (g/mol) ÷ purity. */
export function solve(what: SolveFor, v: { massG: number; volL: number; concM: number; mw: number; purity?: number }): number {
  const p = (v.purity ?? 100) / 100
  if (what === 'mass') return (v.concM * v.volL * v.mw) / p
  if (what === 'volume') return (v.massG * p) / (v.mw * v.concM)
  return (v.massG * p) / (v.mw * v.volL)
}

/** C1·V1 = C2·V2, solving for the missing entry (null). */
export function dilution(c1: number | null, v1: number | null, c2: number | null, v2: number | null): number {
  if (c1 === null) return (c2! * v2!) / v1!
  if (v1 === null) return (c2! * v2!) / c1
  if (c2 === null) return (c1 * v1) / v2!
  return (c1 * v1) / c2
}
