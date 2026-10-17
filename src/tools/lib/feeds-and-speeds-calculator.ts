// Milling and drilling feeds & speeds (inch units internally).

export interface Material {
  name: string
  /** surface speed, ft/min, for HSS and carbide */
  sfm: { hss: number; carbide: number }
  /** chip load per tooth for a 1/2" end mill (in) */
  cl: number
  /** drill feed per rev as a fraction of diameter */
  drill: number
  /** unit power, hp per in³/min (at the spindle) */
  kp: number
}

export const MATERIALS: Material[] = [
  { name: 'Aluminum 6061', sfm: { hss: 300, carbide: 1000 }, cl: 0.005, drill: 0.02, kp: 0.25 },
  { name: 'Aluminum 7075', sfm: { hss: 300, carbide: 900 }, cl: 0.0045, drill: 0.018, kp: 0.3 },
  { name: 'Brass 360', sfm: { hss: 250, carbide: 600 }, cl: 0.004, drill: 0.016, kp: 0.5 },
  { name: 'Copper (C110)', sfm: { hss: 100, carbide: 450 }, cl: 0.003, drill: 0.012, kp: 0.9 },
  { name: 'Mild steel 1018', sfm: { hss: 90, carbide: 400 }, cl: 0.003, drill: 0.014, kp: 1.0 },
  { name: 'Alloy steel 4140', sfm: { hss: 70, carbide: 300 }, cl: 0.0025, drill: 0.012, kp: 1.3 },
  { name: 'Stainless 304', sfm: { hss: 50, carbide: 250 }, cl: 0.002, drill: 0.01, kp: 1.5 },
  { name: 'Tool steel (annealed)', sfm: { hss: 40, carbide: 200 }, cl: 0.0018, drill: 0.009, kp: 1.6 },
  { name: 'Cast iron (gray)', sfm: { hss: 80, carbide: 350 }, cl: 0.003, drill: 0.015, kp: 0.8 },
  { name: 'Titanium 6Al-4V', sfm: { hss: 30, carbide: 150 }, cl: 0.002, drill: 0.008, kp: 1.3 },
  { name: 'Acetal (Delrin)', sfm: { hss: 500, carbide: 800 }, cl: 0.006, drill: 0.02, kp: 0.05 },
  { name: 'Acrylic', sfm: { hss: 400, carbide: 600 }, cl: 0.005, drill: 0.016, kp: 0.05 },
  { name: 'Hardwood', sfm: { hss: 600, carbide: 1000 }, cl: 0.008, drill: 0.03, kp: 0.03 },
  { name: 'MDF / softwood', sfm: { hss: 800, carbide: 1500 }, cl: 0.01, drill: 0.03, kp: 0.02 },
]

/** RPM = 12·SFM / (π·D) */
export const rpmFor = (sfm: number, d: number) => (12 * sfm) / (Math.PI * d)
export const sfmFor = (rpm: number, d: number) => (rpm * Math.PI * d) / 12

/** Recommended chip load: scales with diameter, flattening for small tools. */
export function chipLoad(m: Material, d: number): number {
  const k = d >= 0.5 ? d / 0.5 : Math.pow(d / 0.5, 0.85)
  return m.cl * Math.min(k, 2)
}

/** Radial chip thinning factor: with stepover ae < D/2, the real chip is thinner than the feed per tooth. */
export function chipThinning(ae: number, d: number): number {
  const r = Math.min(Math.max(ae / d, 1e-6), 0.5)
  return 1 / Math.sqrt(1 - (1 - 2 * r) ** 2)
}

export interface MillInput {
  d: number
  flutes: number
  sfm: number
  /** target (real) chip thickness per tooth */
  chip: number
  ae: number
  ap: number
  maxRpm: number
  maxFeed: number
  kp: number
  efficiency: number
  thinning: boolean
}

export interface MillResult {
  rpm: number
  rpmCapped: boolean
  sfm: number
  /** programmed feed per tooth (after chip-thinning compensation) */
  fz: number
  feed: number
  feedCapped: boolean
  mrr: number
  /** horsepower at the spindle and from the motor */
  hpCut: number
  hpMotor: number
  torque: number
  rctf: number
}

export function mill(p: MillInput): MillResult {
  let rpm = rpmFor(p.sfm, p.d)
  const rpmCapped = p.maxRpm > 0 && rpm > p.maxRpm
  if (rpmCapped) rpm = p.maxRpm
  const rctf = p.thinning ? chipThinning(p.ae, p.d) : 1
  let fz = p.chip * rctf
  let feed = rpm * p.flutes * fz
  const feedCapped = p.maxFeed > 0 && feed > p.maxFeed
  if (feedCapped) {
    feed = p.maxFeed
    fz = feed / (rpm * p.flutes)
  }
  const mrr = Math.min(p.ae, p.d) * p.ap * feed
  const hpCut = mrr * p.kp
  const hpMotor = hpCut / (p.efficiency || 1)
  return { rpm, rpmCapped, sfm: sfmFor(rpm, p.d), fz, feed, feedCapped, mrr, hpCut, hpMotor, torque: rpm ? (hpCut * 63025) / rpm : 0, rctf }
}

export interface DrillResult {
  rpm: number
  ipr: number
  feed: number
  mrr: number
  hp: number
  thrustNote: string
}

export function drill(m: Material, d: number, sfm: number, maxRpm: number, ipr?: number): DrillResult {
  let rpm = rpmFor(sfm, d)
  if (maxRpm > 0) rpm = Math.min(rpm, maxRpm)
  const f = ipr ?? m.drill * d
  const feed = rpm * f
  const mrr = ((Math.PI * d * d) / 4) * feed
  return { rpm, ipr: f, feed, mrr, hp: mrr * m.kp, thrustNote: d > 0.5 ? 'Consider a pilot hole (≈ web thickness) to cut thrust.' : '' }
}

export const IN_MM = 25.4
