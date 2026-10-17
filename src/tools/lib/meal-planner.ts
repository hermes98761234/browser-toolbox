// Meal planner logic: ingredient parsing, unit normalisation and shopping-list aggregation.

export interface Recipe {
  id: string
  name: string
  servings: number
  tags: string
  /** One ingredient per line: "200 g pasta", "1/2 cup milk", "3 eggs". */
  ingredients: string
}
export interface Entry { recipe: string; servings: number }
export type Plan = Record<string, Entry[]> // key: `${day}-${meal}`

export interface Ingredient { qty: number; unit: string; item: string }

const MASS: Record<string, number> = { mg: 0.001, g: 1, gram: 1, grams: 1, kg: 1000, oz: 28.3495, lb: 453.592, lbs: 453.592 }
const VOL: Record<string, number> = { ml: 1, l: 1000, dl: 100, cl: 10, tsp: 5, teaspoon: 5, teaspoons: 5, tbsp: 15, tablespoon: 15, tablespoons: 15, cup: 240, cups: 240, 'fl oz': 29.5735, pint: 473.176 }
const COUNT = new Set(['can', 'cans', 'clove', 'cloves', 'bunch', 'bunches', 'slice', 'slices', 'pinch', 'pack', 'packs', 'jar', 'jars', 'pcs', 'pc', 'head', 'heads', 'sprig', 'sprigs', 'handful', 'stalk', 'stalks'])

function parseNum(s: string): number {
  const mixed = /^(\d+)\s+(\d+)\/(\d+)$/.exec(s)
  if (mixed) return +mixed[1] + +mixed[2] / +mixed[3]
  const frac = /^(\d+)\/(\d+)$/.exec(s)
  if (frac) return +frac[1] / +frac[2]
  const uni: Record<string, number> = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3 }
  if (uni[s] !== undefined) return uni[s]
  return Number(s.replace(',', '.'))
}

/** Singular, lowercase item name ("Tomatoes" → "tomato"). */
export function normItem(s: string): string {
  let x = s.toLowerCase().replace(/\(.*?\)/g, '').replace(/,.*$/, '').replace(/\s+/g, ' ').trim()
  if (/(o|ch|sh|x)es$/.test(x)) x = x.slice(0, -2)
  else if (/ies$/.test(x)) x = x.slice(0, -3) + 'y'
  else if (/[^su]s$/.test(x)) x = x.slice(0, -1)
  return x
}

export function parseIngredient(line: string): Ingredient | null {
  const t = line.trim().replace(/^[-•*]\s*/, '')
  if (!t) return null
  const m = /^((?:\d+\s+\d+\/\d+)|(?:\d+\/\d+)|(?:\d+(?:[.,]\d+)?)|[½¼¾⅓⅔])\s*(.*)$/.exec(t)
  if (!m) return { qty: 1, unit: '', item: normItem(t) }
  const qty = parseNum(m[1])
  let rest = m[2].trim()
  let unit = ''
  const um = /^(fl oz|[a-zA-Z]+)\.?\s+(?:of\s+)?(.+)$/.exec(rest)
  if (um) {
    const u = um[1].toLowerCase()
    if (u in MASS || u in VOL || COUNT.has(u)) {
      unit = u
      rest = um[2]
    }
  }
  return { qty: Number.isFinite(qty) ? qty : 1, unit, item: normItem(rest) }
}

export interface ShopItem { item: string; qty: number; unit: string; dim: 'mass' | 'vol' | 'count'; recipes: string[] }

const singular = (u: string) => (u.endsWith('es') && u !== 'pcs' ? u.slice(0, -2) : u.endsWith('s') && u !== 'pcs' ? u.slice(0, -1) : u)

/** Sums every planned recipe's ingredients, scaled by planned servings / recipe servings. */
export function shoppingList(plan: Plan, recipes: Recipe[]): ShopItem[] {
  const byId = new Map(recipes.map((r) => [r.id, r]))
  const acc = new Map<string, ShopItem>()
  for (const entries of Object.values(plan)) {
    for (const e of entries) {
      const r = byId.get(e.recipe)
      if (!r) continue
      const f = e.servings / Math.max(1, r.servings)
      for (const line of r.ingredients.split('\n')) {
        const ing = parseIngredient(line)
        if (!ing) continue
        let dim: ShopItem['dim'] = 'count'
        let qty = ing.qty * f
        let unit = ing.unit ? singular(ing.unit) : ''
        if (ing.unit in MASS) {
          dim = 'mass'
          qty *= MASS[ing.unit]
          unit = 'g'
        } else if (ing.unit in VOL) {
          dim = 'vol'
          qty *= VOL[ing.unit]
          unit = 'ml'
        }
        const key = `${ing.item}|${dim}|${unit}`
        const cur = acc.get(key) ?? { item: ing.item, qty: 0, unit, dim, recipes: [] }
        cur.qty += qty
        if (!cur.recipes.includes(r.name)) cur.recipes.push(r.name)
        acc.set(key, cur)
      }
    }
  }
  return [...acc.values()].sort((a, b) => a.item.localeCompare(b.item))
}

const round = (x: number, d = 2) => Math.round(x * 10 ** d) / 10 ** d

export function formatQty(s: Pick<ShopItem, 'qty' | 'unit' | 'dim'>): string {
  if (s.dim === 'mass') return s.qty >= 1000 ? `${round(s.qty / 1000)} kg` : `${Math.round(s.qty)} g`
  if (s.dim === 'vol') return s.qty >= 1000 ? `${round(s.qty / 1000)} l` : `${Math.round(s.qty)} ml`
  // Whole items: round up to something you can buy.
  const q = s.unit === 'pinch' ? round(s.qty, 1) : Math.ceil(s.qty * 4 - 1e-9) / 4
  return `${q}${s.unit ? ' ' + s.unit + (q > 1 && !s.unit.endsWith('s') ? 's' : '') : ''}`
}

const AISLES: [string, RegExp][] = [
  ['Pantry', /tomato paste|canned|black pepper|salt|cumin|paprika|cinnamon|oregano|stock|broth|soy sauce/],
  ['Produce', /onion|garlic|tomato|potato|carrot|pepper|lettuce|spinach|lemon|lime|apple|banana|berr|avocado|cucumber|zucchini|broccoli|mushroom|herb|basil|parsley|cilantro|ginger|celery|kale|cabbage|fruit|corn|bean sprout|scallion/],
  ['Meat & fish', /chicken|beef|pork|turkey|bacon|sausage|salmon|tuna|fish|shrimp|ham|lamb|mince/],
  ['Dairy & eggs', /milk|cheese|butter|yogurt|yoghurt|cream|egg|feta|parmesan|mozzarella/],
  ['Bakery', /bread|tortilla|bun|pita|bagel|wrap/],
  ['Pantry', /pasta|rice|flour|sugar|oil|vinegar|salt|pepper|spice|cumin|paprika|oat|lentil|bean|chickpea|stock|broth|sauce|honey|noodle|quinoa|nut|tomato paste|can/],
]
export function aisle(item: string): string {
  for (const [a, re] of AISLES) if (re.test(item)) return a
  return 'Other'
}
