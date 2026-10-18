// Coop sizing rules of thumb (widely used backyard-poultry guidance; metric internally):
// indoor floor 0.37 m²/standard bird (4 ft²), 0.19 m² bantam (2 ft²), 0.46 m² large breeds (5 ft²),
// ×2.5 when the birds have no run; run 0.93 m²/bird (10 ft²), half for bantams, 1.4 m² for large;
// roost 20 / 15 / 30 cm per bird; one nest box per 4 hens; ventilation ≥ 1/10 of the floor area.

export type Size = 'bantam' | 'standard' | 'large'
export type Climate = 'cold' | 'temperate' | 'hot'
export interface Flock { bantam: number; standard: number; large: number }
export interface Design { w: number; d: number; h: number; legs: number; runW: number; runL: number; runH: number; roof: 'gable' | 'shed'; pitch: number; overhang: number; confined: boolean; climate: Climate }

const FLOOR: Record<Size, number> = { bantam: 0.19, standard: 0.37, large: 0.46 }
const RUN: Record<Size, number> = { bantam: 0.46, standard: 0.93, large: 1.4 }
const ROOST: Record<Size, number> = { bantam: 0.15, standard: 0.2, large: 0.3 }
export const NEST_CM: Record<Size, number> = { bantam: 25, standard: 30, large: 36 }
const SIZES: Size[] = ['bantam', 'standard', 'large']

export const birds = (f: Flock) => SIZES.reduce((a, k) => a + Math.max(0, Math.round(f[k])), 0)

export function requirements(f: Flock, confined: boolean, climate: Climate) {
  const sum = (t: Record<Size, number>) => SIZES.reduce((a, k) => a + Math.max(0, f[k]) * t[k], 0)
  const n = birds(f)
  const floor = sum(FLOOR) * (confined ? 2.5 : 1)
  const largest: Size = f.large > 0 ? 'large' : f.standard > 0 ? 'standard' : 'bantam'
  return {
    n,
    floor,
    run: confined ? 0 : sum(RUN),
    roost: sum(ROOST),
    nests: n ? Math.max(1, Math.ceil(n / 4)) : 0,
    nestCm: NEST_CM[largest],
    vent: floor * (climate === 'hot' ? 0.2 : 0.1),
    feederCm: n * 10,
    waterL: n * (climate === 'hot' ? 1 : 0.5),
  }
}

/** Roost bars that fit: bars run along the coop depth, spaced 35 cm apart, 30 cm from the wall. */
export function roostLayout(d: Design, need: number) {
  const usable = Math.max(0.3, d.d - 0.1)
  const maxBars = Math.max(1, Math.floor((d.w - 0.3) / 0.35) + 1)
  const bars = Math.min(maxBars, Math.max(1, Math.ceil(need / usable)))
  return { bars, length: usable, total: bars * usable }
}

export interface Check { label: string; have: number; need: number; unit: string; ok: boolean }

export function checks(d: Design, f: Flock): Check[] {
  const r = requirements(f, d.confined, d.climate)
  const roost = roostLayout(d, r.roost)
  const nestFit = Math.floor(d.d / (r.nestCm / 100 + 0.02))
  const out: Check[] = [
    { label: 'Coop floor', have: d.w * d.d, need: r.floor, unit: 'm²', ok: d.w * d.d >= r.floor - 1e-9 },
    { label: 'Roost length', have: roost.total, need: r.roost, unit: 'm', ok: roost.total >= r.roost - 1e-9 },
    { label: 'Nest boxes (fit on one side)', have: nestFit, need: r.nests, unit: '', ok: nestFit >= r.nests },
    { label: 'Inside height', have: d.h, need: 1.0, unit: 'm', ok: d.h >= 1.0 },
  ]
  if (!d.confined) out.push({ label: 'Run area', have: d.runW * d.runL, need: r.run, unit: 'm²', ok: d.runW * d.runL >= r.run - 1e-9 })
  return out
}

/** Smallest roughly 4:3 coop footprint (rounded to 10 cm) that satisfies the floor and nest rules. */
export function autoSize(f: Flock, confined: boolean, climate: Climate) {
  const r = requirements(f, confined, climate)
  const minD = Math.max(0.9, (r.nests * (r.nestCm / 100 + 0.02)))
  let d = Math.max(minD, Math.sqrt(r.floor * 0.75))
  d = Math.ceil(d * 10) / 10
  const w = Math.max(0.9, Math.ceil((r.floor / d) * 10) / 10)
  const runL = r.run ? Math.ceil((r.run / Math.max(1.2, w + 0.6)) * 10) / 10 : 0
  return { w, d, runW: Math.max(1.2, Math.round((w + 0.6) * 10) / 10), runL }
}

