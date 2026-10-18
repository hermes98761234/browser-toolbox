// Dog house sizing rules and cut list (all lengths in inches).
// Rules of thumb used by shelters and builders: interior length and width ≈ 1.25 × the dog's
// nose-to-tail-base length (room to turn and lie down, small enough to keep warm), interior height
// ≈ 1.25 × standing height (top of head), door height ≈ 75 % of shoulder height, door width ≈ chest
// width + 25 %, floor raised ~4 in off the ground.

export interface Dog { length: number; height: number; withers: number; chest: number }
export type Roof = 'gable' | 'shed'
export interface Options { roof: Roof; pitch: number; overhang: number; ply: number; raise: number; climate: 'cold' | 'mild' | 'hot'; porch: boolean }
export interface Dims {
  inW: number; inD: number; inH: number // interior width (side to side), depth (front to back), wall height
  outW: number; outD: number
  rise: number // gable: ridge rise above walls; shed: extra height at the front
  doorW: number; doorH: number; doorOffset: number // door centre offset from middle (+ = right)
  porchD: number
}

const r2 = (x: number) => Math.round(x * 2) / 2 // round to ½ in

export function design(d: Dog, o: Options): Dims {
  const k = o.climate === 'cold' ? 1.15 : o.climate === 'hot' ? 1.35 : 1.25
  const inW = r2(Math.max(d.length * k, d.chest * 3))
  const inD = r2(d.length * k)
  const inH = r2(Math.max(d.height * (o.climate === 'hot' ? 1.35 : 1.2), d.withers + 4))
  const outW = inW + 2 * o.ply, outD = inD + 2 * o.ply
  const t = Math.tan((o.pitch * Math.PI) / 180)
  const rise = o.roof === 'gable' ? (outW / 2) * t : outD * t
  const doorW = r2(Math.max(5, d.chest * 1.25))
  const doorH = r2(Math.min(inH - 2, Math.max(d.withers * 0.75, d.height * 0.6)))
  // Off-centre door (cold climates) keeps a draught-free sleeping corner.
  const doorOffset = o.climate === 'cold' ? r2(Math.max(0, inW / 2 - doorW / 2 - 3)) : 0
  return { inW, inD, inH, outW, outD, rise, doorW, doorH, doorOffset, porchD: o.porch ? r2(d.length * 0.6) : 0 }
}

export interface PanelCut { name: string; w: number; h: number; qty: number; note?: string }
export interface StickCut { name: string; len: number; qty: number }

export function cutList(m: Dims, o: Options): { panels: PanelCut[]; sticks: StickCut[] } {
  const rad = (o.pitch * Math.PI) / 180
  const panels: PanelCut[] = [{ name: 'Floor', w: m.outW, h: m.outD, qty: 1 }]
  const sticks: StickCut[] = []
  if (o.roof === 'gable') {
    panels.push({ name: 'Front & back wall', w: m.outW, h: m.inH + m.rise, qty: 2, note: `cut gable peak ${m.rise.toFixed(1)}″ high; door in front` })
    panels.push({ name: 'Side wall', w: m.outD - 2 * o.ply, h: m.inH, qty: 2 })
    const slope = m.outW / 2 / Math.cos(rad) + o.overhang
    panels.push({ name: 'Roof panel', w: m.outD + 2 * o.overhang + m.porchD, h: slope, qty: 2, note: `${o.pitch}° bevel at ridge` })
    sticks.push({ name: 'Ridge cleat (2×2)', len: m.outD - 2 * o.ply, qty: 1 })
  } else {
    panels.push({ name: 'Front wall', w: m.outW, h: m.inH + m.rise, qty: 1, note: 'door here' })
    panels.push({ name: 'Back wall', w: m.outW, h: m.inH, qty: 1 })
    panels.push({ name: 'Side wall (trapezoid)', w: m.outD - 2 * o.ply, h: m.inH + m.rise, qty: 2, note: `${m.inH.toFixed(1)}″ at back → ${(m.inH + m.rise).toFixed(1)}″ at front` })
    panels.push({ name: 'Roof panel', w: m.outW + 2 * o.overhang, h: m.outD / Math.cos(rad) + 2 * o.overhang + m.porchD, qty: 1 })
  }
  if (m.porchD) panels.push({ name: 'Porch deck', w: m.outW, h: m.porchD, qty: 1 })
  sticks.push({ name: 'Floor skid (2×4)', len: m.outD + m.porchD, qty: 3 })
  sticks.push({ name: 'Corner cleat (2×2)', len: m.inH, qty: 4 })
  sticks.push({ name: 'Top cleat (2×2)', len: m.inW, qty: 2 })
  if (o.climate === 'cold') {
    panels.push({ name: 'Foam insulation (walls)', w: m.inD, h: m.inH, qty: 2, note: 'rigid foam, covered by inner ply or lining' })
    panels.push({ name: 'Foam insulation (front/back)', w: m.inW, h: m.inH, qty: 2 })
  }
  return { panels, sticks }
}

/** Plywood area (ft²) of the structural panels. */
export const plyArea = (p: PanelCut[]) => p.filter((x) => !x.name.startsWith('Foam')).reduce((a, x) => a + x.w * x.h * x.qty, 0) / 144

export interface Breed { name: string; dog: Dog; weight: number }
export const BREEDS: Breed[] = [
  { name: 'Chihuahua', dog: { length: 9, height: 9, withers: 7, chest: 4 }, weight: 5 },
  { name: 'Dachshund', dog: { length: 18, height: 12, withers: 9, chest: 6 }, weight: 22 },
  { name: 'Jack Russell Terrier', dog: { length: 14, height: 15, withers: 12, chest: 5 }, weight: 14 },
  { name: 'French / English Bulldog', dog: { length: 18, height: 17, withers: 14, chest: 10 }, weight: 50 },
  { name: 'Beagle', dog: { length: 20, height: 19, withers: 15, chest: 7 }, weight: 25 },
  { name: 'Border Collie', dog: { length: 26, height: 26, withers: 21, chest: 8 }, weight: 40 },
  { name: 'Labrador Retriever', dog: { length: 30, height: 30, withers: 23, chest: 10 }, weight: 70 },
  { name: 'Golden Retriever', dog: { length: 30, height: 29, withers: 23, chest: 10 }, weight: 70 },
  { name: 'German Shepherd', dog: { length: 32, height: 32, withers: 25, chest: 10 }, weight: 75 },
  { name: 'Siberian Husky', dog: { length: 26, height: 27, withers: 22, chest: 9 }, weight: 50 },
  { name: 'Great Dane', dog: { length: 40, height: 42, withers: 32, chest: 13 }, weight: 140 },
]
