// Kitchen conversions: volume ⇄ volume, weight ⇄ weight, and volume ⇄ weight through ingredient density.

export type UnitKind = 'volume' | 'weight'
export interface Unit { id: string; name: string; kind: UnitKind; base: number; aliases: string[] }

/** base = millilitres for volume units, grams for weight units. US customary unless marked. */
export const UNITS: Unit[] = [
  { id: 'tsp', name: 'teaspoon', kind: 'volume', base: 4.92892, aliases: ['tsp', 'tsps', 't', 'teaspoon', 'teaspoons'] },
  { id: 'tbsp', name: 'tablespoon', kind: 'volume', base: 14.7868, aliases: ['tbsp', 'tbsps', 'tbs', 'tbl', 'T', 'tablespoon', 'tablespoons'] },
  { id: 'floz', name: 'fluid ounce', kind: 'volume', base: 29.5735, aliases: ['fl oz', 'floz', 'fl. oz', 'fluid ounce', 'fluid ounces'] },
  { id: 'cup', name: 'US cup', kind: 'volume', base: 236.588, aliases: ['cup', 'cups', 'c'] },
  { id: 'mcup', name: 'metric cup', kind: 'volume', base: 250, aliases: ['metric cup', 'metric cups'] },
  { id: 'pint', name: 'US pint', kind: 'volume', base: 473.176, aliases: ['pint', 'pints', 'pt'] },
  { id: 'quart', name: 'US quart', kind: 'volume', base: 946.353, aliases: ['quart', 'quarts', 'qt'] },
  { id: 'gal', name: 'US gallon', kind: 'volume', base: 3785.41, aliases: ['gallon', 'gallons', 'gal'] },
  { id: 'ml', name: 'millilitre', kind: 'volume', base: 1, aliases: ['ml', 'milliliter', 'milliliters', 'millilitre', 'millilitres', 'cc'] },
  { id: 'l', name: 'litre', kind: 'volume', base: 1000, aliases: ['l', 'liter', 'liters', 'litre', 'litres'] },
  { id: 'g', name: 'gram', kind: 'weight', base: 1, aliases: ['g', 'gr', 'gram', 'grams'] },
  { id: 'kg', name: 'kilogram', kind: 'weight', base: 1000, aliases: ['kg', 'kilo', 'kilos', 'kilogram', 'kilograms'] },
  { id: 'oz', name: 'ounce', kind: 'weight', base: 28.3495, aliases: ['oz', 'ounce', 'ounces'] },
  { id: 'lb', name: 'pound', kind: 'weight', base: 453.592, aliases: ['lb', 'lbs', 'pound', 'pounds'] },
]
export const unit = (id: string) => UNITS.find((u) => u.id === id)!

