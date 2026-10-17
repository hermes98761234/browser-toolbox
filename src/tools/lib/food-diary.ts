// Food diary: a compact bundled nutrition table (per 100 g, USDA FoodData Central approximations),
// fuzzy search and nutrient totals.

export interface Food {
  name: string
  kcal: number
  protein: number
  carbs: number
  fat: number
  fiber: number
  /** typical serving in grams and its label */
  serving: number
  unit: string
}

// name|kcal|protein|carbs|fat|fiber|serving g|serving label   (values per 100 g)
const RAW = `Apple|52|0.3|13.8|0.2|2.4|182|1 medium
Banana|89|1.1|22.8|0.3|2.6|118|1 medium
Orange|47|0.9|11.8|0.1|2.4|131|1 medium
Strawberries|32|0.7|7.7|0.3|2|150|1 cup
Blueberries|57|0.7|14.5|0.3|2.4|148|1 cup
Grapes|69|0.7|18.1|0.2|0.9|151|1 cup
Pear|57|0.4|15.2|0.1|3.1|178|1 medium
Mango|60|0.8|15|0.4|1.6|165|1 cup
Pineapple|50|0.5|13.1|0.1|1.4|165|1 cup
Watermelon|30|0.6|7.6|0.2|0.4|280|1 wedge
Kiwi|61|1.1|14.7|0.5|3|69|1 fruit
Avocado|160|2|8.5|14.7|6.7|150|1 fruit
Raisins|299|3.1|79.2|0.5|3.7|40|small box
Broccoli, cooked|35|2.4|7.2|0.4|3.3|156|1 cup
Carrot, raw|41|0.9|9.6|0.2|2.8|61|1 medium
Spinach, raw|23|2.9|3.6|0.4|2.2|30|1 cup
Tomato|18|0.9|3.9|0.2|1.2|123|1 medium
Cucumber|15|0.7|3.6|0.1|0.5|150|1/2 cucumber
Bell pepper, red|31|1|6|0.3|2.1|119|1 medium
Lettuce, romaine|17|1.2|3.3|0.3|2.1|47|1 cup
Onion|40|1.1|9.3|0.1|1.7|110|1 medium
Potato, baked|93|2.5|21.2|0.1|2.2|173|1 medium
Sweet potato, baked|90|2|20.7|0.2|3.3|114|1 medium
French fries|312|3.4|41|15|3.8|117|medium serving
Green peas, cooked|84|5.4|15.6|0.2|5.5|160|1 cup
Corn, sweet, cooked|96|3.4|21|1.5|2.4|145|1 cup
Mushrooms|22|3.1|3.3|0.3|1|70|1 cup sliced
Zucchini|17|1.2|3.1|0.3|1|124|1 cup
Cauliflower|25|1.9|5|0.3|2|107|1 cup
Green beans, cooked|35|1.9|7.9|0.3|3.2|125|1 cup
White rice, cooked|130|2.7|28.2|0.3|0.4|158|1 cup
Brown rice, cooked|123|2.7|25.6|1|1.6|195|1 cup
Pasta, cooked|158|5.8|30.9|0.9|1.8|140|1 cup
Whole wheat bread|247|13|41|3.4|7|32|1 slice
White bread|265|9|49|3.2|2.7|28|1 slice
Bagel|257|10|50.5|1.6|2.2|105|1 bagel
Oats, dry|389|16.9|66.3|6.9|10.6|40|1/2 cup
Oatmeal, cooked|71|2.5|12|1.5|1.7|234|1 cup
Corn flakes|357|7.5|84|0.4|3.3|28|1 cup
Granola|471|10|64|20|5|60|1/2 cup
Quinoa, cooked|120|4.4|21.3|1.9|2.8|185|1 cup
Couscous, cooked|112|3.8|23.2|0.2|1.4|157|1 cup
Tortilla, flour|312|8.3|51.6|7.7|3.4|45|1 tortilla
Croissant|406|8.2|45.8|21|2.6|57|1 croissant
Pancakes|227|6.4|28.3|9.7|1.1|77|2 small
Egg, whole, boiled|155|12.6|1.1|10.6|0|50|1 large
Egg, fried|196|13.6|0.8|14.8|0|46|1 large
Egg white|52|10.9|0.7|0.2|0|33|1 large
Chicken breast, grilled|165|31|0|3.6|0|120|1 fillet
Chicken thigh, roasted|209|26|0|10.9|0|85|1 thigh
Turkey breast, roasted|135|30|0|1|0|85|3 oz
Beef steak, sirloin|206|29|0|9.4|0|170|1 steak
Ground beef 85%, cooked|250|26|0|15|0|85|3 oz patty
Pork chop, cooked|231|25.7|0|13.5|0|145|1 chop
Bacon, cooked|541|37|1.4|42|0|16|2 slices
Ham, sliced|145|21|1.5|5.5|0|28|1 slice
Salmon, baked|206|22.1|0|12.4|0|150|1 fillet
Tuna, canned in water|116|25.5|0|0.8|0|85|1/2 can
Cod, baked|105|22.8|0|0.9|0|150|1 fillet
Shrimp, cooked|99|24|0.2|0.3|0|85|3 oz
Tofu, firm|144|17.3|2.8|8.7|2.3|126|1/2 cup
Lentils, cooked|116|9|20.1|0.4|7.9|198|1 cup
Chickpeas, cooked|164|8.9|27.4|2.6|7.6|164|1 cup
Black beans, cooked|132|8.9|23.7|0.5|8.7|172|1 cup
Hummus|166|7.9|14.3|9.6|6|30|2 tbsp
Milk, whole|61|3.2|4.8|3.3|0|244|1 cup
Milk, skim|34|3.4|5|0.1|0|245|1 cup
Oat milk|47|1|6.7|1.5|0.8|240|1 cup
Greek yogurt, plain|97|9|3.9|5|0|170|1 pot
Greek yogurt, nonfat|59|10.2|3.6|0.4|0|170|1 pot
Yogurt, fruit|99|4|18.6|1.4|0|150|1 pot
Cheddar cheese|403|24.9|1.3|33.1|0|28|1 slice
Mozzarella|280|27.5|3.1|17.1|0|28|1 oz
Cottage cheese|98|11.1|3.4|4.3|0|113|1/2 cup
Parmesan|431|38.5|4.1|28.6|0|5|1 tbsp
Butter|717|0.9|0.1|81.1|0|14|1 tbsp
Olive oil|884|0|0|100|0|13.5|1 tbsp
Peanut butter|588|25|20|50|6|32|2 tbsp
Almonds|579|21.2|21.6|49.9|12.5|28|1 handful
Walnuts|654|15.2|13.7|65.2|6.7|28|1 handful
Cashews|553|18.2|30.2|43.8|3.3|28|1 handful
Peanuts|567|25.8|16.1|49.2|8.5|28|1 handful
Chia seeds|486|16.5|42.1|30.7|34.4|12|1 tbsp
Dark chocolate 70%|598|7.8|45.9|42.6|10.9|20|2 squares
Milk chocolate|535|7.7|59.4|29.7|3.4|44|1 bar
Potato chips|536|7|53|35|4.8|28|1 small bag
Popcorn, air-popped|387|12.9|77.8|4.5|14.5|8|1 cup
Cookie, chocolate chip|488|5.4|64|24|2.4|16|1 cookie
Ice cream, vanilla|207|3.5|23.6|11|0.7|66|1/2 cup
Pizza, cheese|266|11.4|33.3|9.7|2.3|107|1 slice
Hamburger|254|13|29|10|1.5|110|1 burger
Cheeseburger|263|14|26|12|1.5|120|1 burger
Caesar salad|127|4.5|6|9.5|1.5|200|1 bowl
Sushi, salmon roll|150|6|26|3|0.5|180|6 pieces
Burrito, bean|190|7|28|5|4|220|1 burrito
Spaghetti bolognese|132|7|15|4.6|1.5|350|1 plate
Chicken noodle soup|30|2.4|3.6|0.7|0.3|245|1 bowl
Honey|304|0.3|82.4|0|0.2|21|1 tbsp
Sugar|387|0|100|0|0|4|1 tsp
Jam|278|0.4|69|0.1|1.1|20|1 tbsp
Ketchup|101|1|27|0.1|0.3|17|1 tbsp
Mayonnaise|680|1|0.6|75|0|14|1 tbsp
Orange juice|45|0.7|10.4|0.2|0.2|248|1 cup
Coffee, black|1|0.1|0|0|0|240|1 cup
Latte|54|3.2|4.6|2.6|0|360|grande
Tea, unsweetened|1|0|0.3|0|0|240|1 cup
Cola|42|0|10.6|0|0|330|1 can
Beer|43|0.5|3.6|0|0|355|1 bottle
Red wine|85|0.1|2.6|0|0|150|1 glass
Protein shake (whey)|375|75|9|5|0|32|1 scoop
Protein bar|380|30|40|12|6|60|1 bar`

