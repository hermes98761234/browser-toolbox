// Ingredient normalisation, fuzzy matching and recipe scoring for the leftovers matcher.
import { RECIPES_RAW } from './leftovers-recipe-matcher-data'

export interface Recipe { name: string; minutes: number; tags: string[]; need: string[]; optional: string[]; method: string }

export function parseRecipes(raw = RECIPES_RAW): Recipe[] {
  return raw.trim().split('\n').map((line) => {
    const [name, min, tags, ings, method] = line.split('|')
    const all = ings.split(',').map((x) => x.trim()).filter(Boolean)
    return {
      name, minutes: Number(min), tags: tags.split(/\s+/).filter(Boolean), method,
      need: all.filter((x) => !x.endsWith('?')), optional: all.filter((x) => x.endsWith('?')).map((x) => x.slice(0, -1)),
    }
  })
}

const SYN: Record<string, string> = {
  scallion: 'green onion', 'spring onion': 'green onion', courgette: 'zucchini', aubergine: 'eggplant', capsicum: 'bell pepper',
  'red pepper': 'bell pepper', 'green pepper': 'bell pepper', 'yellow pepper': 'bell pepper', 'sweet pepper': 'bell pepper',
  mince: 'ground beef', 'minced beef': 'ground beef', 'beef mince': 'ground beef', hamburger: 'ground beef', 'lamb mince': 'ground lamb',
  garbanzo: 'chickpea', 'garbanzo bean': 'chickpea', coriander: 'cilantro', cheddar: 'cheese', mozzarella: 'cheese', gouda: 'cheese',
  emmental: 'cheese', parmigiano: 'parmesan', spaghetti: 'pasta', penne: 'pasta', macaroni: 'pasta', fusilli: 'pasta', linguine: 'pasta',
  tinned: 'canned', 'chopped tomato': 'canned tomato', 'tomato passata': 'canned tomato', passata: 'canned tomato', 'crushed tomato': 'canned tomato',
  yoghurt: 'yogurt', 'rolled oat': 'oat', 'heavy cream': 'cream', 'double cream': 'cream', 'single cream': 'cream', wrap: 'tortilla',
  'chicken breast': 'chicken', 'chicken thigh': 'chicken', 'rotisserie chicken': 'chicken', 'leftover chicken': 'chicken', 'bacon rasher': 'bacon',
  'kidney bean': 'bean', 'black bean': 'bean', 'pinto bean': 'bean', 'baked bean': 'bean', sweetcorn: 'corn', 'sweet corn': 'corn',
  'red lentil': 'lentil', 'green lentil': 'lentil', 'stale bread': 'bread', baguette: 'bread', 'sourdough': 'bread', 'ramen': 'instant noodle',
  'brown rice': 'rice', 'white rice': 'rice', 'basmati rice': 'rice', 'jasmine rice': 'rice', 'leftover rice': 'cooked rice', 'day-old rice': 'cooked rice',
  'soy': 'soy sauce', 'soya sauce': 'soy sauce', 'mayo': 'mayonnaise', 'pepper': 'black pepper', 'cod': 'fish', 'haddock': 'fish', 'white fish': 'fish',
  'spud': 'potato', 'sweet potato': 'potato', 'evoo': 'olive oil', 'oil': 'olive oil', 'vegetable oil': 'olive oil', 'chilli': 'chili', 'chili pepper': 'chili flake',
}

// Generic single words (pepper, oil, soy) only map when they are the whole name.
const PHRASES = Object.keys(SYN).filter((k) => !['pepper', 'oil', 'soy', 'mayo'].includes(k)).sort((a, b) => b.length - a.length)

/** Crude English singular for food words. */
export function singular(w: string): string {
  if (w.length <= 3 || w.endsWith('ss') || /(hummus|asparagus|couscous|molasses|swiss|oats)$/.test(w)) return w === 'oats' ? 'oat' : w
  if (w.endsWith('ies')) return w.slice(0, -3) + 'y'
  if (/(tomato|potato|mango|avocado)es$/.test(w)) return w.slice(0, -2)
  if (/(ch|sh|x)es$/.test(w)) return w.slice(0, -2)
  if (w.endsWith('s') && !w.endsWith('us')) return w.slice(0, -1)
  return w
}