export interface Material { item: string; qty: number; unit: string; note: string }

const SHEET = 1.22 * 2.44
export function materials(d: Design, f: Flock): Material[] {
  const r = requirements(f, d.confined, d.climate)
  const roost = roostLayout(d, r.roost)
  const perim = 2 * (d.w + d.d)
  const pitch = (d.pitch * Math.PI) / 180
  const rise = d.roof === 'gable' ? (d.w / 2) * Math.tan(pitch) : d.w * Math.tan(pitch)
  const slope = d.roof === 'gable' ? (d.w / 2 + d.overhang) / Math.cos(pitch) : (d.w + 2 * d.overhang) / Math.cos(pitch)
  const roofArea = (d.roof === 'gable' ? 2 : 1) * slope * (d.d + 2 * d.overhang)
  // gable: two end triangles (w·rise/2 each); shed: two side triangles (w·rise/2 each) on the short walls
  const gableArea = d.w * rise
  const wallArea = perim * d.h + gableArea
  const framing = 4 * (d.h + d.legs) + 2 * perim + Math.ceil(perim / 0.6) * d.h + (Math.ceil(d.w / 0.4) + 1) * d.d + (Math.ceil(d.d / 0.6) + 1) * slope * (d.roof === 'gable' ? 2 : 1)
  const runFrame = d.confined ? 0 : 4 * d.runH + 2 * (2 * (d.runW + d.runL)) + Math.ceil((2 * (d.runW + d.runL)) / 1.2) * d.runH
  const mesh = d.confined ? 0 : 2 * (d.runW + d.runL) * d.runH + d.runW * d.runL
  const bedding = d.w * d.d * 0.1
  const nestBox = r.nests * 5 * (r.nestCm / 100) ** 2
  return [
    { item: 'Plywood 18 mm (floor)', qty: Math.ceil((d.w * d.d * 1.1) / SHEET), unit: 'sheets 1.22×2.44 m', note: `${(d.w * d.d).toFixed(2)} m²` },
    { item: 'Plywood / siding 12 mm (walls, nest boxes)', qty: Math.ceil(((wallArea + nestBox) * 1.15) / SHEET), unit: 'sheets 1.22×2.44 m', note: `${(wallArea + nestBox).toFixed(1)} m² incl. gables & ${r.nests} nest boxes` },
    { item: 'Roofing (corrugated / OSB + felt)', qty: Math.round(roofArea * 10) / 10, unit: 'm²', note: `${d.roof} roof, ${d.pitch}° pitch, ${Math.round(d.overhang * 100)} cm overhang` },
    { item: 'Framing timber 38×63 mm', qty: Math.ceil(((framing + runFrame) * 1.1) / 2.4), unit: 'lengths of 2.4 m', note: `${Math.round(framing + runFrame)} m incl. ${Math.round(runFrame)} m for the run` },
    { item: 'Roost bars 50×50 mm (rounded edges)', qty: roost.bars, unit: `× ${roost.length.toFixed(2)} m`, note: `${roost.total.toFixed(2)} m total, 60–90 cm above floor, higher than nests` },
    ...(d.confined ? [] : [{ item: 'Welded mesh / hardware cloth 13 mm', qty: Math.ceil(mesh * 1.1), unit: 'm²', note: `walls + roof of a ${d.runW}×${d.runL} m run; bury a 30 cm apron against diggers` }]),
    { item: 'Ventilation openings (mesh-covered)', qty: Math.round(r.vent * 10000), unit: 'cm²', note: 'high on the walls, above the roosts, no draught on the birds' },
    { item: 'Bedding (shavings or straw, 10 cm deep)', qty: Math.round(bedding * 1000), unit: 'litres', note: `≈ ${Math.max(1, Math.ceil(bedding / 0.2))} compressed bale(s)` },
    { item: 'Hinges, latches, screws', qty: 3, unit: 'door sets', note: 'people door, pop hole, nest-box lid; predator-proof latches' },
  ]
}
