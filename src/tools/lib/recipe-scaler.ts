// Ingredient line parser, scaler and unit normalizer.

export type Kind = 'volume' | 'mass' | 'count'

interface UnitDef { id: string; kind: Kind; base: number; names: string[]; metric?: boolean }

// base: ml for volume, g for mass
export const UNITS: UnitDef[] = [
  { id: 'tsp', kind: 'volume', base: 4.92892, names: ['tsp', 'tsps', 'teaspoon', 'teaspoons', 't'] },
  { id: 'tbsp', kind: 'volume', base: 14.7868, names: ['tbsp', 'tbsps', 'tbs', 'tbl', 'tablespoon', 'tablespoons', 'T'] },
  { id: 'fl oz', kind: 'volume', base: 29.5735, names: ['fl oz', 'fl. oz', 'fl. oz.', 'floz', 'fluid ounce', 'fluid ounces'] },
  { id: 'cup', kind: 'volume', base: 236.588, names: ['cup', 'cups', 'c'] },
  { id: 'pint', kind: 'volume', base: 473.176, names: ['pint', 'pints', 'pt'] },
  { id: 'quart', kind: 'volume', base: 946.353, names: ['quart', 'quarts', 'qt'] },
  { id: 'gallon', kind: 'volume', base: 3785.41, names: ['gallon', 'gallons', 'gal'] },
  { id: 'ml', kind: 'volume', base: 1, metric: true, names: ['ml', 'mL', 'milliliter', 'milliliters', 'millilitre', 'millilitres'] },
  { id: 'l', kind: 'volume', base: 1000, metric: true, names: ['l', 'L', 'liter', 'liters', 'litre', 'litres'] },
  { id: 'g', kind: 'mass', base: 1, metric: true, names: ['g', 'gram', 'grams', 'gr'] },
  { id: 'kg', kind: 'mass', base: 1000, metric: true, names: ['kg', 'kilogram', 'kilograms', 'kilo', 'kilos'] },
  { id: 'oz', kind: 'mass', base: 28.3495, names: ['oz', 'ounce', 'ounces'] },
  { id: 'lb', kind: 'mass', base: 453.592, names: ['lb', 'lbs', 'pound', 'pounds'] },
]

const UNIT_BY_NAME = new Map<string, UnitDef>()
for (const u of UNITS) for (const n of u.names) UNIT_BY_NAME.set(n.length <= 1 ? n : n.toLowerCase(), u)
export const unitById = (id: string) => UNITS.find((u) => u.id === id)

const VULGAR: Record<string, number> = { '½': 1 / 2, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 1 / 4, '¾': 3 / 4, '⅕': 0.2, '⅖': 0.4, '⅗': 0.6, '⅘': 0.8, '⅙': 1 / 6, '⅚': 5 / 6, '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875 }

export interface Ingredient {
  raw: string
  qty: number | null
  qty2: number | null // upper bound of a range
  unit: string | null // unit id
  text: string
}

const NUM = String.raw`(?:\d+\s+\d+\s*/\s*\d+|\d+\s*[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]|\d+\s*/\s*\d+|\d*[.,]\d+|\d+|[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])`

/** Parses "1 1/2", "1½", "3/4", "0.5", "1,5", "½". */
export function parseNumber(s: string): number {
  s = s.trim()
  let m = /^(\d+)\s+(\d+)\s*\/\s*(\d+)$/.exec(s)
  if (m) return +m[1] + +m[2] / +m[3]
  m = /^(\d+)\s*([½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])$/.exec(s)
  if (m) return +m[1] + VULGAR[m[2]]
  m = /^(\d+)\s*\/\s*(\d+)$/.exec(s)
  if (m) return +m[2] ? +m[1] / +m[2] : NaN
  if (s in VULGAR) return VULGAR[s]
  return Number(s.replace(',', '.'))
}

const LINE = new RegExp(String.raw`^\s*(?:[-*•]\s*)?(${NUM})(?:\s*(?:-|–|to)\s*(${NUM}))?\s*(.*)$`)

export function parseLine(raw: string): Ingredient {
  const m = LINE.exec(raw)
  if (!m) return { raw, qty: null, qty2: null, unit: null, text: raw.replace(/^\s*[-*•]\s*/, '').trim() }
  const qty = parseNumber(m[1])
  const qty2 = m[2] ? parseNumber(m[2]) : null
  let rest = m[3]
  let unit: string | null = null
  // longest unit name first, must end at a word boundary
  const um = /^(fl\.?\s*oz\.?|fluid ounces?|[A-Za-z]+\.?)(?=\s|$|,|\))/.exec(rest)
  if (um) {
    const name = um[1].replace(/\.$/, '').replace(/\s+/g, ' ')
    const def = UNIT_BY_NAME.get(name) ?? UNIT_BY_NAME.get(name.toLowerCase())
    // single letters (t, T, c) only count when followed by whitespace and more text
    if (def && (name.length > 1 || /^\w\s+\S/.test(rest))) {
      unit = def.id
      rest = rest.slice(um[0].length)
    }
  }
  return { raw, qty, qty2, unit, text: rest.trim().replace(/^of\s+/i, '') }
}

const FRACS: [number, string][] = [[0, ''], [1 / 8, '⅛'], [1 / 4, '¼'], [1 / 3, '⅓'], [3 / 8, '⅜'], [1 / 2, '½'], [5 / 8, '⅝'], [2 / 3, '⅔'], [3 / 4, '¾'], [7 / 8, '⅞'], [1, '']]

