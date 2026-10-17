// 1-D cutting stock: first-fit / best-fit decreasing with kerf, end trim and several stock lengths.

export interface Cut { label: string; len: number; qty: number }
export interface Stock { len: number; price: number; qty: number } // qty 0 = unlimited
export interface Piece { label: string; len: number }
export interface Board { stock: number; price: number; pieces: Piece[]; used: number; offcut: number }
export interface Plan { boards: Board[]; unplaced: Piece[]; cost: number; bought: number; needed: number; waste: number; strategy: string }

/** Length consumed by `pieces` on one board (kerf between pieces, plus after the last when not flush). */
export const consumed = (pieces: Piece[], kerf: number, trim: number) =>
  pieces.length ? trim + pieces.reduce((a, p) => a + p.len, 0) + kerf * (pieces.length - 1) : 0

function fits(b: { stock: number; pieces: Piece[] }, p: Piece, kerf: number, trim: number) {
  return consumed([...b.pieces, p], kerf, trim) <= b.stock + 1e-9
}

function run(pieces: Piece[], stocks: Stock[], kerf: number, trim: number, best: boolean, open: 'long' | 'short'): Plan {
  const left = stocks.map((s) => (s.qty > 0 ? s.qty : Infinity))
  const boards: { stock: number; si: number; pieces: Piece[] }[] = []
  const unplaced: Piece[] = []
  for (const p of pieces) {
    let target = -1
    let slack = Infinity
    for (let i = 0; i < boards.length; i++) {
      if (!fits(boards[i], p, kerf, trim)) continue
      const r = boards[i].stock - consumed([...boards[i].pieces, p], kerf, trim)
      if (!best) { target = i; break }
      if (r < slack) { slack = r; target = i }
    }
    if (target < 0) {
      const cand = stocks
        .map((s, i) => ({ s, i }))
        .filter(({ s, i }) => left[i] > 0 && consumed([p], kerf, trim) <= s.len + 1e-9)
        .sort((a, b) => (open === 'long' ? b.s.len - a.s.len : a.s.len - b.s.len))
      if (!cand.length) { unplaced.push(p); continue }
      const { s, i } = cand[0]
      left[i]--
      boards.push({ stock: s.len, si: i, pieces: [] })
      target = boards.length - 1
    }
    boards[target].pieces.push(p)
  }
  // Downsize each board to the cheapest stock that still holds its pieces.
  for (const b of boards) {
    const need = consumed(b.pieces, kerf, trim)
    let bi = b.si
    for (let i = 0; i < stocks.length; i++) {
      if (i === bi || left[i] <= 0 || stocks[i].len + 1e-9 < need) continue
      const better = stocks[i].price < stocks[bi].price || (stocks[i].price === stocks[bi].price && stocks[i].len < stocks[bi].len)
      if (better) bi = i
    }
    if (bi !== b.si) { left[b.si]++; left[bi]--; b.si = bi; b.stock = stocks[bi].len }
  }
  const out: Board[] = boards.map((b) => {
    const used = consumed(b.pieces, kerf, trim)
    return { stock: b.stock, price: stocks[b.si].price, pieces: b.pieces, used, offcut: Math.max(0, b.stock - used) }
  })
  const bought = out.reduce((a, b) => a + b.stock, 0)
  const needed = out.reduce((a, b) => a + b.pieces.reduce((c, p) => c + p.len, 0), 0)
  return { boards: out, unplaced, cost: out.reduce((a, b) => a + b.price, 0), bought, needed, waste: bought ? 1 - needed / bought : 0, strategy: `${best ? 'Best' : 'First'}-fit decreasing, ${open === 'long' ? 'long' : 'short'} stock first` }
}

export function expand(cuts: Cut[]): Piece[] {
  const ps: Piece[] = []
  for (const c of cuts) for (let i = 0; i < Math.max(0, Math.floor(c.qty)); i++) if (c.len > 0) ps.push({ label: c.label, len: c.len })
  return ps.sort((a, b) => b.len - a.len)
}

/** Tries FFD and BFD with both stock-opening orders and returns the cheapest (then least waste) plan. */
export function optimize(cuts: Cut[], stocks: Stock[], kerf: number, trim = 0): Plan {
  const pieces = expand(cuts)
  const st = stocks.filter((s) => s.len > 0)
  const plans = [false, true].flatMap((best) => (['long', 'short'] as const).map((o) => run(pieces, st, kerf, trim, best, o)))
  plans.sort((a, b) => a.unplaced.length - b.unplaced.length || a.cost - b.cost || a.bought - b.bought || a.boards.length - b.boards.length)
  const p = plans[0]
  p.boards.sort((a, b) => b.stock - a.stock || a.offcut - b.offcut)
  return p
}
