// Nutrition facts: ingredient database (per 100 g), recipe summing, per-serving math, FDA rounding and %DV.

export const KEYS = ['kcal', 'fat', 'sat', 'trans', 'chol', 'sodium', 'carb', 'fiber', 'sugar', 'added', 'protein', 'vitD', 'ca', 'fe', 'k'] as const
export type Key = (typeof KEYS)[number]
export type Nutr = Record<Key, number>

export const UNITS: Record<Key, string> = { kcal: 'kcal', fat: 'g', sat: 'g', trans: 'g', chol: 'mg', sodium: 'mg', carb: 'g', fiber: 'g', sugar: 'g', added: 'g', protein: 'g', vitD: 'mcg', ca: 'mg', fe: 'mg', k: 'mg' }
export const LABELS: Record<Key, string> = { kcal: 'Calories', fat: 'Total Fat', sat: 'Saturated Fat', trans: 'Trans Fat', chol: 'Cholesterol', sodium: 'Sodium', carb: 'Total Carbohydrate', fiber: 'Dietary Fiber', sugar: 'Total Sugars', added: 'Added Sugars', protein: 'Protein', vitD: 'Vitamin D', ca: 'Calcium', fe: 'Iron', k: 'Potassium' }

/** FDA daily values (2,000 kcal diet, 2016 rule). */
export const DV: Partial<Record<Key, number>> = { fat: 78, sat: 20, chol: 300, sodium: 2300, carb: 275, fiber: 28, added: 50, protein: 50, vitD: 20, ca: 1300, fe: 18, k: 4700 }

export interface Food { name: string; label: string; allergen?: string; n: Nutr }

// name | label name | allergen | kcal fat sat trans chol sodium carb fiber sugar added protein vitD ca fe k   (per 100 g, USDA-based)
const RAW = `All-purpose flour|wheat flour|Wheat|364 1 0.2 0 0 2 76 2.7 0.3 0 10.3 0 15 4.6 107
Whole wheat flour|whole wheat flour|Wheat|340 2.5 0.4 0 0 2 72 10.7 0.4 0 13.2 0 34 3.6 363
Rolled oats|rolled oats||379 6.5 1.1 0 0 6 68 10 1 0 13.2 0 52 4.3 362
White rice (dry)|rice||365 0.7 0.2 0 0 5 80 1.3 0.1 0 7.1 0 28 0.8 115
Pasta (dry)|durum wheat semolina|Wheat|371 1.5 0.3 0 0 6 75 3.2 2.7 0 13 0 21 3.3 223
Granulated sugar|sugar||387 0 0 0 0 1 100 0 100 100 0 0 1 0.1 2
Brown sugar|brown sugar||380 0 0 0 0 28 98 0 97 97 0.1 0 83 0.7 133
Honey|honey||304 0 0 0 0 4 82.4 0.2 82.1 82.1 0.3 0 6 0.4 52
Maple syrup|maple syrup||260 0.1 0 0 0 12 67 0 60.5 60.5 0 0 102 0.1 212
Butter (salted)|butter (cream, salt)|Milk|717 81 51 3.3 215 643 0.1 0 0.1 0 0.9 1.5 24 0 24
Olive oil|olive oil||884 100 13.8 0 0 2 0 0 0 0 0 0 1 0.6 1
Canola oil|canola oil||884 100 7.4 0.4 0 0 0 0 0 0 0 0 0 0 0
Egg (whole)|eggs|Egg|143 9.5 3.1 0 372 142 0.7 0 0.4 0 12.6 2 56 1.8 138
Whole milk|milk|Milk|61 3.3 1.9 0 10 43 4.8 0 4.8 0 3.2 1.3 113 0 132
Greek yogurt (nonfat)|nonfat greek yogurt|Milk|59 0.4 0.1 0 5 36 3.6 0 3.2 0 10.2 0 110 0.1 141
Cheddar cheese|cheddar cheese|Milk|403 33.1 21.1 0 105 621 1.3 0 0.5 0 24.9 0.6 721 0.7 98
Chicken breast (raw)|chicken breast||120 2.6 0.6 0 73 45 0 0 0 0 22.5 0.1 5 0.4 334
Ground beef 85% (raw)|ground beef||215 15 5.9 0.9 68 66 0 0 0 0 18.6 0.1 18 2 270
Salmon (raw)|salmon|Fish|208 13.4 3.1 0 55 59 0 0 0 0 20.4 11 9 0.3 363
Black beans (cooked)|black beans||132 0.5 0.1 0 0 1 23.7 8.7 0.3 0 8.9 0 27 2.1 355
Banana|bananas||89 0.3 0.1 0 0 1 22.8 2.6 12.2 0 1.1 0 5 0.3 358
Apple|apples||52 0.2 0 0 0 1 13.8 2.4 10.4 0 0.3 0 6 0.1 107
Blueberries|blueberries||57 0.3 0 0 0 1 14.5 2.4 10 0 0.7 0 6 0.3 77
Tomato|tomatoes||18 0.2 0 0 0 5 3.9 1.2 2.6 0 0.9 0 10 0.3 237
Onion|onions||40 0.1 0 0 0 4 9.3 1.7 4.2 0 1.1 0 23 0.2 146
Carrot|carrots||41 0.2 0 0 0 69 9.6 2.8 4.7 0 0.9 0 33 0.3 320
Spinach|spinach||23 0.4 0.1 0 0 79 3.6 2.2 0.4 0 2.9 0 99 2.7 558
Walnuts|walnuts|Tree nuts (walnut)|654 65 6.1 0 0 2 13.7 6.7 2.6 0 15.2 0 98 2.9 441
Almonds|almonds|Tree nuts (almond)|579 49.9 3.8 0 0 1 21.6 12.5 4.4 0 21.2 0 269 3.7 733
Peanut butter|peanut butter (peanuts, salt)|Peanuts|588 50 10.3 0 0 426 20 6 9.2 5 25 0 43 1.9 649
Semisweet chocolate chips|semisweet chocolate chips (sugar, chocolate, cocoa butter, soy lecithin)|Soy|479 29.7 17.6 0 0 11 63.9 5.9 54.5 54 4.2 0 32 3.1 365
Cocoa powder|cocoa||228 13.7 8.1 0 0 21 57.9 37 1.8 0 19.6 0 128 13.9 1524
Tofu (firm)|tofu (soybeans, water, calcium sulfate)|Soy|144 8.7 1.3 0 0 14 2.8 2.3 0.6 0 17.3 0 683 2.7 237
Baking powder|baking powder||53 0 0 0 0 10600 27.7 0.2 0 0 0 0 5876 11 20
Baking soda|baking soda||0 0 0 0 0 27360 0 0 0 0 0 0 0 0 0
Salt|salt||0 0 0 0 0 38758 0 0 0 0 0 0 24 0.3 8
Vanilla extract|vanilla extract||288 0.1 0 0 0 9 12.7 0 12.7 12.7 0.1 0 11 0.1 148
Water|water||0 0 0 0 0 4 0 0 0 0 0 0 3 0 0`

