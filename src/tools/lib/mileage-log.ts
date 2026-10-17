// Mileage log maths: trip distance, tiered reimbursement rates, yearly/monthly summaries, odometer checks.

export type Cat = 'business' | 'medical' | 'charity' | 'personal'

export interface Trip {
  id: string
  date: string // YYYY-MM-DD
  vehicle: string
  from: string
  to: string
  purpose: string
  cat: Cat
  start: number | null // odometer start
  end: number | null // odometer end
  dist: number // used when no odometer readings
  round: boolean // double the entered distance (not used with odometer readings)
}

export interface Tier { upTo: number | null; rate: number } // rate per unit, cumulative distance threshold
export interface RateSet { id: string; name: string; unit: 'mi' | 'km'; currency: string; business: Tier[]; medical: number; charity: number; note: string }

export const RATE_SETS: RateSet[] = [
  { id: 'irs2025', name: 'US IRS 2025', unit: 'mi', currency: '$', business: [{ upTo: null, rate: 0.7 }], medical: 0.21, charity: 0.14, note: '70¢/mile business, 21¢ medical/moving, 14¢ charity (IRS standard mileage rates 2025).' },
  { id: 'hmrc', name: 'UK HMRC (cars & vans)', unit: 'mi', currency: '£', business: [{ upTo: 10000, rate: 0.45 }, { upTo: null, rate: 0.25 }], medical: 0, charity: 0.45, note: '45p per mile for the first 10,000 business miles in the tax year, 25p after.' },
  { id: 'cra2025', name: 'Canada CRA 2025', unit: 'km', currency: '$', business: [{ upTo: 5000, rate: 0.72 }, { upTo: null, rate: 0.66 }], medical: 0, charity: 0, note: '72¢/km for the first 5,000 km, 66¢/km after (provinces; territories +4¢).' },
  { id: 'custom', name: 'Custom flat rate', unit: 'km', currency: '€', business: [{ upTo: null, rate: 0.3 }], medical: 0, charity: 0, note: 'Set your own employer or country rate.' },
]

export function tripDistance(t: Trip): number {
  if (t.start !== null && t.end !== null) return Math.max(0, t.end - t.start)
  return Math.max(0, t.dist) * (t.round ? 2 : 1)
}

/** Business amount for `d` more units when `done` units were already claimed this year. */
export function tieredAmount(tiers: Tier[], done: number, d: number): number {
  let amt = 0, pos = done, left = d
  for (const t of tiers) {
    if (left <= 0) break
    const cap = t.upTo ?? Infinity
    if (pos >= cap) continue
    const take = Math.min(left, cap - pos)
    amt += take * t.rate
    pos += take
    left -= take
  }
  return amt
}

export interface Line { trip: Trip; distance: number; amount: number }

/** Amount per trip in date order (tiers accumulate over the given trips). */
export function claim(trips: Trip[], r: RateSet): Line[] {
  let biz = 0
  return [...trips]
    .sort((a, b) => a.date.localeCompare(b.date) || (a.start ?? 0) - (b.start ?? 0))
    .map((trip) => {
      const distance = tripDistance(trip)
      let amount = 0
      if (trip.cat === 'business') {
        amount = tieredAmount(r.business, biz, distance)
        biz += distance
      } else if (trip.cat === 'medical') amount = distance * r.medical
      else if (trip.cat === 'charity') amount = distance * r.charity
      return { trip, distance, amount }
    })
}

export function summary(lines: Line[]) {
  const byCat: Record<Cat, number> = { business: 0, medical: 0, charity: 0, personal: 0 }
  const months = Array.from({ length: 12 }, () => ({ distance: 0, business: 0, amount: 0 }))
  let total = 0, amount = 0
  for (const l of lines) {
    byCat[l.trip.cat] += l.distance
    total += l.distance
    amount += l.amount
    const m = Number(l.trip.date.slice(5, 7)) - 1
    if (m >= 0 && m < 12) {
      months[m].distance += l.distance
      if (l.trip.cat === 'business') months[m].business += l.distance
      months[m].amount += l.amount
    }
  }
  return { byCat, months, total, amount, businessShare: total ? byCat.business / total : 0 }
}

/** Odometer problems per trip id: reversed readings or overlap with the previous trip of the same vehicle. */
export function odometerIssues(trips: Trip[]): Record<string, string> {
  const out: Record<string, string> = {}
  const byV = new Map<string, Trip[]>()
  for (const t of trips) if (t.start !== null && t.end !== null) byV.set(t.vehicle, [...(byV.get(t.vehicle) ?? []), t])
  for (const list of byV.values()) {
    list.sort((a, b) => a.date.localeCompare(b.date) || a.start! - b.start!)
    list.forEach((t, i) => {
      if (t.end! < t.start!) out[t.id] = 'End reading is below start'
      else if (i && t.start! < list[i - 1].end!) out[t.id] = `Starts at ${t.start} but the previous trip ended at ${list[i - 1].end}`
    })
  }
  return out
}