/** Grams per US cup (236.6 mL), from common baking references (King Arthur style values). */
export const INGREDIENTS: [string, number, string][] = [
  ['Water', 236.6, 'Liquids'], ['Milk', 242, 'Liquids'], ['Heavy cream', 238, 'Liquids'], ['Buttermilk', 242, 'Liquids'],
  ['Vegetable oil', 218, 'Liquids'], ['Olive oil', 216, 'Liquids'], ['Honey', 340, 'Liquids'], ['Maple syrup', 322, 'Liquids'],
  ['Molasses', 337, 'Liquids'], ['Corn syrup', 328, 'Liquids'], ['Eggs, beaten', 243, 'Liquids'], ['Vanilla extract', 208, 'Liquids'], ['Lemon juice', 240, 'Liquids'],
  ['All-purpose flour', 120, 'Flours'], ['Bread flour', 127, 'Flours'], ['Cake flour', 114, 'Flours'], ['Whole wheat flour', 113, 'Flours'],
  ['Rye flour', 106, 'Flours'], ['Almond flour', 96, 'Flours'], ['Cornmeal', 138, 'Flours'], ['Cornstarch', 112, 'Flours'],
  ['Cocoa powder', 84, 'Flours'], ['Semolina', 163, 'Flours'],
  ['Granulated sugar', 198, 'Sugars'], ['Brown sugar, packed', 213, 'Sugars'], ['Powdered sugar', 113, 'Sugars'], ['Coconut sugar', 151, 'Sugars'],
  ['Butter', 227, 'Dairy & fats'], ['Sour cream', 227, 'Dairy & fats'], ['Greek yogurt', 227, 'Dairy & fats'], ['Cream cheese', 227, 'Dairy & fats'],
  ['Grated Parmesan', 100, 'Dairy & fats'], ['Shredded cheddar', 113, 'Dairy & fats'], ['Peanut butter', 270, 'Dairy & fats'], ['Coconut oil', 218, 'Dairy & fats'],
  ['Rolled oats', 89, 'Grains & nuts'], ['White rice, uncooked', 198, 'Grains & nuts'], ['Quinoa, uncooked', 177, 'Grains & nuts'],
  ['Walnuts, chopped', 113, 'Grains & nuts'], ['Almonds, whole', 142, 'Grains & nuts'], ['Pecans, chopped', 113, 'Grains & nuts'],
  ['Chocolate chips', 170, 'Grains & nuts'], ['Raisins', 149, 'Grains & nuts'], ['Shredded coconut', 85, 'Grains & nuts'],
  ['Breadcrumbs', 112, 'Grains & nuts'], ['Panko', 50, 'Grains & nuts'],
  ['Table salt', 288, 'Leaveners & salt'], ['Kosher salt (Diamond)', 135, 'Leaveners & salt'], ['Kosher salt (Morton)', 241, 'Leaveners & salt'],
  ['Baking powder', 192, 'Leaveners & salt'], ['Baking soda', 288, 'Leaveners & salt'], ['Instant yeast', 149, 'Leaveners & salt'],
  ['Ground cinnamon', 125, 'Leaveners & salt'],
]
export const CUP_ML = 236.588
/** Density in g/mL. */
export const density = (gPerCup: number) => gPerCup / CUP_ML

/** Converts amount between units; crossing volume/weight needs a density (g/mL). NaN if impossible. */
export function convert(amount: number, from: string, to: string, gPerMl?: number): number {
  const a = unit(from), b = unit(to)
  if (a.kind === b.kind) return (amount * a.base) / b.base
  if (!gPerMl || !(gPerMl > 0)) return NaN
  if (a.kind === 'volume') return (amount * a.base * gPerMl) / b.base
  return (amount * a.base) / gPerMl / b.base
}

