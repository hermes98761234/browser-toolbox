// Pure page-list operations for the PDF Page Organizer.

export interface PageItem {
  id: string
  /** index of the source document (−1 = inserted blank page) */
  src: number
  /** page index inside the source document */
  index: number
  /** page size in points, unrotated */
  w: number
  h: number
  /** rotation already stored in the source file (/Rotate) */
  baseRot: number
  /** extra rotation chosen by the user */
  rot: number
}

/** Normalises any multiple of 90° into 0, 90, 180 or 270. */
export const norm = (deg: number) => (((Math.round(deg / 90) * 90) % 360) + 360) % 360

/** Final rotation written to the output page. */
export const finalRot = (p: Pick<PageItem, 'baseRot' | 'rot'>) => norm(p.baseRot + p.rot)

/** Visible width/height after rotation. */
export function shownSize(p: Pick<PageItem, 'w' | 'h' | 'baseRot' | 'rot'>): [number, number] {
  return finalRot(p) % 180 === 0 ? [p.w, p.h] : [p.h, p.w]
}

/** Moves the item at `from` so it ends up at index `to` (indices in the original list). */
export function move<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= list.length) return list
  const out = list.slice()
  const [it] = out.splice(from, 1)
  out.splice(Math.max(0, Math.min(out.length, to)), 0, it)
  return out
}

/** Moves a set of ids as a block so that it starts before the item `beforeId` (or at the end). */
export function moveBlock<T extends { id: string }>(list: T[], ids: Set<string>, beforeId: string | null): T[] {
  const moving = list.filter((p) => ids.has(p.id))
  if (!moving.length) return list
  const rest = list.filter((p) => !ids.has(p.id))
  let at = beforeId === null ? rest.length : rest.findIndex((p) => p.id === beforeId)
  if (at < 0) {
    // target is itself part of the moved block: keep the block where its first page was
    at = list.slice(0, list.findIndex((p) => ids.has(p.id))).filter((p) => !ids.has(p.id)).length
  }
  return [...rest.slice(0, at), ...moving, ...rest.slice(at)]
}

/**
 * Collates a duplex scan done as two single-sided passes: the first half holds the fronts
 * (1, 3, 5 …) and the second half the backs in reverse order (… 6, 4, 2).
 */
export function collateDuplex<T>(list: T[], backsReversed = true): T[] {
  const half = Math.ceil(list.length / 2)
  const fronts = list.slice(0, half)
  const backs = list.slice(half)
  if (backsReversed) backs.reverse()
  const out: T[] = []
  for (let i = 0; i < half; i++) {
    out.push(fronts[i])
    if (i < backs.length) out.push(backs[i])
  }
  return out
}

/** Parses "1, 3-5, 8-" into 0-based indices (unique, in the order given). */
export function parsePageSet(spec: string, total: number): { idx: number[]; error: string } {
  const idx: number[] = []
  const seen = new Set<number>()
  for (const raw of spec.split(/[,;\s]+/).filter(Boolean)) {
    const m = /^(\d*)(?:(-)(\d*))?$/.exec(raw)
    if (!m || (!m[1] && !m[3] && !m[2])) return { idx: [], error: `Cannot read “${raw}”` }
    const a = m[1] ? +m[1] : 1
    const b = m[2] ? (m[3] ? +m[3] : total) : a
    if (a < 1 || b > total || a > b) return { idx: [], error: `“${raw}” is outside 1–${total}` }
    for (let i = a; i <= b; i++) if (!seen.has(i - 1)) { seen.add(i - 1); idx.push(i - 1) }
  }
  return { idx, error: '' }
}

const PAPER: [string, number, number][] = [['A4', 595.28, 841.89], ['Letter', 612, 792], ['Legal', 612, 1008], ['A5', 419.53, 595.28], ['A3', 841.89, 1190.55]]
export function paperLabel(w: number, h: number): string {
  const [a, b] = w < h ? [w, h] : [h, w]
  const hit = PAPER.find(([, pw, ph]) => Math.abs(pw - a) < 3 && Math.abs(ph - b) < 3)
  return hit ? hit[0] : `${Math.round((w / 72) * 25.4)}×${Math.round((h / 72) * 25.4)} mm`
}
