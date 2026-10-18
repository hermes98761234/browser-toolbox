// Grocery list sorter: parse free-text list lines, classify items into store sections by keyword, sort by a store layout.

export interface Section { id: string; name: string; icon: string }

export const SECTIONS: Section[] = [
  { id: 'produce', name: 'Fruit & vegetables', icon: '🥦' },
  { id: 'bakery', name: 'Bakery', icon: '🥖' },
  { id: 'deli', name: 'Deli & cheese counter', icon: '🧀' },
  { id: 'meat', name: 'Meat & fish', icon: '🥩' },
  { id: 'dairy', name: 'Dairy & eggs', icon: '🥛' },
  { id: 'frozen', name: 'Frozen', icon: '🧊' },
  { id: 'pasta', name: 'Pasta, rice & grains', icon: '🍝' },
  { id: 'canned', name: 'Canned & jars', icon: '🥫' },
  { id: 'baking', name: 'Baking & spices', icon: '🧂' },
  { id: 'breakfast', name: 'Breakfast & spreads', icon: '🥣' },
  { id: 'snacks', name: 'Snacks & sweets', icon: '🍫' },
  { id: 'drinks', name: 'Drinks', icon: '🧃' },
  { id: 'world', name: 'World foods & sauces', icon: '🌶️' },
  { id: 'household', name: 'Household & cleaning', icon: '🧽' },
  { id: 'personal', name: 'Personal care & pharmacy', icon: '🧴' },
  { id: 'baby', name: 'Baby', icon: '🍼' },
  { id: 'pet', name: 'Pet', icon: '🐾' },
  { id: 'other', name: 'Other', icon: '🛒' },
]

