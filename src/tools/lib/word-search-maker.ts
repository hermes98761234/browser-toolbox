// Word search generator: places words on a grid in allowed directions (with letter sharing),
// then fills empty cells. Deterministic for a given seed.

export type Dir = 'E' | 'S' | 'SE' | 'NE' | 'W' | 'N' | 'NW' | 'SW'
export const DIRS: Record<Dir, [number, number]> = { E: [0, 1], S: [1, 0], SE: [1, 1], NE: [-1, 1], W: [0, -1], N: [-1, 0], NW: [-1, -1], SW: [1, -1] }

export interface Placement { word: string; label: string; r: number; c: number; dir: Dir }
export interface Puzzle { rows: number; cols: number; grid: string[][]; placed: Placement[]; unplaced: string[] }

export function rng(seed: number) {
  let a = seed >>> 0 || 1
  return () => {
    a ^= a << 13; a >>>= 0
    a ^= a >>> 17
    a ^= a << 5; a >>>= 0
    return a / 4294967296
  }
}

/** "Ice-cream cone" → "ICECREAMCONE" (keeps any Unicode letters/digits). */
export const clean = (w: string) => [...w.toLocaleUpperCase()].filter((ch) => /[\p{L}\p{N}]/u.test(ch)).join('')

export function parseWords(text: string): { word: string; label: string }[] {
  const seen = new Set<string>()
  const out: { word: string; label: string }[] = []
  for (const raw of text.split(/[\n,;]+/)) {
    const label = raw.trim()
    const word = clean(label)
    if (word.length < 2 || seen.has(word)) continue
    seen.add(word)
    out.push({ word, label })
  }
  return out
}

export interface GenOpts { rows: number; cols: number; dirs: Dir[]; seed: number; overlap: boolean; fill: 'alphabet' | 'word-letters'; alphabet?: string }

export function generate(words: { word: string; label: string }[], o: GenOpts): Puzzle {
  const rnd = rng(o.seed)
  const grid: string[][] = Array.from({ length: o.rows }, () => Array<string>(o.cols).fill(''))
  const placed: Placement[] = []
  const unplaced: string[] = []
  const order = [...words].sort((a, b) => b.word.length - a.word.length || a.word.localeCompare(b.word))
  for (const { word, label } of order) {
    const L = [...word]
    const options: { r: number; c: number; dir: Dir; shared: number }[] = []
    for (const dir of o.dirs) {
      const [dr, dc] = DIRS[dir]
      for (let r = 0; r < o.rows; r++) {
        for (let c = 0; c < o.cols; c++) {
          const er = r + dr * (L.length - 1), ec = c + dc * (L.length - 1)
          if (er < 0 || er >= o.rows || ec < 0 || ec >= o.cols) continue
          let ok = true, shared = 0
          for (let i = 0; i < L.length; i++) {
            const g = grid[r + dr * i][c + dc * i]
            if (g === '') continue
            if (g !== L[i] || !o.overlap) { ok = false; break }
            shared++
          }
          if (ok && shared < L.length) options.push({ r, c, dir, shared })
        }
      }
    }
    if (!options.length) { unplaced.push(label); continue }
    // spread directions evenly, and prefer crossings a little for a denser, harder puzzle
    const used = new Map<Dir, number>()
    for (const p of placed) used.set(p.dir, (used.get(p.dir) ?? 0) + 1)
    const weight = (x: (typeof options)[number]) => (1 + x.shared * 2) / (1 + (used.get(x.dir) ?? 0))
    const total = options.reduce((a, x) => a + weight(x), 0)
    let pick = rnd() * total
    let choice = options[options.length - 1]
    for (const x of options) { pick -= weight(x); if (pick <= 0) { choice = x; break } }
    const [dr, dc] = DIRS[choice.dir]
    L.forEach((ch, i) => { grid[choice.r + dr * i][choice.c + dc * i] = ch })
    placed.push({ word, label, r: choice.r, c: choice.c, dir: choice.dir })
  }
  const pool = o.fill === 'word-letters' ? [...words.map((w) => w.word).join('')] : [...(o.alphabet || 'ABCDEFGHIJKLMNOPQRSTUVWXYZ')]
  for (const row of grid) for (let c = 0; c < row.length; c++) if (row[c] === '') row[c] = pool[Math.floor(rnd() * pool.length)] ?? 'X'
  return { rows: o.rows, cols: o.cols, grid, placed, unplaced }
}

/** Letters read from the grid along a placement (for verification). */
export function readPlacement(p: Puzzle, pl: Placement): string {
  const [dr, dc] = DIRS[pl.dir]
  return Array.from({ length: [...pl.word].length }, (_, i) => p.grid[pl.r + dr * i][pl.c + dc * i]).join('')
}

/** Smallest square-ish grid that comfortably fits the words. */
export function suggestSize(words: { word: string }[]): number {
  const longest = Math.max(0, ...words.map((w) => [...w.word].length))
  const letters = words.reduce((a, w) => a + [...w.word].length, 0)
  return Math.min(30, Math.max(longest + 1, Math.ceil(Math.sqrt(letters * 2.1)), 8))
}