/** Kitchen-friendly number: fractions for small US quantities, rounded decimals otherwise. */
export function fmtQty(x: number, fractions = true): string {
  if (!Number.isFinite(x)) return '?'
  if (x >= 100) return String(Math.round(x))
  if (x >= 10) return String(Math.round(x * 2) / 2)
  if (fractions) {
    const whole = Math.floor(x)
    const f = x - whole
    let best = FRACS[0]
    for (const c of FRACS) if (Math.abs(c[0] - f) < Math.abs(best[0] - f)) best = c
    if (Math.abs(best[0] - f) <= 0.04) {
      const w = whole + (best[0] === 1 ? 1 : 0)
      if (!best[1]) return String(w)
      return w ? `${w} ${best[1]}` : best[1]
    }
  }
  return String(Math.round(x * 100) / 100)
}

export type Mode = 'keep' | 'tidy' | 'metric' | 'us'

const US_VOL = ['tsp', 'tbsp', 'cup', 'quart', 'gallon']
const US_MASS = ['oz', 'lb']

function bestUnit(baseAmount: number, kind: Kind, metric: boolean): string {
  if (kind === 'mass') {
    if (metric) return baseAmount >= 1000 ? 'kg' : 'g'
    return baseAmount >= 453.592 ? 'lb' : 'oz'
  }
  if (metric) return baseAmount >= 1000 ? 'l' : 'ml'
  // US volume: largest unit giving >= 1 (cups from 1/4 cup = 4 tbsp)
  const ml = baseAmount
  if (ml >= 3785.41 * 1) return 'gallon'
  if (ml >= 946.353 * 1) return 'quart'
  if (ml >= 236.588 / 4 - 0.01) return 'cup'
  if (ml >= 14.7868 - 0.01) return 'tbsp'
  return 'tsp'
}

export interface Scaled { qty: number | null; qty2: number | null; unit: string | null; text: string; plus?: { qty: number; unit: string } }

/** True when x reads cleanly as a kitchen fraction (eighths or thirds). */
export function isNice(x: number): boolean {
  if (x >= 10) return true
  const f = x - Math.floor(x)
  return FRACS.some(([v]) => Math.abs(v - f) <= 0.04)
}

const US_STEPS: [string, number, number][] = [['gallon', 1, Infinity], ['quart', 2, 4], ['cup', 0.25, 8.01], ['tbsp', 1, 16], ['tsp', 0, 12]]

/** US volume: largest unit whose amount is clean; otherwise "N tbsp + M tsp" style split. */
function usVolume(ml: number): { unit: string; qty: number; plus?: { qty: number; unit: string } } {
  const all = US_STEPS.map(([id, min, max]) => ({ id, q: ml / unitById(id)!.base, min, max }))
  let cands = all.filter((c) => c.q >= c.min - 1e-3 && c.q < c.max)
  if (!cands.length) cands = all.filter((c) => c.q >= c.min - 1e-3)
  const nice = cands.find((c) => isNice(c.q))
  const first = cands[0]
  if (nice && (nice === first || nice.id !== 'tsp' || first.id !== 'tbsp')) return { unit: nice.id, qty: nice.q }
  // split whole units of the first candidate + remainder in the next smaller unit
  const idx = US_STEPS.findIndex(([id]) => id === first.id)
  const next = US_STEPS[idx + 1]
  if (next && Math.floor(first.q) >= 1) {
    const whole = Math.floor(first.q)
    const rest = (ml - whole * unitById(first.id)!.base) / unitById(next[0])!.base
    if (rest > 0.05 && isNice(rest)) return { unit: first.id, qty: whole, plus: { qty: rest, unit: next[0] } }
  }
  return nice ? { unit: nice.id, qty: nice.q } : { unit: first.id, qty: first.q }
}

export function scaleIngredient(ing: Ingredient, factor: number, mode: Mode): Scaled {
  if (ing.qty === null) return { qty: null, qty2: null, unit: null, text: ing.text }
  const q = ing.qty * factor
  const q2 = ing.qty2 === null ? null : ing.qty2 * factor
  const def = ing.unit ? unitById(ing.unit) : undefined
  if (!def || mode === 'keep') return { qty: q, qty2: q2, unit: ing.unit, text: ing.text }
  const metric = mode === 'metric' ? true : mode === 'us' ? false : !!def.metric
  if (mode === 'tidy' && !def.metric && ![...US_VOL, ...US_MASS].includes(def.id)) return { qty: q, qty2: q2, unit: ing.unit, text: ing.text }
  if (def.kind === 'volume' && !metric && q2 === null) {
    const r = usVolume(q * def.base)
    return { qty: r.qty, qty2: null, unit: r.unit, text: ing.text, plus: r.plus }
  }
  const target = unitById(bestUnit(q * def.base, def.kind, metric))!
  const conv = (v: number) => (v * def.base) / target.base
  return { qty: conv(q), qty2: q2 === null ? null : conv(q2), unit: target.id, text: ing.text }
}

export function formatScaled(s: Scaled): string {
  if (s.qty === null) return s.text
  const metric = s.unit ? !!unitById(s.unit)?.metric : false
  const f = (v: number) => (metric && s.unit && ['g', 'ml'].includes(s.unit) ? String(v >= 10 ? Math.round(v) : Math.round(v * 10) / 10) : fmtQty(v, !metric))
  const n = s.qty2 === null ? f(s.qty) : `${f(s.qty)}–${f(s.qty2)}`
  let unit = s.unit ?? ''
  const plural = (s.qty2 ?? s.qty) > 1
  if (plural && ['cup', 'pint', 'quart', 'gallon'].includes(unit)) unit += 's'
  const plus = s.plus ? ` + ${fmtQty(s.plus.qty)} ${s.plus.unit}` : ''
  return [n, unit + plus, s.text].filter(Boolean).join(' ')
}
