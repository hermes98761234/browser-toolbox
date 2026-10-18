// Science & engineering unit converter: parses compound unit expressions (kg·m/s², J/(kg·K), kWh,
// µmol/L …) into an SI factor + a vector of base-dimension exponents, checks dimensional
// consistency and converts. Includes significant-figure helpers.

/** Base dimensions: length, mass, time, current, temperature, amount, luminous intensity. */
export const BASE = ['m', 'kg', 's', 'A', 'K', 'mol', 'cd'] as const
export type Dim = number[]

export interface Q {
  factor: number // SI value of 1 of this unit
  dim: Dim
  offset?: number // affine offset in K (temperatures only)
}

const D = (m = 0, kg = 0, s = 0, A = 0, K = 0, mol = 0, cd = 0): Dim => [m, kg, s, A, K, mol, cd]

export const PREFIXES: [string, string, number][] = [
  ['Q', 'quetta', 1e30], ['R', 'ronna', 1e27], ['Y', 'yotta', 1e24], ['Z', 'zetta', 1e21], ['E', 'exa', 1e18], ['P', 'peta', 1e15],
  ['T', 'tera', 1e12], ['G', 'giga', 1e9], ['M', 'mega', 1e6], ['k', 'kilo', 1e3], ['h', 'hecto', 1e2], ['da', 'deka', 1e1],
  ['d', 'deci', 1e-1], ['c', 'centi', 1e-2], ['m', 'milli', 1e-3], ['µ', 'micro', 1e-6], ['n', 'nano', 1e-9], ['p', 'pico', 1e-12],
  ['f', 'femto', 1e-15], ['a', 'atto', 1e-18], ['z', 'zepto', 1e-21], ['y', 'yocto', 1e-24], ['r', 'ronto', 1e-27], ['q', 'quecto', 1e-30],
]

const G0 = 9.80665
const LB = 0.45359237
const IN = 0.0254
const CAL = 4.184
const EV = 1.602176634e-19

