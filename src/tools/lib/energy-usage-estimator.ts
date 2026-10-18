// Appliance electricity use: active watts × duty cycle × hours, plus standby draw for the rest of the day.

export interface Appliance {
  id: string
  name: string
  cat: string
  watts: number
  /** Share of "on" time the device actually draws its rated power (fridge compressor, thermostat). */
  duty: number
  standby: number
  hours: number
  days: number
  qty: number
  /** Share of energy used in off-peak hours (time-of-use tariffs), 0..1. */
  offPeak: number
}

export interface Tariff { mode: 'flat' | 'tou'; rate: number; peak: number; offPeakRate: number; daily: number }

/** Average kWh per day for one appliance row. */
export function kwhPerDay(a: Appliance): number {
  const activeH = Math.min(24, Math.max(0, a.hours)) * (Math.min(7, Math.max(0, a.days)) / 7)
  const active = a.watts * Math.min(1, Math.max(0, a.duty)) * activeH
  const standby = a.standby * (24 - activeH)
  return (Math.max(0, a.qty) * (active + standby)) / 1000
}

export const standbyKwhPerDay = (a: Appliance) => {
  const activeH = Math.min(24, Math.max(0, a.hours)) * (Math.min(7, Math.max(0, a.days)) / 7)
  return (Math.max(0, a.qty) * a.standby * (24 - activeH)) / 1000
}

/** Blended price per kWh for the appliance. */
export function pricePerKwh(a: Appliance, t: Tariff): number {
  if (t.mode === 'flat') return t.rate
  const op = Math.min(1, Math.max(0, a.offPeak))
  return op * t.offPeakRate + (1 - op) * t.peak
}

export interface Row { a: Appliance; day: number; year: number; cost: number; standbyYear: number }

export function analyse(list: Appliance[], t: Tariff) {
  const rows: Row[] = list.map((a) => {
    const day = kwhPerDay(a)
    return { a, day, year: day * 365, cost: day * 365 * pricePerKwh(a, t), standbyYear: standbyKwhPerDay(a) * 365 }
  })
  const kwhYear = rows.reduce((s, r) => s + r.year, 0)
  const energyCost = rows.reduce((s, r) => s + r.cost, 0)
  const fixed = t.daily * 365
  return { rows, kwhYear, energyCost, fixed, totalYear: energyCost + fixed, avgPrice: kwhYear ? energyCost / kwhYear : 0 }
}

/** Running cost of one appliance for `minutes` at full rated power. */
export const runCost = (watts: number, minutes: number, price: number) => (watts / 1000) * (minutes / 60) * price
