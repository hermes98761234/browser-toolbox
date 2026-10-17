// Companion planting data (traditional gardening lore + common extension-service guidance) and helpers.

export type Kind = 'Vegetable' | 'Herb' | 'Flower' | 'Fruit'
export interface Plant { id: string; name: string; kind: Kind; family: string; emoji: string }

const P = (id: string, name: string, kind: Kind, family: string, emoji: string): Plant => ({ id, name, kind, family, emoji })
export const PLANTS: Plant[] = [
  P('tomato', 'Tomato', 'Vegetable', 'Nightshade', '🍅'), P('pepper', 'Pepper', 'Vegetable', 'Nightshade', '🫑'),
  P('eggplant', 'Eggplant', 'Vegetable', 'Nightshade', '🍆'), P('potato', 'Potato', 'Vegetable', 'Nightshade', '🥔'),
  P('carrot', 'Carrot', 'Vegetable', 'Carrot family', '🥕'), P('celery', 'Celery', 'Vegetable', 'Carrot family', '🥬'),
  P('onion', 'Onion', 'Vegetable', 'Allium', '🧅'), P('garlic', 'Garlic', 'Vegetable', 'Allium', '🧄'), P('leek', 'Leek', 'Vegetable', 'Allium', '🌱'),
  P('lettuce', 'Lettuce', 'Vegetable', 'Daisy family', '🥬'), P('spinach', 'Spinach', 'Vegetable', 'Amaranth', '🍃'), P('beet', 'Beet', 'Vegetable', 'Amaranth', '🟣'),
  P('cabbage', 'Cabbage', 'Vegetable', 'Brassica', '🥬'), P('broccoli', 'Broccoli', 'Vegetable', 'Brassica', '🥦'), P('kale', 'Kale', 'Vegetable', 'Brassica', '🥬'),
  P('cauliflower', 'Cauliflower', 'Vegetable', 'Brassica', '🤍'), P('radish', 'Radish', 'Vegetable', 'Brassica', '🔴'),
  P('bean', 'Bush bean', 'Vegetable', 'Legume', '🫘'), P('pea', 'Pea', 'Vegetable', 'Legume', '🫛'),
  P('cucumber', 'Cucumber', 'Vegetable', 'Cucurbit', '🥒'), P('squash', 'Squash / zucchini', 'Vegetable', 'Cucurbit', '🎃'), P('melon', 'Melon', 'Fruit', 'Cucurbit', '🍈'),
  P('corn', 'Sweet corn', 'Vegetable', 'Grass', '🌽'), P('asparagus', 'Asparagus', 'Vegetable', 'Asparagus', '🌿'),
  P('strawberry', 'Strawberry', 'Fruit', 'Rose family', '🍓'),
  P('basil', 'Basil', 'Herb', 'Mint family', '🌿'), P('mint', 'Mint', 'Herb', 'Mint family', '🌱'), P('sage', 'Sage', 'Herb', 'Mint family', '🌿'),
  P('rosemary', 'Rosemary', 'Herb', 'Mint family', '🌿'), P('thyme', 'Thyme', 'Herb', 'Mint family', '🌿'),
  P('dill', 'Dill', 'Herb', 'Carrot family', '🌾'), P('fennel', 'Fennel', 'Herb', 'Carrot family', '🌾'), P('parsley', 'Parsley', 'Herb', 'Carrot family', '🌿'),
  P('chives', 'Chives', 'Herb', 'Allium', '🌱'),
  P('marigold', 'Marigold', 'Flower', 'Daisy family', '🌼'), P('nasturtium', 'Nasturtium', 'Flower', 'Nasturtium', '🌺'),
  P('sunflower', 'Sunflower', 'Flower', 'Daisy family', '🌻'), P('borage', 'Borage', 'Flower', 'Borage', '💠'),
]

