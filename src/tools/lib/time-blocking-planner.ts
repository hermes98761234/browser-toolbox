// Time blocks: snapping, overlaps, per-category minutes and plan-vs-actual adherence. Times are minutes from midnight.

export interface Block { id: string; col: 'plan' | 'actual'; start: number; end: number; title: string; cat: string }

export const snap = (m: number, step = 15) => Math.round(m / step) * step
export const hhmm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(Math.round(m % 60)).padStart(2, '0')}`
export const parseHhmm = (s: string) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim())
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN
}

const overlap = (a0: number, a1: number, b0: number, b1: number) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0))

/** Minutes per category in one column (overlapping blocks are counted once per category). */
export function minutesByCat(blocks: Block[]): Record<string, number> {
  const out: Record<string, number> = {}
  const cats = [...new Set(blocks.map((b) => b.cat))]
  for (const c of cats) out[c] = union(blocks.filter((b) => b.cat === c))
  return out
}

/** Total length of the union of block intervals. */
export function union(blocks: { start: number; end: number }[]): number {
  const iv = blocks.map((b) => [b.start, b.end]).filter(([a, b]) => b > a).sort((a, b) => a[0] - b[0])
  let total = 0, cs = -Infinity, ce = -Infinity
  for (const [a, b] of iv) {
    if (a > ce) {
      if (ce > cs) total += ce - cs
      cs = a
      ce = b
    } else ce = Math.max(ce, b)
  }
  if (ce > cs) total += ce - cs
  return total
}

/** Pairs of overlapping blocks within the same column. */
export function conflicts(blocks: Block[]): [Block, Block][] {
  const out: [Block, Block][] = []
  for (let i = 0; i < blocks.length; i++)
    for (let j = i + 1; j < blocks.length; j++) {
      const a = blocks[i], b = blocks[j]
      if (a.col === b.col && overlap(a.start, a.end, b.start, b.end) > 0) out.push([a, b])
    }
  return out
}

/**
 * Adherence = minutes where the actual block has the same category as the planned block at that time,
 * divided by planned minutes. Computed minute by minute for clarity (a day has only 1440 minutes).
 */
export function adherence(plan: Block[], actual: Block[]): { matched: number; planned: number; unplanned: number; score: number } {
  const p = new Array<string | null>(1440).fill(null)
  const a = new Array<string | null>(1440).fill(null)
  for (const b of plan) for (let m = Math.max(0, b.start); m < Math.min(1440, b.end); m++) p[m] = b.cat
  for (const b of actual) for (let m = Math.max(0, b.start); m < Math.min(1440, b.end); m++) a[m] = b.cat
  let matched = 0, planned = 0, unplanned = 0
  for (let m = 0; m < 1440; m++) {
    if (p[m] !== null) {
      planned++
      if (a[m] === p[m]) matched++
    } else if (a[m] !== null) unplanned++
  }
  return { matched, planned, unplanned, score: planned ? matched / planned : 0 }
}

/** Lays out overlapping blocks of one column side by side: returns lane index and lane count per block id. */
export function lanes(blocks: Block[]): Record<string, { lane: number; of: number }> {
  const sorted = [...blocks].sort((a, b) => a.start - b.start || b.end - a.end)
  const out: Record<string, { lane: number; of: number }> = {}
  let group: Block[] = [], groupEnd = -Infinity, laneEnds: number[] = []
  const flush = () => {
    for (const b of group) out[b.id].of = laneEnds.length
    group = []
    laneEnds = []
  }
  for (const b of sorted) {
    if (b.start >= groupEnd) flush()
    let lane = laneEnds.findIndex((e) => e <= b.start)
    if (lane < 0) {
      lane = laneEnds.length
      laneEnds.push(b.end)
    } else laneEnds[lane] = b.end
    out[b.id] = { lane, of: 1 }
    group.push(b)
    groupEnd = Math.max(groupEnd, b.end)
  }
  flush()
  return out
}