// Keyword lists (singular, lower-case). Multi-word keywords beat single words, so "peanut butter" → breakfast, "butter" → dairy.
const KW: Record<string, string> = {
  produce: 'apple|banana|orange|lemon|lime|grape|pear|peach|plum|cherry|strawberry|blueberry|raspberry|melon|watermelon|pineapple|mango|kiwi|avocado|tomato|potato|sweet potato|onion|red onion|garlic|ginger|carrot|celery|cucumber|lettuce|salad|spinach|kale|cabbage|broccoli|cauliflower|pepper|bell pepper|chili|zucchini|courgette|eggplant|aubergine|mushroom|corn on the cob|pumpkin|squash|leek|radish|beet|beetroot|asparagus|green bean|pea pod|herb|basil|parsley|cilantro|coriander|dill|mint|rosemary|thyme|spring onion|scallion|fruit|vegetable|veg|rocket|arugula|fennel|turnip|grapefruit|clementine|nectarine|apricot|fig|pomegranate|coconut',
  bakery: 'bread|loaf|baguette|roll|bun|bagel|croissant|muffin|cake|pita|tortilla|wrap|naan|brioche|sourdough|ciabatta|donut|doughnut|pastry|crumpet|focaccia',
  deli: 'ham|salami|prosciutto|deli|hummus|olive|cheddar|mozzarella|parmesan|feta|brie|gouda|halloumi|camembert|cheese|pate|pâté|pesto|coleslaw',
  meat: 'chicken|beef|pork|lamb|turkey|mince|ground beef|steak|sausage|bacon|fish|salmon|tuna steak|cod|shrimp|prawn|seafood|mussel|duck|chop|fillet|ribs|meatball|burger patty|tilapia|trout|haddock',
  dairy: 'milk|butter|yogurt|yoghurt|cream|sour cream|egg|cream cheese|cottage cheese|kefir|margarine|custard|whipped cream|oat milk|almond milk|soy milk|creme fraiche|crème fraîche|skyr|quark',
  frozen: 'frozen|ice cream|ice|frozen pea|frozen pizza|fish finger|fish stick|sorbet|popsicle|frozen berry|frozen vegetable|chips frozen|fries|hash brown|ice lolly',
  pasta: 'pasta|spaghetti|penne|fusilli|macaroni|lasagne|lasagna|noodle|rice|basmati|couscous|quinoa|bulgur|lentil|barley|oat|porridge oat|polenta|risotto',
  canned: 'canned|tin|tinned|can of|chickpea|kidney bean|black bean|baked bean|bean|tomato paste|passata|chopped tomato|crushed tomato|tuna|sardine|soup|stock|broth|bouillon|corn|sweetcorn|coconut milk|pickle|gherkin|jam jar|olive jar',
  baking: 'flour|sugar|brown sugar|icing sugar|baking powder|baking soda|bicarbonate|yeast|vanilla|cocoa|chocolate chip|salt|pepper corn|black pepper|spice|cinnamon|paprika|cumin|turmeric|oregano|nutmeg|curry powder|oil|olive oil|vegetable oil|vinegar|balsamic|cornstarch|cornflour|gelatin|sprinkles|food coloring',
  breakfast: 'cereal|granola|muesli|cornflakes|honey|jam|marmalade|peanut butter|nutella|chocolate spread|maple syrup|syrup|pancake mix|coffee|tea|instant coffee|coffee bean|tea bag|cocoa powder|hot chocolate',
  snacks: 'chip|crisp|cracker|cookie|biscuit|chocolate|candy|sweet|gum|popcorn|pretzel|nut|almond|cashew|peanut|walnut|raisin|dried fruit|granola bar|cereal bar|protein bar|rice cake|tortilla chip|dip|salsa dip',
  drinks: 'water|sparkling water|juice|orange juice|apple juice|soda|cola|lemonade|beer|wine|cider|spirits|vodka|gin|whisky|whiskey|rum|tonic|energy drink|sports drink|kombucha|squash drink|smoothie',
  world: 'soy sauce|soya sauce|ketchup|mayo|mayonnaise|mustard|bbq sauce|hot sauce|sriracha|salsa|curry paste|fish sauce|oyster sauce|teriyaki|sauce|taco shell|tahini|miso|harissa|wasabi|dressing|gravy',
  household: 'toilet paper|toilet roll|kitchen roll|paper towel|tissue|detergent|laundry|washing powder|fabric softener|dish soap|washing-up liquid|dishwasher tablet|sponge|bin bag|trash bag|garbage bag|foil|cling film|plastic wrap|baking paper|bleach|cleaner|spray|light bulb|battery|candle|napkin|zip bag|freezer bag',
  personal: 'shampoo|conditioner|soap|body wash|shower gel|toothpaste|toothbrush|floss|mouthwash|deodorant|razor|shaving|lotion|moisturizer|sunscreen|tampon|pad|sanitary|painkiller|ibuprofen|paracetamol|vitamin|plaster|band-aid|cotton|makeup|hand cream|lip balm|contact lens',
  baby: 'diaper|nappy|nappies|wipe|baby food|formula|baby wipe|teether|baby',
  pet: 'dog food|cat food|cat litter|litter|pet food|dog treat|cat treat|kibble|bird seed|fish food|pet',
}

export const KEYWORDS: Record<string, string[]> = Object.fromEntries(Object.entries(KW).map(([k, v]) => [k, v.split('|')]))

const IE = new Set(['cookies', 'pies', 'brownies', 'smoothies', 'veggies', 'calories', 'ties', 'lies'])

/** Very small English singulariser for matching ("tomatoes" → "tomato", "berries" → "berry"). */
export function singular(w: string): string {
  if (w.length <= 3) return w
  if (IE.has(w)) return w.slice(0, -1)
  if (/ies$/.test(w)) return w.slice(0, -3) + 'y'
  if (/(oes|ches|shes|sses|xes)$/.test(w)) return w.slice(0, -2)
  if (/s$/.test(w) && !/(ss|us|is)$/.test(w)) return w.slice(0, -1)
  return w
}

export const normalize = (s: string) =>
  s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter(Boolean).map(singular).join(' ')