const BRAS = 'cabbage broccoli kale cauliflower'
const ALL = 'onion garlic leek chives'
// "a: b c d" — a helps / grows well with b, c, d (made symmetric below)
const GOOD = [
  'tomato: basil carrot onion garlic parsley marigold nasturtium borage chives lettuce asparagus celery pepper thyme',
  'pepper: basil onion carrot spinach marigold',
  'eggplant: bean pepper marigold thyme spinach',
  'potato: bean corn cabbage marigold nasturtium pea',
  'carrot: onion leek chives lettuce pea radish rosemary sage',
  'onion: beet lettuce cabbage strawberry broccoli',
  'garlic: beet strawberry cabbage lettuce',
  'leek: celery onion',
  'lettuce: radish strawberry cucumber chives',
  'spinach: strawberry pea radish cabbage',
  `dill: ${BRAS} cucumber lettuce onion`,
  `rosemary: ${BRAS} bean sage`,
  `sage: ${BRAS} rosemary`,
  `thyme: ${BRAS} strawberry`,
  `nasturtium: ${BRAS} radish cucumber squash melon`,
  `mint: ${BRAS}`,
  `celery: ${BRAS} bean`,
  `beet: ${BRAS} lettuce bean`,
  'radish: cucumber pea',
  'bean: corn squash cucumber cabbage',
  'pea: cucumber corn bean',
  'cucumber: corn sunflower marigold',
  'squash: corn bean marigold borage',
  'melon: corn marigold',
  'corn: sunflower',
  'strawberry: borage bean',
  'asparagus: parsley basil',
  'basil: pepper oregano',
]
const BAD = [
  `tomato: potato fennel corn dill ${BRAS}`,
  'potato: cucumber squash melon sunflower eggplant',
  'carrot: dill fennel',
  `bean: ${ALL} fennel`,
  `pea: ${ALL} fennel`,
  `strawberry: ${BRAS} fennel`,
  'cucumber: sage',
  'asparagus: onion garlic',
  'fennel: pepper eggplant carrot celery lettuce spinach cabbage broccoli kale cauliflower cucumber squash potato basil corn',
  'corn: celery',
]

export type Rel = 1 | 0 | -1
const table = new Map<string, Rel>()
const k = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)
for (const [lines, v] of [[GOOD, 1], [BAD, -1]] as const)
  for (const line of lines) {
    const [a, rest] = line.split(':')
    for (const b of rest.trim().split(/\s+/)) if (b !== a && PLANTS.some((p) => p.id === b)) table.set(k(a.trim(), b), v)
  }

export const byId = new Map(PLANTS.map((p) => [p.id, p]))
export const rel = (a: string, b: string): Rel => (a === b ? 0 : (table.get(k(a, b)) ?? 0))
export const friends = (a: string) => PLANTS.filter((p) => rel(a, p.id) === 1)
export const foes = (a: string) => PLANTS.filter((p) => rel(a, p.id) === -1)

export function analyse(ids: string[]) {
  const good: [string, string][] = [], bad: [string, string][] = [], family: [string, string][] = []
  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++) {
      const r = rel(ids[i], ids[j])
      if (r === 1) good.push([ids[i], ids[j]])
      if (r === -1) bad.push([ids[i], ids[j]])
      if (byId.get(ids[i])?.family === byId.get(ids[j])?.family) family.push([ids[i], ids[j]])
    }
  const pairs = (ids.length * (ids.length - 1)) / 2
  return { good, bad, family, pairs, score: pairs ? Math.round(((good.length - 2 * bad.length) / pairs) * 50 + 50) : 0 }
}

/** Unselected plants ranked by how well they fit the selection (no conflicts first). */
export function suggestions(ids: string[], n = 6) {
  return PLANTS.filter((p) => !ids.includes(p.id))
    .map((p) => {
      const rs = ids.map((i) => rel(p.id, i))
      return { p, good: rs.filter((r) => r === 1).length, bad: rs.filter((r) => r === -1).length }
    })
    .filter((x) => x.bad === 0 && x.good > 0)
    .sort((a, b) => b.good - a.good || a.p.name.localeCompare(b.p.name))
    .slice(0, n)
}

const rowScore = (o: string[]) => {
  let s = 0
  for (let i = 1; i < o.length; i++) {
    const r = rel(o[i - 1], o[i])
    s += r === 1 ? 1 : r === -1 ? -4 : 0
  }
  return s
}

/** Order plants in a single row so neighbours help each other (exhaustive up to 8, greedy above). */
export function bestRow(ids: string[]): { order: string[]; score: number } {
  if (ids.length <= 1) return { order: [...ids], score: 0 }
  if (ids.length <= 8) {
    let best = [...ids], bs = rowScore(ids)
    const perm = (arr: string[], rest: string[]) => {
      if (!rest.length) {
        const sc = rowScore(arr)
        if (sc > bs) {
          bs = sc
          best = [...arr]
        }
        return
      }
      for (let i = 0; i < rest.length; i++) perm([...arr, rest[i]], [...rest.slice(0, i), ...rest.slice(i + 1)])
    }
    perm([], ids)
    return { order: best, score: bs }
  }
  const left = [...ids]
  const order = [left.shift()!]
  while (left.length) {
    const last = order[order.length - 1]
    left.sort((a, b) => rel(last, b) - rel(last, a))
    order.push(left.shift()!)
  }
  return { order, score: rowScore(order) }
}
