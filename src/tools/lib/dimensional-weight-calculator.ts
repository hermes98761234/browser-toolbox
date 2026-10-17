// Dimensional (volumetric) weight: carrier divisors, rounding rules and chargeable weight.

export const IN = 2.54
export const LB = 0.45359237

export interface Carrier {
  id: string
  name: string
  system: 'imperial' | 'metric'
  divisor: number // in³/lb or cm³/kg
  weightStep: number // round billed weight up to this step (lb or kg)
  minVolume?: number // dim weight only applies above this volume (native units³)
  note: string
}

export const CARRIERS: Carrier[] = [
  { id: 'us139', name: 'UPS / FedEx (US daily)', system: 'imperial', divisor: 139, weightStep: 1, note: 'Most US ground & air services' },
  { id: 'usps', name: 'USPS (Priority, Ground Adv.)', system: 'imperial', divisor: 166, weightStep: 1, minVolume: 1728, note: 'Only parcels over 1 ft³' },
  { id: 'exp5000', name: 'Express intl (DHL, UPS, FedEx)', system: 'metric', divisor: 5000, weightStep: 0.5, note: '5000 cm³/kg' },
  { id: 'eu4000', name: 'Road courier (4000)', system: 'metric', divisor: 4000, weightStep: 0.5, note: 'Some EU couriers & pallets' },
  { id: 'iata', name: 'Air cargo (IATA 6000)', system: 'metric', divisor: 6000, weightStep: 0.5, note: '1 m³ = 166.67 kg' },
  { id: 'sea', name: 'Sea freight LCL (1:1000)', system: 'metric', divisor: 1000, weightStep: 1, note: '1 m³ = 1 tonne (W/M)' },
]

/** Dimensions in cm and weight in kg → billed values for a carrier, in the carrier's own units. */
export function rate(c: Carrier, dimsCm: [number, number, number], kg: number) {
  const imp = c.system === 'imperial'
  const dims = dimsCm.map((d) => Math.round(imp ? d / IN : d)) as [number, number, number] // carriers round each side to a whole unit
  const vol = dims[0] * dims[1] * dims[2]
  const actual = imp ? kg / LB : kg
  const applies = c.minVolume === undefined || vol > c.minVolume
  const dim = applies ? vol / c.divisor : 0
  const up = (x: number) => Math.ceil(x / c.weightStep - 1e-9) * c.weightStep
  const billed = up(Math.max(actual, dim))
  const unit = imp ? 'lb' : 'kg'
  return { dims, vol, actual, dim, applies, billed, unit, billedKg: imp ? billed * LB : billed, dimWins: applies && dim > actual }
}

/** Divisor equivalence: in³/lb → cm³/kg. */
export const toMetricDivisor = (inPerLb: number) => (inPerLb * IN ** 3) / LB

/** Largest cube side (cm) whose dim weight still does not exceed the actual weight. */
export const breakEvenSide = (kg: number, cm3PerKg: number) => Math.cbrt(kg * cm3PerKg)

export interface Pkg {
  id: string
  name: string
  l: number
  w: number
  h: number
  wt: number
  qty: number
}

/** Parses "name, L, W, H, weight[, qty]" lines (comma / tab / semicolon). */
export function parseBatch(text: string): Omit<Pkg, 'id'>[] {
  const out: Omit<Pkg, 'id'>[] = []
  for (const line of text.split(/\r?\n/)) {
    const p = line.split(/[,;\t]/).map((x) => x.trim())
    if (p.length < 5) continue
    const n = p.slice(1, 6).map(Number)
    if (n.slice(0, 4).some((x) => !Number.isFinite(x) || x <= 0)) continue
    out.push({ name: p[0] || 'Box', l: n[0], w: n[1], h: n[2], wt: n[3], qty: Number.isFinite(n[4]) && n[4] > 0 ? Math.round(n[4]) : 1 })
  }
  return out
}
