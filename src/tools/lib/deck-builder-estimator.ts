// Deck framing and material take-off for a ledger-attached rectangular deck (imperial, feet / inches).
// Joist spans: IRC 2015 Table R507.5, southern pine #2, 40 psf live + 10 psf dead, no snow. Always check local code.

export type JoistSize = '2x6' | '2x8' | '2x10' | '2x12'
export const JOIST_SIZES: JoistSize[] = ['2x6', '2x8', '2x10', '2x12']
/** Maximum joist span in feet by size and spacing (12 / 16 / 24 in on centre). */
export const SPAN: Record<JoistSize, Record<number, number>> = {
  '2x6': { 12: 11 + 10 / 12, 16: 10 + 9 / 12, 24: 9 + 4 / 12 },
  '2x8': { 12: 15 + 8 / 12, 16: 14 + 2 / 12, 24: 11 + 10 / 12 },
  '2x10': { 12: 18, 16: 16 + 1 / 12, 24: 13 + 2 / 12 },
  '2x12': { 12: 18, 16: 18, 24: 15 + 5 / 12 },
}
/** Actual depth in inches. */
export const DEPTH: Record<JoistSize, number> = { '2x6': 5.5, '2x8': 7.25, '2x10': 9.25, '2x12': 11.25 }

export interface DeckInput {
  width: number // ft, along the house
  depth: number // ft, away from the house (joist direction)
  height: number // ft, deck surface above grade
  spacing: 12 | 16 | 24 // joist spacing, in
  joist: JoistSize | 'auto'
  postSpacing: number // ft, max distance between beam posts
  boardWidth: number // in, actual (5.5 for 5/4x6 / 2x6)
  gap: number // in, between boards
  stock: number // ft, decking board length
  waste: number // %, extra decking
  railing: boolean
  stairs: boolean
  stairWidth: number // ft
}

export interface Prices { decking: number; joistLf: Record<JoistSize, number>; post: number; concreteBag: number; hanger: number; screwBox: number; railingFt: number; stringer: number; tread: number }

export const lumberLengths = [8, 10, 12, 14, 16, 18, 20]
/** Shortest stock length ≥ need (ft); falls back to the longest. */
export const stockFor = (need: number) => lumberLengths.find((l) => l >= need - 1e-9) ?? lumberLengths[lumberLengths.length - 1]

export function pickJoist(span: number, spacing: number): JoistSize | null {
  return JOIST_SIZES.find((j) => SPAN[j][spacing] >= span - 1e-9) ?? null
}

export function estimate(d: DeckInput) {
  const area = d.width * d.depth
  const span = d.depth - 0.5 // ledger to beam centre with a small cantilever-free setback
  const auto = pickJoist(span, d.spacing)
  const joist: JoistSize = d.joist === 'auto' ? (auto ?? '2x12') : d.joist
  const maxSpan = SPAN[joist][d.spacing]
  const spanOk = span <= maxSpan + 1e-9
  const joists = Math.ceil((d.width * 12) / d.spacing) + 1
  const joistLen = stockFor(d.depth)
  const posts = Math.max(2, Math.ceil(d.width / d.postSpacing) + 1)
  const postLen = stockFor(d.height + 1)
  const beamPlies = 2
  const beamPieces = Math.ceil(d.width / 16) * beamPlies
  const cover = d.boardWidth + d.gap
  const rows = Math.ceil((d.depth * 12) / cover)
  const perRow = Math.ceil(d.width / d.stock - 1e-9)
  const boards = Math.ceil(rows * perRow * (1 + d.waste / 100))
  const deckLf = boards * d.stock
  const screws = rows * joists * 2
  // 12" diameter footing, 3 ft deep: π·0.5²·3 ≈ 2.36 ft³; 80 lb bag ≈ 0.6 ft³
  const footVol = Math.PI * 0.25 * 3
  const bags = Math.ceil((posts + (d.stairs ? 2 : 0)) * footVol / 0.6)
  const railNeeded = d.height * 12 > 30
  const railFt = d.railing ? 2 * d.depth + d.width - (d.stairs ? d.stairWidth : 0) : 0
  const railPosts = d.railing ? Math.ceil(d.depth / 6) * 2 + Math.ceil(d.width / 6) + 1 : 0
  const balusters = d.railing ? Math.ceil((railFt * 12) / 5.5) : 0 // 3.5" gap + 1.5" baluster < 4" sphere rule
  const totalRise = d.height * 12
  const risers = d.stairs && totalRise > 0 ? Math.ceil(totalRise / 7.75) : 0
  const riserH = risers ? totalRise / risers : 0
  const treads = Math.max(0, risers - 1)
  const run = treads * 10
  const stringers = d.stairs ? Math.max(2, Math.ceil((d.stairWidth * 12) / 16) + 1) : 0
  return {
    area, span, joist, auto, maxSpan, spanOk, joists, joistLen, posts, postLen, beamPlies, beamPieces, rows, perRow, boards, deckLf,
    screws, screwBoxes: Math.ceil(screws / 350), hangers: joists, ties: joists, bags, railNeeded, railFt, railPosts, balusters,
    risers, riserH, treads, run, stringers, ledger: d.width, rim: d.width,
  }
}

export type Estimate = ReturnType<typeof estimate>

export function bill(d: DeckInput, e: Estimate, p: Prices): [string, number, string, number][] {
  const rows: [string, number, string, number][] = [
    [`Decking boards ${d.stock} ft`, e.boards, 'pcs', e.boards * d.stock * p.decking],
    [`Joists ${e.joist} × ${e.joistLen} ft`, e.joists, 'pcs', e.joists * e.joistLen * p.joistLf[e.joist]],
    [`Ledger + rim ${e.joist} (${d.width} ft each)`, 2 * Math.ceil(d.width / 16), 'pcs', 2 * Math.ceil(d.width / 16) * 16 * p.joistLf[e.joist]],
    [`Beam ${e.joist} doubled`, e.beamPieces, 'pcs', e.beamPieces * 16 * p.joistLf[e.joist]],
    [`Posts 6x6 × ${e.postLen} ft`, e.posts, 'pcs', e.posts * p.post * (e.postLen / 8)],
    ['Concrete 80 lb bags', e.bags, 'bags', e.bags * p.concreteBag],
    ['Joist hangers + hurricane ties', e.hangers + e.ties, 'pcs', (e.hangers + e.ties) * p.hanger],
    ['Deck screws (350/box)', e.screwBoxes, 'boxes', e.screwBoxes * p.screwBox],
  ]
  if (d.railing) rows.push([`Railing (${e.railPosts} posts, ${e.balusters} balusters)`, Math.round(e.railFt * 10) / 10, 'ft', e.railFt * p.railingFt])
  if (d.stairs && e.risers) rows.push([`Stair stringers (${e.risers} risers)`, e.stringers, 'pcs', e.stringers * p.stringer], [`Stair treads ${d.stairWidth} ft`, e.treads * 2, 'boards', e.treads * 2 * p.tread])
  return rows
}
