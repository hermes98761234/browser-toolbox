// Wallpaper estimating: strip layout per wall, pattern-repeat cut lengths, pieces around openings,
// and first-fit-decreasing packing of cut pieces into rolls. All lengths in centimetres.

export type Match = 'random' | 'straight' | 'half'
export interface Wall { name: string; width: number; height: number }
export interface Opening { wall: number; x: number; y: number; w: number; h: number; label: string }
export interface Input {
  walls: Wall[]
  openings: Opening[]
  rollWidth: number
  rollLength: number
  repeat: number
  match: Match
  /** total trim allowance per piece (top + bottom) */
  trim: number
}
export interface Piece { wall: number; strip: number; len: number; kind: 'full' | 'above' | 'below' }

/** Length to cut for a drop of visible height `h`, honouring the pattern repeat. */
export function cutLength(h: number, trim: number, repeat: number, match: Match): number {
  const need = h + trim
  if (match === 'random' || repeat <= 0) return need
  const aligned = Math.ceil(need / repeat - 1e-9) * repeat
  // half-drop: every other strip starts half a repeat lower, costing R/2 on average
  return match === 'half' ? aligned + repeat / 2 : aligned
}

export function pieces(inp: Input): Piece[] {
  const out: Piece[] = []
  inp.walls.forEach((w, wi) => {
    if (!(w.width > 0 && w.height > 0) || !(inp.rollWidth > 0)) return
    const n = Math.ceil(w.width / inp.rollWidth - 1e-9)
    const ops = inp.openings.filter((o) => o.wall === wi && o.w > 0 && o.h > 0)
    for (let i = 0; i < n; i++) {
      const x0 = i * inp.rollWidth, x1 = Math.min(w.width, x0 + inp.rollWidth)
      // an opening only saves paper when it spans the strip's full visible width
      const cover = ops.find((o) => o.x <= x0 + 0.5 && o.x + o.w >= x1 - 0.5)
      if (!cover) {
        out.push({ wall: wi, strip: i, len: cutLength(w.height, inp.trim, inp.repeat, inp.match), kind: 'full' })
        continue
      }
      const above = w.height - (cover.y + cover.h)
      if (above > 0.5) out.push({ wall: wi, strip: i, len: cutLength(above, inp.trim, inp.repeat, inp.match), kind: 'above' })
      if (cover.y > 0.5) out.push({ wall: wi, strip: i, len: cutLength(cover.y, inp.trim, inp.repeat, inp.match), kind: 'below' })
    }
  })
  return out
}

/** First-fit decreasing: returns the pieces assigned to each roll. Pieces longer than a roll are flagged. */
export function packRolls(ps: Piece[], rollLength: number): { rolls: Piece[][]; tooLong: Piece[] } {
  const tooLong = ps.filter((p) => p.len > rollLength)
  const sorted = ps.filter((p) => p.len <= rollLength).sort((a, b) => b.len - a.len)
  const rolls: Piece[][] = []
  const free: number[] = []
  for (const p of sorted) {
    let k = free.findIndex((f) => f >= p.len - 1e-9)
    if (k < 0) {
      rolls.push([])
      free.push(rollLength)
      k = rolls.length - 1
    }
    rolls[k].push(p)
    free[k] -= p.len
  }
  return { rolls, tooLong }
}

export function estimate(inp: Input) {
  const ps = pieces(inp)
  const full = cutLength(Math.max(0, ...inp.walls.map((w) => w.height)), inp.trim, inp.repeat, inp.match)
  const perRoll = full > 0 ? Math.floor(inp.rollLength / full + 1e-9) : 0
  const strips = inp.walls.reduce((a, w) => a + (w.width > 0 ? Math.ceil(w.width / inp.rollWidth - 1e-9) : 0), 0)
  const { rolls, tooLong } = packRolls(ps, inp.rollLength)
  const area = inp.walls.reduce((a, w) => a + w.width * w.height, 0) - inp.openings.reduce((a, o) => a + (inp.walls[o.wall] ? o.w * o.h : 0), 0)
  const paper = rolls.length * inp.rollLength * inp.rollWidth
  return {
    pieces: ps,
    rolls,
    tooLong,
    strips,
    fullCut: full,
    perRoll,
    /** simple "strips ÷ strips-per-roll" estimate, ignoring openings */
    naiveRolls: perRoll > 0 ? Math.ceil(strips / perRoll) : Infinity,
    /** net wall area to cover, cm² */
    area,
    waste: paper > 0 ? 1 - area / paper : 0,
  }
}
