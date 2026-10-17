// Brick, mortar, wall-tie and lintel quantities for masonry walls. Lengths in metres, brick sizes in mm.

export interface Opening {
  id: string
  label: string
  w: number
  h: number
  count: number
}

export interface Wall {
  id: string
  name: string
  length: number
  height: number
  count: number
  openings: Opening[]
}

export type WallType = 'half' | 'one' | 'cavity'

export interface Options {
  brick: { l: number; w: number; h: number }
  joint: number // mm
  type: WallType
  waste: number // %
  mortarWaste: number // %
  cement: number // parts
  sand: number // parts
  tiesPerM2: number
  bagKg: number
}

export const WALL_TYPES: [WallType, string, number][] = [
  ['half', 'Half-brick (single leaf)', 1],
  ['one', 'One-brick (double leaf, solid)', 2],
  ['cavity', 'Cavity wall (two leaves + ties)', 2],
]

export const leaves = (t: WallType) => WALL_TYPES.find((x) => x[0] === t)![2]

/** Bricks per square metre of one leaf (stretcher face). */
export const bricksPerM2 = (l: number, h: number, joint: number) => 1 / (((l + joint) / 1000) * ((h + joint) / 1000))

export function wallAreas(w: Wall) {
  const gross = w.length * w.height
  const open = w.openings.reduce((a, o) => a + Math.max(0, o.w) * Math.max(0, o.h) * Math.max(0, o.count), 0)
  return { gross: gross * w.count, openings: Math.min(open, gross) * w.count, net: Math.max(0, gross - open) * w.count }
}

export interface Estimate {
  gross: number
  openings: number
  net: number
  perM2: number
  bricks: number
  bricksOrder: number
  mortarWet: number
  mortarDry: number
  cementKg: number
  cementBags: number
  sandKg: number
  ties: number
  lintels: { label: string; length: number; count: number }[]
  thickness: number
  courses: number
}

const DRY_FACTOR = 1.33 // dry loose volume needed per m³ of wet mortar
const CEMENT_DENSITY = 1440 // kg/m³
const SAND_DENSITY = 1600 // kg/m³ (damp loose building sand)

export function estimate(walls: Wall[], o: Options): Estimate {
  const L = leaves(o.type)
  let gross = 0, openings = 0, net = 0, ties = 0, courses = 0
  const lintels: Estimate['lintels'] = []
  for (const w of walls) {
    const a = wallAreas(w)
    gross += a.gross
    openings += a.openings
    net += a.net
    courses = Math.max(courses, Math.round((w.height * 1000) / (o.brick.h + o.joint)))
    for (const op of w.openings) {
      if (op.w <= 0 || op.h <= 0 || op.count <= 0) continue
      const bearing = op.w <= 1.2 ? 0.15 : 0.2
      lintels.push({ label: `${w.name} · ${op.label}`, length: Math.ceil((op.w + 2 * bearing) * 20) / 20, count: op.count * w.count })
      if (o.type === 'cavity') ties += 2 * Math.ceil(op.h / 0.3) * op.count * w.count // extra ties at jambs every 300 mm
    }
  }
  const perM2 = bricksPerM2(o.brick.l, o.brick.h, o.joint) * L
  const bricks = net * perM2
  const brickVol = (o.brick.l * o.brick.w * o.brick.h) / 1e9
  const thickness = o.type === 'half' ? o.brick.w : o.type === 'one' ? 2 * o.brick.w + o.joint : 2 * o.brick.w
  // cavity: the cavity is not filled; solid one-brick walls have a collar joint
  const mortarVolume = o.type === 'cavity' ? net * 2 * (o.brick.w / 1000) - bricks * brickVol : net * (thickness / 1000) - bricks * brickVol
  const mortarWet = Math.max(0, mortarVolume) * (1 + o.mortarWaste / 100)
  const mortarDry = mortarWet * DRY_FACTOR
  const parts = o.cement + o.sand || 1
  const cementKg = (mortarDry * o.cement * CEMENT_DENSITY) / parts
  const sandKg = (mortarDry * o.sand * SAND_DENSITY) / parts
  if (o.type === 'cavity') ties += Math.ceil(net * o.tiesPerM2)
  return {
    gross, openings, net, perM2, bricks, bricksOrder: Math.ceil(bricks * (1 + o.waste / 100)),
    mortarWet, mortarDry, cementKg, cementBags: Math.ceil(cementKg / (o.bagKg || 25)), sandKg,
    ties, lintels, thickness, courses,
  }
}
