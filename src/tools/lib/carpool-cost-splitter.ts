// Carpool cost splitting along a shared route.
// The route is a list of legs from the driver's home to a common destination; each person boards at
// a stop. Three methods: equal split per day, proportional to distance ridden, and "shared legs"
// (each leg's cost is divided among the people in the car on that leg — riders pay for their own detour).

export interface Leg { to: string; dist: number; toll: number }
export interface Person { id: string; name: string; board: number; days: boolean[]; driver?: boolean }
export type Method = 'equal' | 'distance' | 'legs'

export interface DayResult { riders: string[]; total: number; share: Record<string, number> }

/** Cost per unit distance from consumption (L/100 km or US MPG) and fuel price, plus wear per unit. */
export function costPerDist(unit: 'km' | 'mi', econ: number, econUnit: 'l100' | 'mpg', fuelPrice: number, wear: number): number {
  // fuel price is per litre for l100, per US gallon for mpg
  if (econ <= 0) return wear
  let perKm: number
  if (econUnit === 'l100') perKm = (econ / 100) * fuelPrice
  else perKm = fuelPrice / (econ * 1.609344) // $/gal ÷ km/gal
  return (unit === 'km' ? perKm : perKm * 1.609344) + wear
}

/**
 * Splits one day's costs. `roundTrip` doubles distance and tolls (same people both ways).
 * Parking is split equally among everyone in the car that day.
 */
export function splitDay(legs: Leg[], people: Person[], day: number, rate: number, roundTrip: boolean, parking: number, method: Method, includeDriver = true): DayResult {
  const driver = people.find((p) => p.driver)
  const share: Record<string, number> = {}
  if (!driver || !driver.days[day]) return { riders: [], total: 0, share }
  const inCar = people.filter((p) => p.days[day] && (p.driver || p.board < legs.length))
  const payers = inCar.filter((p) => includeDriver || !p.driver)
  for (const p of inCar) share[p.id] = 0
  const k = roundTrip ? 2 : 1
  const legCost = legs.map((l) => (Math.max(0, l.dist) * rate + Math.max(0, l.toll)) * k)
  const total = legCost.reduce((a, b) => a + b, 0) + (inCar.length > 1 || includeDriver ? parking : 0)
  if (!payers.length) return { riders: inCar.map((p) => p.id), total, share }
  // a person is on board for legs index >= board (driver boards at 0)
  const on = (p: Person, i: number) => (p.driver ? true : i >= p.board)
  if (method === 'equal') {
    for (const p of payers) share[p.id] = (total - parking) / payers.length
  } else if (method === 'distance') {
    const ridden = payers.map((p) => legs.reduce((a, l, i) => a + (on(p, i) ? Math.max(0, l.dist) : 0), 0))
    const sum = ridden.reduce((a, b) => a + b, 0) || 1
    payers.forEach((p, j) => (share[p.id] = ((total - parking) * ridden[j]) / sum))
  } else {
    legCost.forEach((c, i) => {
      let occ = payers.filter((p) => on(p, i))
      if (!occ.length) occ = payers.filter((p) => p.driver).length ? payers.filter((p) => p.driver) : payers
      for (const p of occ) share[p.id] += c / occ.length
    })
  }
  if (parking > 0) for (const p of payers) share[p.id] += parking / payers.length
  return { riders: inCar.map((p) => p.id), total, share }
}

export interface Week { days: DayResult[]; perPerson: Record<string, number>; total: number; owed: Record<string, number> }

/** Sums `nDays` days. `owed` = what each non-driver owes the driver (the driver paid everything). */
export function splitWeek(legs: Leg[], people: Person[], rate: number, roundTrip: boolean, parking: number, method: Method, includeDriver = true, nDays = 5): Week {
  const days = Array.from({ length: nDays }, (_, d) => splitDay(legs, people, d, rate, roundTrip, parking, method, includeDriver))
  const perPerson: Record<string, number> = {}
  for (const p of people) perPerson[p.id] = days.reduce((a, d) => a + (d.share[p.id] ?? 0), 0)
  const owed: Record<string, number> = {}
  for (const p of people) if (!p.driver) owed[p.id] = perPerson[p.id]
  return { days, perPerson, total: days.reduce((a, d) => a + d.total, 0), owed }
}