/** symbol → [name, factor, dim, prefixable, offset?] */
export const UNITS: Record<string, [string, number, Dim, boolean, number?]> = {
  m: ['metre', 1, D(1), true], g: ['gram', 1e-3, D(0, 1), true], s: ['second', 1, D(0, 0, 1), true], A: ['ampere', 1, D(0, 0, 0, 1), true],
  K: ['kelvin', 1, D(0, 0, 0, 0, 1), true], mol: ['mole', 1, D(0, 0, 0, 0, 0, 1), true], cd: ['candela', 1, D(0, 0, 0, 0, 0, 0, 1), true],
  N: ['newton', 1, D(1, 1, -2), true], J: ['joule', 1, D(2, 1, -2), true], W: ['watt', 1, D(2, 1, -3), true], Pa: ['pascal', 1, D(-1, 1, -2), true],
  Hz: ['hertz', 1, D(0, 0, -1), true], C: ['coulomb', 1, D(0, 0, 1, 1), true], V: ['volt', 1, D(2, 1, -3, -1), true],
  Ω: ['ohm', 1, D(2, 1, -3, -2), true], ohm: ['ohm', 1, D(2, 1, -3, -2), true], S: ['siemens', 1, D(-2, -1, 3, 2), true],
  F: ['farad', 1, D(-2, -1, 4, 2), true], H: ['henry', 1, D(2, 1, -2, -2), true], T: ['tesla', 1, D(0, 1, -2, -1), true], Wb: ['weber', 1, D(2, 1, -2, -1), true],
  lm: ['lumen', 1, D(0, 0, 0, 0, 0, 0, 1), true], lx: ['lux', 1, D(-2, 0, 0, 0, 0, 0, 1), true], Bq: ['becquerel', 1, D(0, 0, -1), true],
  Gy: ['gray', 1, D(2, 0, -2), true], Sv: ['sievert', 1, D(2, 0, -2), true], kat: ['katal', 1, D(0, 0, -1, 0, 0, 1), true],
  rad: ['radian', 1, D(), true], sr: ['steradian', 1, D(), false], deg: ['degree (angle)', Math.PI / 180, D(), false], rev: ['revolution', 2 * Math.PI, D(), false],
  L: ['litre', 1e-3, D(3), true], l: ['litre', 1e-3, D(3), true], t: ['tonne', 1000, D(0, 1), true], Da: ['dalton', 1.66053906660e-27, D(0, 1), true], u: ['atomic mass unit', 1.66053906660e-27, D(0, 1), false],
  min: ['minute', 60, D(0, 0, 1), false], h: ['hour', 3600, D(0, 0, 1), false], d: ['day', 86400, D(0, 0, 1), false], yr: ['year (365.25 d)', 31557600, D(0, 0, 1), false],
  Å: ['ångström', 1e-10, D(1), false], au: ['astronomical unit', 1.495978707e11, D(1), false], ly: ['light-year', 9.4607304725808e15, D(1), false], pc: ['parsec', 3.085677581491367e16, D(1), true],
  in: ['inch', IN, D(1), false], ft: ['foot', 12 * IN, D(1), false], yd: ['yard', 36 * IN, D(1), false], mi: ['mile', 1609.344, D(1), false], nmi: ['nautical mile', 1852, D(1), false],
  ha: ['hectare', 1e4, D(2), false], acre: ['acre', 4046.8564224, D(2), false], gal: ['US gallon', 3.785411784e-3, D(3), false], qt: ['US quart', 9.46352946e-4, D(3), false], floz: ['US fluid ounce', 2.95735295625e-5, D(3), false],
  lb: ['pound (mass)', LB, D(0, 1), false], oz: ['ounce', LB / 16, D(0, 1), false], slug: ['slug', LB * G0 / (12 * IN), D(0, 1), false],
  lbf: ['pound-force', LB * G0, D(1, 1, -2), false], kgf: ['kilogram-force', G0, D(1, 1, -2), false], dyn: ['dyne', 1e-5, D(1, 1, -2), false],
  psi: ['pound per sq. inch', (LB * G0) / (IN * IN), D(-1, 1, -2), true], atm: ['standard atmosphere', 101325, D(-1, 1, -2), false], bar: ['bar', 1e5, D(-1, 1, -2), true],
  mmHg: ['millimetre of mercury', 133.322387415, D(-1, 1, -2), false], Torr: ['torr', 101325 / 760, D(-1, 1, -2), false], inHg: ['inch of mercury', 3386.389, D(-1, 1, -2), false],
  cal: ['calorie (thermochemical)', CAL, D(2, 1, -2), true], Cal: ['food Calorie', 1000 * CAL, D(2, 1, -2), false], eV: ['electronvolt', EV, D(2, 1, -2), true], erg: ['erg', 1e-7, D(2, 1, -2), false],
  BTU: ['British thermal unit (IT)', 1055.05585262, D(2, 1, -2), false], Wh: ['watt-hour', 3600, D(2, 1, -2), true], hp: ['horsepower (mech.)', 745.69987158227, D(2, 1, -3), false],
  P: ['poise', 0.1, D(-1, 1, -1), true], St: ['stokes', 1e-4, D(2, 0, -1), true], G: ['gauss', 1e-4, D(0, 1, -2, -1), false], M: ['molar (mol/L)', 1000, D(-3, 0, 0, 0, 0, 1), true],
  kn: ['knot', 1852 / 3600, D(1, 0, -1), false], mph: ['mile per hour', 1609.344 / 3600, D(1, 0, -1), false], kph: ['kilometre per hour', 1 / 3.6, D(1, 0, -1), false],
  '°C': ['degree Celsius', 1, D(0, 0, 0, 0, 1), false, 273.15], '°F': ['degree Fahrenheit', 5 / 9, D(0, 0, 0, 0, 1), false, 255.3722222222222], '°R': ['degree Rankine', 5 / 9, D(0, 0, 0, 0, 1), false, 0],
  degC: ['degree Celsius', 1, D(0, 0, 0, 0, 1), false, 273.15], degF: ['degree Fahrenheit', 5 / 9, D(0, 0, 0, 0, 1), false, 255.3722222222222],
  '%': ['percent', 0.01, D(), false], ppm: ['parts per million', 1e-6, D(), false],
}