export const FOODS: Food[] = RAW.split('\n').map((l) => {
  const [name, kcal, protein, carbs, fat, fiber, serving, unit] = l.split('|')
  return { name, kcal: +kcal, protein: +protein, carbs: +carbs, fat: +fat, fiber: +fiber, serving: +serving, unit }
})

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

/** Fuzzy score of `q` against `name` (higher is better, 0 = no match). Every query token must match. */
export function fuzzyScore(q: string, name: string): number {
  const n = norm(name)
  const tokens = norm(q).split(/[\s,]+/).filter(Boolean)
  if (!tokens.length) return 0
  let total = 0
  for (const t of tokens) {
    const at = n.indexOf(t)
    if (at >= 0) {
      const wordStart = at === 0 || /[\s,(-]/.test(n[at - 1])
      total += 10 + t.length * 2 + (at === 0 ? 8 : wordStart ? 5 : 0)
      continue
    }
    // subsequence match with gap penalty (typos like "chkn" → chicken)
    let i = 0, gaps = 0, last = -1
    for (const ch of t) {
      const k = n.indexOf(ch, i)
      if (k < 0) return 0
      if (last >= 0 && k > last + 1) gaps += k - last - 1
      last = k
      i = k + 1
    }
    const sc = t.length * 2 - gaps * 0.6
    if (sc <= 0 || t.length < 2) return 0
    total += sc
  }
  return total - n.length * 0.05
}

export function searchFoods<T extends Food>(q: string, foods: T[], limit = 8): T[] {
  return foods
    .map((f) => ({ f, s: fuzzyScore(q, f.name) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.f)
}

export interface Nutrients { kcal: number; protein: number; carbs: number; fat: number; fiber: number }
export const NUTRIENTS = ['kcal', 'protein', 'carbs', 'fat', 'fiber'] as const

/** Nutrients for `grams` of a food given per-100 g values. */
export function scale(per100: Nutrients, grams: number): Nutrients {
  const k = grams / 100
  return { kcal: per100.kcal * k, protein: per100.protein * k, carbs: per100.carbs * k, fat: per100.fat * k, fiber: per100.fiber * k }
}

export function sum(list: Nutrients[]): Nutrients {
  const z: Nutrients = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }
  for (const n of list) for (const k of NUTRIENTS) z[k] += n[k]
  return z
}

/** Share of energy from protein / carbs / fat using Atwater factors 4 / 4 / 9 kcal per gram. */
export function energySplit(n: Nutrients) {
  const p = n.protein * 4, c = n.carbs * 4, f = n.fat * 9
  const t = p + c + f || 1
  return { protein: p / t, carbs: c / t, fat: f / t }
}
