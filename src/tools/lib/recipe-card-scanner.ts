// Turns raw recipe text (typed, pasted or OCR'd) into a structured card: title, servings, times,
// ingredients (quantity / unit / item) and numbered steps. Also scales and pretty-prints quantities.

export interface Ingredient { qty: number | null; qty2: number | null; unit: string; item: string }
export interface Recipe { title: string; servings: number | null; prep: string; cook: string; ingredients: Ingredient[]; steps: string[]; notes: string }

const VULGAR: Record<string, number> = { '½': 0.5, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 0.25, '¾': 0.75, '⅕': 0.2, '⅖': 0.4, '⅗': 0.6, '⅘': 0.8, '⅙': 1 / 6, '⅚': 5 / 6, '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875 }

const UNITS: [RegExp, string][] = [
  [/^(tablespoons?|tbsps?|tbls?|T)\.?$/, 'tbsp'], [/^(teaspoons?|tsps?|t)\.?$/, 'tsp'], [/^cups?|c\.?$/, 'cup'],
  [/^(grams?|gr?|g)\.?$/, 'g'], [/^(kilograms?|kgs?)\.?$/, 'kg'], [/^(milliliters?|millilitres?|ml)\.?$/i, 'ml'],
  [/^(liters?|litres?|l)\.?$/i, 'l'], [/^(ounces?|oz)\.?$/, 'oz'], [/^(pounds?|lbs?)\.?$/, 'lb'], [/^(pinch(es)?)$/, 'pinch'],
  [/^(cloves?)$/, 'clove'], [/^(cans?|tins?)$/, 'can'], [/^(sticks?)$/, 'stick'], [/^(slices?)$/, 'slice'],
  [/^(pieces?|pcs?)$/, 'piece'], [/^(handfuls?)$/, 'handful'], [/^(dash(es)?)$/, 'dash'], [/^(sprigs?)$/, 'sprig'],
  [/^(bunch(es)?)$/, 'bunch'], [/^(quarts?|qts?)$/, 'qt'], [/^(pints?|pts?)$/, 'pt'], [/^(fl\.? ?oz)$/, 'fl oz'], [/^(dl)$/i, 'dl'],
]

const NUM = String.raw`(?:\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:[.,]\d+)?\s*[${Object.keys(VULGAR).join('')}]?|[${Object.keys(VULGAR).join('')}])`

/** "1 1/2", "3/4", "½", "1½", "2.5" → number. */
export function parseQty(s: string): number | null {
  const t = s.trim().replace(',', '.')
  let m = /^(\d+)\s+(\d+)\/(\d+)$/.exec(t)
  if (m) return Number(m[1]) + Number(m[2]) / Number(m[3])
  m = /^(\d+)\/(\d+)$/.exec(t)
  if (m) return Number(m[2]) ? Number(m[1]) / Number(m[2]) : null
  m = /^(\d+(?:\.\d+)?)?\s*([½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])?$/.exec(t)
  if (m && (m[1] || m[2])) return (m[1] ? Number(m[1]) : 0) + (m[2] ? VULGAR[m[2]] : 0)
  return null
}

export function normUnit(w: string): string | null {
  for (const [re, u] of UNITS) if (re.test(w)) return u
  return null
}

const BULLET = /^\s*(?:[-–—•*·▪●○◦]|\(?\d{1,2}[.)]|step\s*\d+[:.)]?)\s*/i

export function parseIngredient(line: string): Ingredient {
  const l = line.replace(/^\s*[-–—•*·▪●○◦]\s*/, '').trim()
  const m = new RegExp(`^(${NUM})(?:\\s*(?:-|–|to)\\s*(${NUM}))?\\s*(.*)$`).exec(l)
  if (!m) return { qty: null, qty2: null, unit: '', item: l }
  const qty = parseQty(m[1]), qty2 = m[2] ? parseQty(m[2]) : null
  let rest = m[3]
  let unit = ''
  const um = /^(fl\.? ?oz|[A-Za-z]+\.?)\b\.?\s*(?:of\s+)?(.*)$/.exec(rest)
  if (um) {
    const u = normUnit(um[1])
    // single-letter t/T/c/l/g only count as units when followed by more text
    if (u && um[2]) { unit = u; rest = um[2] }
  }
  return { qty, qty2, unit, item: rest.trim() }
}