const SUP: Record<string, string> = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-' }

/** Resolves one symbol, trying exact match first, then prefix + unit. */
export function lookup(sym: string): { q: Q; name: string } | null {
  const s = sym === 'μ' ? 'µ' : sym.replace(/^μ/, 'µ').replace(/^u(?=[a-zA-Z])/, (x) => (UNITS[sym] ? x : 'µ'))
  const ex = UNITS[sym] ?? UNITS[s]
  if (ex) return { q: { factor: ex[1], dim: ex[2], offset: ex[4] }, name: ex[0] }
  for (const [p, pn, f] of PREFIXES) {
    if (s.startsWith(p) && s.length > p.length) {
      const u = UNITS[s.slice(p.length)]
      if (u && u[3]) {
        // kg is the SI base; "kg" → kilo × gram works naturally
        return { q: { factor: f * u[1], dim: u[2] }, name: pn + u[0] }
      }
    }
  }
  return null
}

const mul = (a: Q, b: Q, sgn: number): Q => ({ factor: a.factor * Math.pow(b.factor, sgn), dim: a.dim.map((x, i) => x + sgn * b.dim[i]) })
const pow = (a: Q, n: number): Q => ({ factor: Math.pow(a.factor, n), dim: a.dim.map((x) => x * n) })

/**
 * Parses a unit expression. Products: `·`, `*`, `.` or space; `/` puts every following factor of the
 * same group in the denominator (so J/kg·K = J/(kg·K) and m/s/s = m/s²). Powers: ^2, ^-1, ², ⁻¹.
 */
export function parseUnit(expr: string): Q {
  const src = expr.trim().replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+/g, (m) => '^' + [...m].map((c) => SUP[c]).join('')).replace(/\*\*/g, '^')
  if (!src) return { factor: 1, dim: D() }
  let i = 0
  const err = (m: string) => new Error(m)
  const group = (): Q => {
    let acc: Q = { factor: 1, dim: D() }
    let sgn = 1
    for (;;) {
      while (src[i] === ' ' || src[i] === '·' || src[i] === '*' || src[i] === '⋅' || src[i] === '×') i++
      if (i >= src.length || src[i] === ')') return acc
      if (src[i] === '/') {
        sgn = -1
        i++
        continue
      }
      let q: Q
      if (src[i] === '(') {
        i++
        q = group()
        if (src[i] !== ')') throw err('Missing “)”')
        i++
      } else {
        const m = /^(?:°[CFR]|[\p{L}%Ωµμ°Å]+|1)/u.exec(src.slice(i))
        if (!m) throw err(`Unexpected “${src[i]}”`)
        i += m[0].length
        if (m[0] === '1') q = { factor: 1, dim: D() }
        else {
          const hit = lookup(m[0])
          if (!hit) throw err(`Unknown unit “${m[0]}”`)
          q = hit.q
        }
      }
      const e = /^\^?\(?(-?\d+(?:\.\d+)?)\)?/.exec(src.slice(i))
      if (e && (src[i] === '^' || /\d/.test(src[i]))) {
        i += e[0].length
        q = pow(q, Number(e[1]))
      }
      acc = mul(acc, q, sgn)
      if (src[i] === '.' && /[\p{L}(]/u.test(src[i + 1] ?? '')) i++
    }
  }
  const q = group()
  if (i < src.length) throw err(`Unexpected “${src[i]}”`)
  // a lone temperature keeps its offset for absolute conversions
  const lone = /^(°[CFR]|deg[CF]|K)$/.exec(src)
  if (lone) q.offset = lookup(lone[1])!.q.offset ?? 0
  return q
}