export function normalize(s: string): string {
  let t = s.toLowerCase().replace(/[^a-z\s-]/g, ' ').replace(/\b(fresh|some|a|an|the|half|old|large|small|ripe|of|chopped up|bag|can|tin|jar)\b/g, ' ').replace(/\s+/g, ' ').trim()
  t = t.split(' ').map(singular).join(' ')
  if (SYN[t]) return SYN[t]
  // replace any synonym phrase inside the string (longest first)
  for (const k of PHRASES) {
    if (t.includes(k) && new RegExp(`\\b${k}\\b`).test(t)) {
      t = t.replace(new RegExp(`\\b${k}\\b`), SYN[k]).replace(/\b(\w+) \1\b/g, '$1')
      break
    }
  }
  return t.replace(/^leftover /, '')
}

/** Optimal string alignment distance (Damerau-Levenshtein with adjacent transpositions). */
export function editDistance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)] as number[])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
    }
  return d[a.length][b.length]
}
export const similarity = (a: string, b: string) => (a === b ? 1 : 1 - editDistance(a, b) / Math.max(a.length, b.length, 1))

/** How well an ingredient you have (`have`) satisfies a recipe ingredient (`want`), 0..1. Both already normalised. */
export function matchScore(have: string, want: string): number {
  if (have === want) return 1
  const ht = have.split(' '), wt = want.split(' ')
  if (wt.every((w) => ht.includes(w))) return 0.95 // "chicken breast" covers "chicken"
  const fuzzyTok = (a: string[], b: string[]) => a.every((x) => b.some((y) => similarity(x, y) >= 0.8))
  // "rice" for "cooked rice", "tomato" for "canned tomato": the head noun matches
  if (ht[ht.length - 1] === wt[wt.length - 1] && ht.length < wt.length) return 0.8
  if (fuzzyTok(wt, ht) && fuzzyTok(ht, wt)) return 0.85 // typos: "brocoli", "parmesean"
  const sim = similarity(have, want)
  return sim >= 0.8 ? sim * 0.9 : 0
}

export const HAVE_THRESHOLD = 0.75

export interface Match {
  recipe: Recipe
  have: { ing: string; by: string }[]
  missing: string[]
  optHave: string[]
  optMissing: string[]
  usesFirst: number
  used: string[] // pantry items (as typed) this recipe uses
  coverage: number
  score: number
}

export function scoreRecipe(r: Recipe, pantry: string[], staples: string[], useFirst: string[] = []): Match {
  const items = pantry.map((p) => ({ raw: p, n: normalize(p) })).filter((x) => x.n)
  const st = staples.map(normalize)
  const uf = new Set(useFirst.map(normalize))
  const find = (ing: string) => {
    const w = normalize(ing)
    if (st.some((s) => matchScore(s, w) >= 0.95)) return 'staple'
    let best: { raw: string; n: string; s: number } | null = null
    for (const it of items) {
      const s = matchScore(it.n, w)
      if (s >= HAVE_THRESHOLD && (!best || s > best.s)) best = { ...it, s }
    }
    return best ? best.raw : null
  }
  const have: Match['have'] = [], missing: string[] = [], optHave: string[] = [], optMissing: string[] = []
  const used = new Set<string>()
  const usedRaw = new Set<string>()
  for (const ing of r.need) {
    const by = find(ing)
    if (by) { have.push({ ing, by }); if (by !== 'staple') usedRaw.add(by); used.add(normalize(by)) } else missing.push(ing)
  }
  for (const ing of r.optional) {
    const by = find(ing)
    if (by) { optHave.push(ing); if (by !== 'staple') usedRaw.add(by); used.add(normalize(by)) } else optMissing.push(ing)
  }
  const usesFirst = [...used].filter((u) => uf.has(u)).length
  const coverage = r.need.length ? have.length / r.need.length : 1
  const pantryUsed = usedRaw.size
  const score = coverage * 100 + pantryUsed * 5 + usesFirst * 12 - missing.length * 6
  return { recipe: r, have, missing, optHave, optMissing, usesFirst, used: [...usedRaw], coverage, score }
}

export function rankRecipes(recipes: Recipe[], pantry: string[], staples: string[], useFirst: string[] = []) {
  return recipes.map((r) => scoreRecipe(r, pantry, staples, useFirst)).sort((a, b) => b.score - a.score || a.recipe.minutes - b.recipe.minutes)
}