const HEAD_ING = /^\s*(ingredients?|you(?:'|’)ll need|what you need|shopping list)\s*:?\s*$/i
const HEAD_STEP = /^\s*(directions?|method|instructions?|steps?|preparation|how to make( it)?|procedure)\s*:?\s*$/i
const HEAD_NOTE = /^\s*(notes?|tips?|variations?)\s*:?\s*$/i
const SERV = /\b(?:serves|servings?|yields?|makes|portions?)\b\s*:?\s*(?:about\s*)?(\d+)/i
const PREP = /\bprep(?:aration)?(?:\s*time)?\s*:?\s*([\d½¼¾.,/ -]+\s*(?:h(?:ours?|rs?)?|min(?:utes?|s)?)(?:\s*\d+\s*min(?:utes?|s)?)?)/i
const COOK = /\b(?:cook(?:ing)?|bake|baking)(?:\s*time)?\s*:?\s*([\d½¼¾.,/ -]+\s*(?:h(?:ours?|rs?)?|min(?:utes?|s)?)(?:\s*\d+\s*min(?:utes?|s)?)?)/i
const looksIngredient = (l: string) => new RegExp(`^\\s*(?:[-–•*·]\\s*)?${NUM}\\s*\\S`).test(l) || /^\s*[-–•*·]\s*\S/.test(l) && l.length < 60
const looksStep = (l: string) => /^\s*(?:\d{1,2}[.)]|step\s*\d+)/i.test(l) || (l.split(/\s+/).length >= 7 && /[.!]$/.test(l.trim()))

export function parseRecipe(text: string): Recipe {
  const lines = text.replace(/\r/g, '').split('\n').map((l) => l.replace(/\s+$/, ''))
  const r: Recipe = { title: '', servings: null, prep: '', cook: '', ingredients: [], steps: [], notes: '' }
  let mode: 'auto' | 'ing' | 'step' | 'note' = 'auto'
  const notes: string[] = []
  let stepBuf = ''
  const flush = () => { if (stepBuf.trim()) r.steps.push(stepBuf.trim()); stepBuf = '' }
  for (const raw of lines) {
    const l = raw.trim()
    if (!l) { if (mode === 'step') flush(); continue }
    const sv = SERV.exec(l), pp = PREP.exec(l), ck = COOK.exec(l)
    const meta = (sv || pp || ck) && l.length < 80 && !looksStep(l)
    if (meta) {
      if (sv && r.servings === null) r.servings = Number(sv[1])
      if (pp && !r.prep) r.prep = pp[1].trim()
      if (ck && !r.cook) r.cook = ck[1].trim()
      continue
    }
    if (HEAD_ING.test(l)) { flush(); mode = 'ing'; continue }
    if (HEAD_STEP.test(l)) { flush(); mode = 'step'; continue }
    if (HEAD_NOTE.test(l)) { flush(); mode = 'note'; continue }
    if (!r.title && mode === 'auto' && !looksIngredient(l)) { r.title = l.replace(/^#+\s*/, ''); continue }
    if (/^for the\b.*:$/i.test(l) && mode !== 'step') continue // sub-group header like "For the glaze:"
    let m = mode
    if (m === 'auto') m = looksStep(l) ? 'step' : looksIngredient(l) || l.length < 40 ? 'ing' : 'step'
    if (m === 'ing') r.ingredients.push(parseIngredient(l))
    else if (m === 'note') notes.push(l)
    else {
      const numbered = BULLET.test(l)
      if (numbered) { flush(); stepBuf = l.replace(BULLET, '') }
      else if (stepBuf && !/[.!?:)]$/.test(stepBuf)) stepBuf += ' ' + l // wrapped line
      else { flush(); stepBuf = l }
    }
  }
  flush()
  r.notes = notes.join('\n')
  if (!r.title) r.title = 'Untitled recipe'
  return r
}

const FRACS: [number, string][] = [[0, ''], [1 / 8, '⅛'], [1 / 4, '¼'], [1 / 3, '⅓'], [3 / 8, '⅜'], [1 / 2, '½'], [5 / 8, '⅝'], [2 / 3, '⅔'], [3 / 4, '¾'], [7 / 8, '⅞'], [1, '']]

/** Kitchen-friendly number: 1.5 → "1½", 0.333 → "⅓", 2.4 g-type values keep one decimal. */
export function prettyQty(x: number, metric = false): string {
  if (!Number.isFinite(x)) return ''
  if (metric || x >= 20) return x >= 100 ? String(Math.round(x / 5) * 5) : String(Math.round(x * 10) / 10)
  const w = Math.floor(x), f = x - w
  let best = FRACS[0]
  for (const c of FRACS) if (Math.abs(c[0] - f) < Math.abs(best[0] - f)) best = c
  if (Math.abs(best[0] - f) > 0.04) return String(Math.round(x * 100) / 100)
  const whole = best[0] === 1 ? w + 1 : w
  return `${whole || !best[1] ? whole : ''}${best[1]}` || '0'
}

const METRIC = new Set(['g', 'kg', 'ml', 'l', 'dl'])

export function formatIngredient(g: Ingredient, k = 1): string {
  const m = METRIC.has(g.unit)
  const q = g.qty === null ? '' : prettyQty(g.qty * k, m) + (g.qty2 !== null ? `–${prettyQty(g.qty2 * k, m)}` : '')
  return [q, g.unit, g.item].filter(Boolean).join(' ')
}

export function toMarkdown(r: Recipe, k = 1): string {
  const meta = [r.servings ? `Serves ${Math.round(r.servings * k * 10) / 10}` : '', r.prep ? `Prep ${r.prep}` : '', r.cook ? `Cook ${r.cook}` : ''].filter(Boolean).join(' · ')
  return `# ${r.title}\n${meta ? `\n_${meta}_\n` : ''}\n## Ingredients\n${r.ingredients.map((g) => `- ${formatIngredient(g, k)}`).join('\n')}\n\n## Steps\n${r.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n${r.notes ? `\n## Notes\n${r.notes}\n` : ''}`
}