export interface Parsed { name: string; qty: string }

const UNIT = '(?:kg|g|gr|grams?|lbs?|lb|oz|ml|l|litres?|liters?|pack|packs|pk|bottles?|cans?|tins?|bags?|boxes?|jars?|dozen|bunch(?:es)?|loaves|loaf|pcs|x)'

/** Splits "2 x milk", "milk ×2", "500 g flour", "flour (500g)", "- 3 apples" into quantity and name. */
export function parseLine(line: string): Parsed | null {
  let s = line.replace(/^\s*(?:[-*•▢☐✓✔]|\[[ xX]?\]|\d+[.)])\s*/, '').trim()
  if (!s) return null
  let qty = ''
  const lead = new RegExp(`^(\\d+(?:[.,]\\d+)?\\s*${UNIT}?\\.?)\\s+(?:of\\s+)?(.+)$`, 'i').exec(s)
  const trail = new RegExp(`^(.+?)\\s*(?:[x×*]\\s*(\\d+(?:[.,]\\d+)?)|\\(?(\\d+(?:[.,]\\d+)?\\s*${UNIT})\\)?)$`, 'i').exec(s)
  if (lead) { qty = lead[1].trim(); s = lead[2].trim() } else if (trail && (trail[2] || trail[3])) { qty = trail[2] ? `×${trail[2]}` : trail[3].trim(); s = trail[1].trim() }
  return { name: s.replace(/\s+/g, ' '), qty }
}

/** Returns the section id for an item name: learned overrides first, then the longest keyword match (whole words). */
export function classify(name: string, overrides: Record<string, string> = {}, extra: Record<string, string[]> = {}): string {
  const n = normalize(name)
  if (overrides[n]) return overrides[n]
  const padded = ` ${n} `
  let best = 'other', bestLen = 0
  for (const src of [KEYWORDS, extra]) {
    for (const [sec, words] of Object.entries(src)) {
      for (const w of words) {
        const k = normalize(w)
        if (k && k.length > bestLen && padded.includes(` ${k} `)) { best = sec; bestLen = k.length }
      }
    }
  }
  return best
}

export interface Store { id: string; name: string; order: string[]; labels: Record<string, string> }

/** Sorts section ids by the store order; unknown sections go before "other", which is always last. */
export function sectionRank(store: Store, sec: string): number {
  if (sec === 'other') return 1e6
  const i = store.order.indexOf(sec)
  return i < 0 ? 1e5 + SECTIONS.findIndex((s) => s.id === sec) : i
}

export interface Item { id: string; name: string; qty: string; done: boolean; section?: string }

export function groupItems(items: Item[], store: Store, overrides: Record<string, string>): { section: string; items: Item[] }[] {
  const m = new Map<string, Item[]>()
  for (const it of items) {
    const sec = it.section ?? classify(it.name, overrides)
    m.set(sec, [...(m.get(sec) ?? []), it])
  }
  return [...m.entries()]
    .sort((a, b) => sectionRank(store, a[0]) - sectionRank(store, b[0]))
    .map(([section, l]) => ({ section, items: [...l].sort((a, b) => Number(a.done) - Number(b.done) || a.name.localeCompare(b.name)) }))
}

/** Plain-text list in store order (for messaging apps). */
export function toText(groups: { section: string; items: Item[] }[], store: Store, withDone = false): string {
  return groups
    .map((g) => {
      const sec = SECTIONS.find((s) => s.id === g.section)
      const l = g.items.filter((i) => withDone || !i.done)
      if (!l.length) return ''
      const lab = store.labels[g.section] ? ` (${store.labels[g.section]})` : ''
      return `${sec?.icon ?? ''} ${sec?.name ?? g.section}${lab}\n${l.map((i) => `${i.done ? '☑' : '☐'} ${i.name}${i.qty ? ` — ${i.qty}` : ''}`).join('\n')}`
    })
    .filter(Boolean)
    .join('\n\n')
}