export const sameDim = (a: Dim, b: Dim) => a.every((x, i) => Math.abs(x - b[i]) < 1e-9)

/** Converts value from → to. Absolute temperatures use offsets when both are lone temperature units. */
export function convert(value: number, from: Q, to: Q): number {
  if (!sameDim(from.dim, to.dim)) return NaN
  if (from.offset !== undefined && to.offset !== undefined) return (value * from.factor + from.offset - to.offset) / to.factor
  return (value * from.factor) / to.factor
}

const SUPS = '⁰¹²³⁴⁵⁶⁷⁸⁹'
const sup = (n: number) => (n === 1 ? '' : String(n).replace('-', '⁻').replace(/\d/g, (d) => SUPS[+d]).replace('.', '·'))

/** SI base-unit expression, e.g. kg·m²·s⁻². */
export function dimString(d: Dim): string {
  const parts = BASE.map((b, i) => [b, d[i]] as const).filter(([, n]) => Math.abs(n) > 1e-9)
  parts.sort((a, b) => (b[1] > 0 ? 1 : 0) - (a[1] > 0 ? 1 : 0))
  return parts.map(([b, n]) => b + sup(+n.toFixed(4))).join('·') || '1 (dimensionless)'
}

export const DIM_LETTERS = ['L', 'M', 'T', 'I', 'Θ', 'N', 'J']
export function dimFormula(d: Dim): string {
  const p = DIM_LETTERS.map((b, i) => [b, d[i]] as const).filter(([, n]) => n !== 0)
  return p.length ? p.map(([b, n]) => b + sup(n)).join('') : '1'
}

export const QUANTITIES: [string, Dim, string[]][] = [
  ['Length', D(1), ['m', 'km', 'cm', 'mm', 'µm', 'nm', 'Å', 'in', 'ft', 'yd', 'mi', 'nmi', 'au', 'ly']],
  ['Mass', D(0, 1), ['kg', 'g', 'mg', 'µg', 't', 'lb', 'oz', 'slug', 'Da']],
  ['Time', D(0, 0, 1), ['s', 'ms', 'µs', 'ns', 'min', 'h', 'd', 'yr']],
  ['Temperature', D(0, 0, 0, 0, 1), ['K', '°C', '°F', '°R']],
  ['Amount', D(0, 0, 0, 0, 0, 1), ['mol', 'mmol', 'µmol', 'kmol']],
  ['Area', D(2), ['m²', 'cm²', 'mm²', 'km²', 'ha', 'acre', 'ft²', 'in²']],
  ['Volume', D(3), ['m³', 'L', 'mL', 'cm³', 'µL', 'gal', 'qt', 'floz', 'ft³', 'in³']],
  ['Velocity', D(1, 0, -1), ['m/s', 'km/h', 'mph', 'kn', 'ft/s', 'cm/s']],
  ['Acceleration', D(1, 0, -2), ['m/s²', 'ft/s²', 'cm/s²']],
  ['Force', D(1, 1, -2), ['N', 'kN', 'kg·m/s²', 'lbf', 'kgf', 'dyn']],
  ['Pressure / stress', D(-1, 1, -2), ['Pa', 'kPa', 'MPa', 'GPa', 'bar', 'atm', 'psi', 'mmHg', 'Torr', 'N/mm²']],
  ['Energy / work', D(2, 1, -2), ['J', 'kJ', 'MJ', 'cal', 'kcal', 'Cal', 'kWh', 'eV', 'BTU', 'erg', 'N·m']],
  ['Power', D(2, 1, -3), ['W', 'kW', 'MW', 'hp', 'BTU/h', 'J/s', 'erg/s']],
  ['Density', D(-3, 1), ['kg/m³', 'g/cm³', 'g/mL', 'g/L', 'lb/ft³', 'lb/in³']],
  ['Frequency', D(0, 0, -1), ['Hz', 'kHz', 'MHz', 'GHz', '1/min', 'rev/min']],
  ['Charge', D(0, 0, 1, 1), ['C', 'mC', 'µC', 'A·h', 'mA·h']],
  ['Voltage', D(2, 1, -3, -1), ['V', 'mV', 'kV', 'W/A', 'J/C']],
  ['Resistance', D(2, 1, -3, -2), ['Ω', 'kΩ', 'MΩ', 'V/A']],
  ['Capacitance', D(-2, -1, 4, 2), ['F', 'µF', 'nF', 'pF', 'C/V']],
  ['Magnetic flux density', D(0, 1, -2, -1), ['T', 'mT', 'G', 'Wb/m²']],
  ['Concentration', D(-3, 0, 0, 0, 0, 1), ['mol/L', 'M', 'mM', 'µM', 'mol/m³']],
  ['Dynamic viscosity', D(-1, 1, -1), ['Pa·s', 'mPa·s', 'P', 'cP']],
  ['Kinematic viscosity', D(2, 0, -1), ['m²/s', 'St', 'cSt', 'mm²/s']],
  ['Specific heat', D(2, 0, -2, 0, -1), ['J/(kg·K)', 'kJ/(kg·K)', 'cal/(g·°C)', 'BTU/(lb·°F)']],
  ['Thermal conductivity', D(1, 1, -3, 0, -1), ['W/(m·K)', 'BTU/(h·ft·°F)', 'cal/(s·cm·°C)']],
  ['Torque', D(2, 1, -2), ['N·m', 'lbf·ft', 'lbf·in', 'kgf·m']],
  ['Angle', D(), ['rad', 'deg', 'rev', 'mrad']],
]

