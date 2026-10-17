// FDM print estimate from mesh geometry: shell + infill + support volume, filament length/mass, time and cost.

export const MATERIALS: [string, number, number][] = [
  // name, density g/cm³, typical price per kg
  ['PLA', 1.24, 20],
  ['PETG', 1.27, 22],
  ['ABS', 1.04, 20],
  ['ASA', 1.07, 28],
  ['TPU', 1.21, 35],
  ['Nylon (PA)', 1.14, 45],
  ['PC', 1.2, 40],
  ['Resin-like PLA+', 1.25, 24],
]

export interface Geo {
  volume: number // mm³
  area: number // mm²
  height: number // mm
  footprint: number // mm² of bottom-facing area touching the bed
  thickArea: number // Σ area × per-face shell thickness (computed for given settings)
  overhang: number // support volume estimate mm³ (solid, before density)
}

export interface Settings {
  layer: number // mm
  line: number // extrusion width mm
  walls: number
  topBottom: number // layers
  infill: number // %
  supports: boolean
  supportDensity: number // %
}

/** Geometry measures that depend on slicing settings. pos = triangle soup, Z up, already scaled. */
export function analyze(pos: Float32Array, s: Settings): Geo {
  let zmin = Infinity, zmax = -Infinity
  for (let i = 2; i < pos.length; i += 3) { if (pos[i] < zmin) zmin = pos[i]; if (pos[i] > zmax) zmax = pos[i] }
  const tWall = s.walls * s.line
  const tTB = s.topBottom * s.layer
  let vol = 0, area = 0, thick = 0, foot = 0, sup = 0
  const cos45 = Math.SQRT1_2
  for (let o = 0; o < pos.length; o += 9) {
    const ax = pos[o], ay = pos[o + 1], az = pos[o + 2]
    const bx = pos[o + 3], by = pos[o + 4], bz = pos[o + 5]
    const cx = pos[o + 6], cy = pos[o + 7], cz = pos[o + 8]
    vol += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)
    const ux = bx - ax, uy = by - ay, uz = bz - az, wx = cx - ax, wy = cy - ay, wz = cz - az
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx
    const len = Math.hypot(nx, ny, nz)
    if (!len) continue
    const a = len / 2
    const k = nz / len // signed z-component of the outward normal
    area += a
    thick += a * (Math.abs(k) * tTB + (1 - Math.abs(k)) * tWall)
    const zc = (az + bz + cz) / 3
    if (k < -cos45) {
      if (zc - zmin < s.layer) foot += a * -k
      else sup += a * -k * (zc - zmin) // column of support under a downward-facing overhang
    }
  }
  const volume = Math.abs(vol) / 6
  return { volume, area, height: zmax - zmin, footprint: foot, thickArea: Math.min(thick, volume), overhang: s.supports ? sup : 0 }
}

export interface Costs {
  filamentPerKg: number
  density: number
  diameter: number
  speed: number // mm/s
  power: number // W
  kwh: number
  wearPerHour: number
  laborPerJob: number
  failure: number // %
  markup: number // %
  copies: number
}

export interface Estimate {
  shell: number
  infill: number
  support: number
  plastic: number // mm³
  grams: number
  meters: number
  hours: number
  layers: number
  material: number
  electricity: number
  wear: number
  labor: number
  subtotal: number
  withFailures: number
  price: number
  perCopy: number
}

export function estimate(g: Geo, s: Settings, c: Costs): Estimate {
  const shell = g.thickArea
  const infill = Math.max(0, g.volume - shell) * (s.infill / 100)
  const support = g.overhang * (s.supportDensity / 100)
  const n = Math.max(1, Math.round(c.copies))
  const plastic = (shell + infill + support) * n
  const grams = (plastic / 1000) * c.density
  const r = c.diameter / 2
  const meters = plastic / (Math.PI * r * r) / 1000
  const flow = Math.max(0.1, c.speed * s.line * s.layer) // mm³/s at nominal speed
  const layers = Math.ceil(g.height / Math.max(0.01, s.layer))
  // shells print slower (≈ 60 % speed); travel/accel overhead 20 %; ~2 s per layer change; 5 min heat-up
  const seconds = ((shell * n) / (flow * 0.6) + ((infill + support) * n) / flow) * 1.2 + layers * 2 * n + 300
  const hours = seconds / 3600
  const material = (grams / 1000) * c.filamentPerKg
  const electricity = (c.power / 1000) * hours * c.kwh
  const wear = hours * c.wearPerHour
  const labor = c.laborPerJob
  const subtotal = material + electricity + wear + labor
  const withFailures = subtotal * (1 + c.failure / 100)
  const price = withFailures * (1 + c.markup / 100)
  return { shell: shell * n, infill: infill * n, support: support * n, plastic, grams, meters, hours, layers, material, electricity, wear, labor, subtotal, withFailures, price, perCopy: price / n }
}

export function fmtDuration(h: number): string {
  if (!Number.isFinite(h)) return '—'
  const m = Math.round(h * 60)
  const d = Math.floor(m / 1440), hh = Math.floor((m % 1440) / 60), mm = m % 60
  return d ? `${d}d ${hh}h ${mm}m` : `${hh}h ${mm}m`
}
