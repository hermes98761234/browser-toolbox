// Square-foot gardening rules: plants per square, companion/antagonist pairs, neighbour checks.

export interface Plant { id: string; name: string; icon: string; perSq: number; days: number; season: 'cool' | 'warm'; color: string }

/** Classic SFG spacing (plants per 1×1 ft square). Fractions = one plant spans several squares. */
export const PLANTS: Plant[] = [
  { id: 'tomato', name: 'Tomato (staked)', icon: '🍅', perSq: 1, days: 75, season: 'warm', color: '#ef4444' },
  { id: 'pepper', name: 'Pepper', icon: '🌶️', perSq: 1, days: 70, season: 'warm', color: '#f97316' },
  { id: 'eggplant', name: 'Eggplant', icon: '🍆', perSq: 1, days: 80, season: 'warm', color: '#7c3aed' },
  { id: 'cucumber', name: 'Cucumber (trellis)', icon: '🥒', perSq: 2, days: 60, season: 'warm', color: '#16a34a' },
  { id: 'zucchini', name: 'Zucchini', icon: '🥬', perSq: 0.25, days: 55, season: 'warm', color: '#65a30d' },
  { id: 'bean', name: 'Bush bean', icon: '🫘', perSq: 9, days: 55, season: 'warm', color: '#84cc16' },
  { id: 'pea', name: 'Pea (trellis)', icon: '🫛', perSq: 8, days: 60, season: 'cool', color: '#22c55e' },
  { id: 'basil', name: 'Basil', icon: '🌿', perSq: 4, days: 60, season: 'warm', color: '#10b981' },
  { id: 'lettuce', name: 'Lettuce', icon: '🥗', perSq: 4, days: 45, season: 'cool', color: '#a3e635' },
  { id: 'spinach', name: 'Spinach', icon: '🍃', perSq: 9, days: 40, season: 'cool', color: '#15803d' },
  { id: 'chard', name: 'Swiss chard', icon: '🌱', perSq: 4, days: 55, season: 'cool', color: '#dc2626' },
  { id: 'kale', name: 'Kale', icon: '🥦', perSq: 1, days: 55, season: 'cool', color: '#166534' },
  { id: 'broccoli', name: 'Broccoli', icon: '🥦', perSq: 1, days: 70, season: 'cool', color: '#047857' },
  { id: 'cabbage', name: 'Cabbage', icon: '🥬', perSq: 1, days: 80, season: 'cool', color: '#4ade80' },
  { id: 'carrot', name: 'Carrot', icon: '🥕', perSq: 16, days: 70, season: 'cool', color: '#fb923c' },
  { id: 'radish', name: 'Radish', icon: '🔴', perSq: 16, days: 25, season: 'cool', color: '#e11d48' },
  { id: 'beet', name: 'Beet', icon: '🟣', perSq: 9, days: 55, season: 'cool', color: '#9d174d' },
  { id: 'onion', name: 'Onion', icon: '🧅', perSq: 16, days: 100, season: 'cool', color: '#d97706' },
  { id: 'garlic', name: 'Garlic', icon: '🧄', perSq: 9, days: 240, season: 'cool', color: '#a8a29e' },
  { id: 'potato', name: 'Potato', icon: '🥔', perSq: 1, days: 90, season: 'cool', color: '#a16207' },
  { id: 'strawberry', name: 'Strawberry', icon: '🍓', perSq: 4, days: 90, season: 'cool', color: '#f43f5e' },
  { id: 'marigold', name: 'Marigold', icon: '🌼', perSq: 4, days: 50, season: 'warm', color: '#facc15' },
  { id: 'dill', name: 'Dill', icon: '🌾', perSq: 1, days: 50, season: 'cool', color: '#bef264' },
  { id: 'parsley', name: 'Parsley', icon: '☘️', perSq: 4, days: 75, season: 'cool', color: '#4d7c0f' },
]
export const plant = (id: string | null | undefined) => PLANTS.find((p) => p.id === id)

const pair = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)

/** Commonly cited companion pairs (folk wisdom; useful as a planning nudge, not hard science). */
export const GOOD = new Set([
  ['tomato', 'basil'], ['tomato', 'marigold'], ['tomato', 'carrot'], ['tomato', 'parsley'], ['pepper', 'basil'], ['carrot', 'onion'],
  ['lettuce', 'radish'], ['lettuce', 'carrot'], ['cucumber', 'bean'], ['cucumber', 'pea'], ['cucumber', 'dill'], ['bean', 'carrot'],
  ['pea', 'carrot'], ['pea', 'radish'], ['beet', 'onion'], ['beet', 'lettuce'], ['cabbage', 'dill'], ['broccoli', 'dill'],
  ['strawberry', 'spinach'], ['strawberry', 'lettuce'], ['spinach', 'strawberry'], ['onion', 'lettuce'], ['garlic', 'tomato'], ['marigold', 'bean'],
  ['eggplant', 'bean'], ['zucchini', 'marigold'], ['kale', 'beet'], ['chard', 'bean'],
].map(([a, b]) => pair(a, b)))

export const BAD = new Set([
  ['bean', 'onion'], ['bean', 'garlic'], ['pea', 'onion'], ['pea', 'garlic'], ['tomato', 'cabbage'], ['tomato', 'broccoli'], ['tomato', 'kale'],
  ['tomato', 'potato'], ['tomato', 'dill'], ['carrot', 'dill'], ['cucumber', 'potato'], ['potato', 'zucchini'], ['potato', 'eggplant'],
  ['cabbage', 'strawberry'], ['broccoli', 'strawberry'], ['pepper', 'kale'], ['pepper', 'bean'], ['onion', 'potato'],
].map(([a, b]) => pair(a, b)))

export const relation = (a: string, b: string): 'good' | 'bad' | null => (a === b ? null : BAD.has(pair(a, b)) ? 'bad' : GOOD.has(pair(a, b)) ? 'good' : null)

export interface Issue { a: number; b: number; kind: 'good' | 'bad' }

/** Checks every pair of 8-neighbour squares once. Cells are row-major with width w. */
export function neighbours(cells: (string | null)[], w: number): Issue[] {
  const h = Math.ceil(cells.length / w)
  const out: Issue[] = []
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      const p = cells[i]
      if (!p) continue
      for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [-1, 1]]) {
        const nx = x + dx, ny = y + dy
        if (nx < 0 || nx >= w || ny >= h) continue
        const j = ny * w + nx
        const q = cells[j]
        if (!q) continue
        const r = relation(p, q)
        if (r) out.push({ a: i, b: j, kind: r })
      }
    }
  return out
}

/** Squares and plant counts per plant id. */
export function tally(cells: (string | null)[]): { id: string; squares: number; plants: number }[] {
  const m = new Map<string, number>()
  for (const c of cells) if (c) m.set(c, (m.get(c) ?? 0) + 1)
  return [...m.entries()].map(([id, squares]) => ({ id, squares, plants: Math.floor(squares * (plant(id)?.perSq ?? 1) + 1e-9) })).sort((a, b) => b.squares - a.squares)
}

/** Resizes a row-major grid, keeping the top-left content. */
export function resize(cells: (string | null)[], w0: number, w1: number, h1: number): (string | null)[] {
  const h0 = Math.ceil(cells.length / w0)
  return Array.from({ length: w1 * h1 }, (_, i) => {
    const x = i % w1, y = Math.floor(i / w1)
    return x < w0 && y < h0 ? (cells[y * w0 + x] ?? null) : null
  })
}