export function quantityName(d: Dim): string | null {
  const hits = QUANTITIES.filter(([, qd]) => sameDim(qd, d)).map(([n]) => n)
  return hits.length ? hits.join(' / ') : null
}

// ---------- significant figures ----------

/** Counts significant figures in a typed number ("0.00450" → 3, "1200" → 2, "1200." → 4, "1.20e3" → 3). */
export function sigFigs(text: string): number {
  const t = text.trim().replace(/^[+-]/, '').toLowerCase()
  const mant = t.split('e')[0]
  if (!/^\d*\.?\d*$/.test(mant) || !/\d/.test(mant)) return NaN
  const hasDot = mant.includes('.')
  let digits = mant.replace('.', '').replace(/^0+/, '')
  if (!digits) return 1 // zero
  if (!hasDot) digits = digits.replace(/0+$/, '') || digits[0]
  return digits.length
}

/** Rounds to n significant figures. */
export function roundSig(x: number, n: number): number {
  if (!Number.isFinite(x) || x === 0) return x
  return Number(x.toPrecision(Math.max(1, Math.min(17, n))))
}

/** Formats with n significant figures, switching to ×10ⁿ notation for very large/small numbers. */
export function fmtSig(x: number, n: number, mode: 'auto' | 'sci' | 'eng' = 'auto'): string {
  if (!Number.isFinite(x)) return '—'
  if (x === 0) return n > 1 ? '0.' + '0'.repeat(n - 1) : '0'
  n = Math.max(1, Math.min(17, n))
  let e = Math.floor(Math.log10(Math.abs(roundSig(x, n))))
  if (mode === 'auto' && e >= -3 && e < 6) {
    const s = x.toPrecision(n)
    return s.includes('e') ? Number(s).toString() : s
  }
  if (mode === 'eng') e = Math.floor(e / 3) * 3
  const m = x / Math.pow(10, e)
  const lead = Math.floor(Math.log10(Math.abs(Number(m.toPrecision(n))))) + 1
  const ms = m.toFixed(Math.max(0, n - lead))
  return e === 0 ? ms : `${ms} × 10${sup(e) || '¹'}`
}