const FRAC: Record<string, number> = { '½': 0.5, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 0.25, '¾': 0.75, '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875, '⅕': 0.2 }

/** Parses "1", "1.5", "1/2", "1 1/2", "1½", "½". Returns NaN when not a quantity. */
export function parseQty(s: string): number {
  const t = s.trim().replace(/([0-9])([½⅓⅔¼¾⅛⅜⅝⅞⅕])/, '$1 $2')
  if (!t) return NaN
  let total = 0
  for (const part of t.split(/\s+/)) {
    if (FRAC[part] !== undefined) total += FRAC[part]
    else if (/^\d+\/\d+$/.test(part)) {
      const [n, d] = part.split('/').map(Number)
      if (!d) return NaN
      total += n / d
    } else if (/^\d*\.?\d+$/.test(part)) total += Number(part)
    else return NaN
  }
  return total
}

export interface Parsed { qty: number; unit: string | null; rest: string }

/** Parses a recipe line like "1 1/2 cups all-purpose flour, sifted". */
export function parseLine(line: string): Parsed | null {
  const m = /^\s*((?:\d+\s+)?\d+\/\d+|\d*\.?\d+\s*[½⅓⅔¼¾⅛⅜⅝⅞⅕]?|[½⅓⅔¼¾⅛⅜⅝⅞⅕])\s*(.*)$/.exec(line)
  if (!m) return null
  const qty = parseQty(m[1])
  if (!Number.isFinite(qty)) return null
  let rest = m[2].trim()
  let found: string | null = null
  const all = UNITS.flatMap((u) => u.aliases.map((a) => [a, u.id] as const)).sort((x, y) => y[0].length - x[0].length)
  for (const [a, id] of all) {
    const esc = a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(`^${esc}\\.?(?=\\s|$|,)`, a === 'T' || a === 't' ? '' : 'i')
    if (re.test(rest)) {
      found = id
      rest = rest.replace(re, '').trim()
      break
    }
  }
  rest = rest.replace(/^of\s+/i, '')
  return { qty, unit: found, rest }
}

/** Fuzzy score: higher is better, 0 = no match. Substring hits beat subsequence hits. */
export function fuzzy(query: string, name: string): number {
  const q = query.toLowerCase().trim(), n = name.toLowerCase()
  if (!q) return 1
  const i = n.indexOf(q)
  if (i >= 0) {
    const end = i + q.length
    const whole = (i === 0 || /[\s,(-]/.test(n[i - 1])) && (end === n.length || /[\s,)]/.test(n[end]))
    return 100 - i + (i === 0 || n[i - 1] === ' ' ? 20 : 0) + (whole ? 15 : 0) - (n.length - q.length) * 0.1
  }
  const words = q.split(/[\s,]+/).filter(Boolean)
  if (words.length > 1 && words.every((w) => n.includes(w))) return 60
  let j = 0, gaps = 0, last = -1
  for (const ch of q) {
    if (ch === ' ') continue
    const k = n.indexOf(ch, j)
    if (k < 0) return 0
    if (last >= 0) gaps += k - last - 1
    last = k
    j = k + 1
  }
  return Math.max(1, 40 - gaps)
}

/** Best ingredient for a free-text description, or null. */
export function matchIngredient(text: string): [string, number, string] | null {
  const words = text.toLowerCase().replace(/\(.*?\)|,.*$/g, '').trim()
  if (!words) return null
  let best: [string, number, string] | null = null
  let bs = 0
  for (const ing of INGREDIENTS) {
    const name = ing[0].toLowerCase()
    let sc = fuzzy(words, ing[0])
    // Reverse match: every word of the ingredient appears in the line ("flour" in "sifted all-purpose flour").
    const parts = name.replace(/[,()]/g, '').split(/\s+/).filter((w) => w.length > 2)
    if (parts.length && parts.every((w) => words.includes(w))) sc = Math.max(sc, 70 + parts.length * 5)
    if (sc > bs) { bs = sc; best = ing }
  }
  return bs >= 30 ? best : null
}

/** Rounds to friendly kitchen precision. */
export function nice(x: number): string {
  if (!Number.isFinite(x)) return '—'
  const a = Math.abs(x)
  const d = a >= 100 ? 0 : a >= 10 ? 1 : a >= 1 ? 2 : 3
  return Number(x.toFixed(d)).toLocaleString('en-US')
}

/** Nearest common fraction for cups/spoons (eighths and thirds). */
export function fraction(x: number): string {
  if (!Number.isFinite(x) || x <= 0) return '—'
  const whole = Math.floor(x + 1e-9)
  const f = x - whole
  const cands: [number, string][] = [[0, ''], [1 / 8, '⅛'], [1 / 4, '¼'], [1 / 3, '⅓'], [3 / 8, '⅜'], [1 / 2, '½'], [5 / 8, '⅝'], [2 / 3, '⅔'], [3 / 4, '¾'], [7 / 8, '⅞'], [1, '']]
  let best = cands[0]
  for (const c of cands) if (Math.abs(c[0] - f) < Math.abs(best[0] - f)) best = c
  const w = best[0] === 1 ? whole + 1 : whole
  const s = `${w || ''}${w && best[1] ? ' ' : ''}${best[1]}`
  return (Math.abs(best[0] - f) > 0.02 ? '≈ ' : '') + (s || '0')
}
