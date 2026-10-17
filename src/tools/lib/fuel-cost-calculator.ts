// Fuel cost conversions. Internal units: km, litres (or kWh for electric), price per litre (or per kWh).

export type ConsUnit = 'l100' | 'kml' | 'mpgus' | 'mpguk' | 'kwh100' | 'mikwh'
export type PriceUnit = 'L' | 'galUS' | 'galUK' | 'kWh'

export const KM_PER_MI = 1.609344
export const L_PER_GALUS = 3.785411784
export const L_PER_GALUK = 4.54609

/** Converts any consumption figure to litres (or kWh) per 100 km. */
export function per100km(v: number, u: ConsUnit): number {
  if (!(v > 0)) return NaN
  switch (u) {
    case 'l100':
    case 'kwh100':
      return v
    case 'kml':
      return 100 / v
    case 'mpgus':
      return (100 * L_PER_GALUS) / (KM_PER_MI * v) // ≈ 235.215 / mpg
    case 'mpguk':
      return (100 * L_PER_GALUK) / (KM_PER_MI * v) // ≈ 282.481 / mpg
    case 'mikwh':
      return 100 / (KM_PER_MI * v)
  }
}

/** Converts litres-per-100-km back to the given unit. */
export function from100km(l100: number, u: ConsUnit): number {
  // every conversion is either identity or reciprocal with the same constant
  return u === 'l100' || u === 'kwh100' ? l100 : per100km(l100, u)
}

export function pricePerUnit(v: number, u: PriceUnit): number {
  return u === 'galUS' ? v / L_PER_GALUS : u === 'galUK' ? v / L_PER_GALUK : v
}

/** kg CO2 per litre burned (or per kWh of grid electricity, a world-average placeholder). */
export const CO2: Record<string, number> = { petrol: 2.31, diesel: 2.68, lpg: 1.51, electric: 0.4 }

export interface Trip { km: number; roundTrip: boolean; l100: number; price: number; passengers: number; extras: number }

export function tripCost(t: Trip) {
  const km = t.km * (t.roundTrip ? 2 : 1)
  const fuel = (km * t.l100) / 100
  const fuelCost = fuel * t.price
  const total = fuelCost + t.extras
  const pax = Math.max(1, Math.floor(t.passengers))
  return { km, fuel, fuelCost, total, perPassenger: total / pax, perKm: km > 0 ? total / km : NaN }
}