export const FOODS: Food[] = RAW.split('\n').map((l) => {
  const [name, label, allergen, nums] = l.split('|')
  const v = nums.split(' ').map(Number)
  return { name, label, allergen: allergen || undefined, n: Object.fromEntries(KEYS.map((k, i) => [k, v[i]])) as Nutr }
})

export const zero = (): Nutr => Object.fromEntries(KEYS.map((k) => [k, 0])) as Nutr

export interface Item { grams: number; n: Nutr }

/** Sum nutrients for a recipe (each item gives grams + per-100 g values). */
export function sum(items: Item[]): Nutr {
  const t = zero()
  for (const it of items) for (const k of KEYS) t[k] += (it.n[k] * it.grams) / 100
  return t
}

export const scale = (n: Nutr, f: number): Nutr => Object.fromEntries(KEYS.map((k) => [k, n[k] * f])) as Nutr

const near = (x: number, step: number) => Math.round(x / step) * step
const tidy = (x: number) => Number(x.toFixed(2))

/** FDA label rounding (21 CFR 101.9). Returns the printed text without unit. */
export function round(k: Key, v: number): string {
  switch (k) {
    case 'kcal':
      return String(v < 5 ? 0 : v <= 50 ? near(v, 5) : near(v, 10))
    case 'fat': case 'sat': case 'trans':
      return String(v < 0.5 ? 0 : v < 5 ? tidy(near(v, 0.5)) : Math.round(v))
    case 'chol':
      return v < 2 ? '0' : v <= 5 ? 'less than 5' : String(near(v, 5))
    case 'sodium': case 'k':
      return String(v < 5 ? 0 : v <= 140 && k === 'sodium' ? near(v, 5) : near(v, 10))
    case 'carb': case 'fiber': case 'sugar': case 'added': case 'protein':
      return v < 0.5 ? '0' : v < 1 ? 'less than 1' : String(Math.round(v))
    case 'vitD': case 'fe':
      return String(tidy(near(v, 0.1)))
    case 'ca':
      return String(near(v, 10))
  }
}

/** %DV rounded to the nearest whole percent; null when the nutrient has no DV. */
export function dv(k: Key, v: number): number | null {
  const d = DV[k]
  if (!d) return null
  return Math.round((v / d) * 100)
}
