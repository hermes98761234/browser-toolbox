// Transparent car depreciation model: a yearly percentage per vehicle age, times a mileage factor
// and a condition factor. Illustrative rule-of-thumb defaults, not market data.

export interface Preset { id: string; name: string; rates: number[] } // % lost in year 1, 2, … (last repeats)

export const PRESETS: Preset[] = [
  { id: 'avg', name: 'Average car', rates: [20, 15, 13, 12, 11, 10, 9, 8] },
  { id: 'eco', name: 'Economy / compact (holds value)', rates: [16, 13, 11, 10, 9, 9, 8, 8] },
  { id: 'lux', name: 'Luxury / premium', rates: [26, 18, 15, 13, 12, 11, 10, 9] },
  { id: 'truck', name: 'Pickup / SUV', rates: [15, 11, 10, 9, 9, 8, 8, 7] },
  { id: 'ev', name: 'Electric (fast early drop)', rates: [28, 18, 14, 12, 11, 10, 9, 8] },
  { id: 'sport', name: 'Sports / enthusiast', rates: [18, 12, 9, 7, 6, 5, 4, 3] },
]

export const CONDITION: [string, number][] = [['Excellent', 5], ['Good', 0], ['Fair', -8], ['Poor', -18]]

export const rateAt = (rates: number[], age: number) => (rates.length ? rates[Math.min(rates.length, Math.max(1, age)) - 1] : 0)

/** Value multiplier for mileage above/below expected: −k% per 1000 extra units, clamped to [0.55, 1.15]. */
export function mileageFactor(totalMiles: number, expectedMiles: number, kPer1000: number): number {
  return Math.min(1.15, Math.max(0.55, 1 - (kPer1000 / 100) * ((totalMiles - expectedMiles) / 1000)))
}

export interface Input {
  price: number // price paid
  ageAtPurchase: number // whole years (0 = new)
  odoAtPurchase: number
  years: number // ownership horizon
  perYear: number // distance driven per year
  expectedPerYear: number // "normal" distance per year
  kPer1000: number // % value change per 1000 units above/below normal
  rates: number[]
  condition: number // % adjustment
}

export interface Row { year: number; age: number; rate: number; base: number; odo: number; factor: number; value: number; lost: number; lostPct: number; perDistance: number }

export function schedule(i: Input): Row[] {
  const rows: Row[] = []
  let base = i.price
  // factor at purchase so the price paid already reflects the car's mileage/condition at that time
  const f0 = mileageFactor(i.odoAtPurchase, i.expectedPerYear * i.ageAtPurchase, i.kPer1000)
  for (let y = 0; y <= i.years; y++) {
    const age = i.ageAtPurchase + y
    const rate = y === 0 ? 0 : rateAt(i.rates, age)
    if (y > 0) base *= 1 - rate / 100
    const odo = i.odoAtPurchase + i.perYear * y
    const factor = mileageFactor(odo, i.expectedPerYear * age, i.kPer1000) / f0
    const value = Math.max(0, base * factor * (y === 0 ? 1 : 1 + i.condition / 100))
    const lost = i.price - value
    rows.push({ year: y, age, rate, base, odo, factor, value, lost, lostPct: i.price ? lost / i.price : 0, perDistance: y > 0 && i.perYear > 0 ? lost / (i.perYear * y) : 0 })
  }
  return rows
}

/** Age at which the base curve first falls below `frac` of the price (or null within 30 years). */
export function halfLife(price: number, startAge: number, rates: number[], frac = 0.5): number | null {
  let v = price
  for (let y = 1; y <= 30; y++) {
    v *= 1 - rateAt(rates, startAge + y) / 100
    if (v < price * frac) return y
  }
  return null
}
