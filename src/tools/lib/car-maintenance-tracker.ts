// Car maintenance schedule maths: when each service item is next due by distance and/or time.

export interface Item { id: string; name: string; km: number; months: number } // 0 = not used
export interface Rec { id: string; vehicle: string; date: string; odo: number; items: string[]; cost: number; shop: string; note: string; photo?: boolean }

export const SCHEDULE: Item[] = [
  { id: 'oil', name: 'Engine oil & filter', km: 10000, months: 12 },
  { id: 'rotate', name: 'Tyre rotation', km: 10000, months: 12 },
  { id: 'brakes', name: 'Brake inspection', km: 20000, months: 12 },
  { id: 'air', name: 'Engine air filter', km: 30000, months: 24 },
  { id: 'cabin', name: 'Cabin air filter', km: 20000, months: 12 },
  { id: 'bfluid', name: 'Brake fluid', km: 0, months: 24 },
  { id: 'coolant', name: 'Coolant', km: 100000, months: 60 },
  { id: 'plugs', name: 'Spark plugs', km: 60000, months: 72 },
  { id: 'atf', name: 'Transmission fluid', km: 60000, months: 60 },
  { id: 'belt', name: 'Timing belt / accessory belt', km: 100000, months: 84 },
  { id: 'battery', name: 'Battery test', km: 0, months: 12 },
  { id: 'wipers', name: 'Wiper blades', km: 0, months: 12 },
]

export type Status = 'overdue' | 'soon' | 'ok' | 'unknown'
export interface Due {
  item: Item; last?: Rec; dueOdo?: number; dueDate?: string; kmLeft?: number; daysLeft?: number
  /** Estimated date when it's due, combining distance (via km/month) and time. */
  eta?: string; status: Status
}

const DAY = 86_400_000
const addMonths = (iso: string, m: number) => {
  const d = new Date(iso + 'T00:00:00Z')
  const day = d.getUTCDate()
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() + m)
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  d.setUTCDate(Math.min(day, last))
  return d.toISOString().slice(0, 10)
}
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DAY)

/**
 * Next due point for one item. Without a record the item is assumed due from 0 km / `since` (purchase date).
 * Due soon = within `soonKm` or `soonDays`.
 */
export function dueFor(item: Item, recs: Rec[], odo: number, today: string, kmPerMonth: number, since: string, soonKm = 1000, soonDays = 30): Due {
  const last = recs.filter((r) => r.items.includes(item.id)).sort((a, b) => b.date.localeCompare(a.date) || b.odo - a.odo)[0]
  if (!item.km && !item.months) return { item, last, status: 'unknown' }
  const baseOdo = last?.odo ?? 0
  const baseDate = last?.date ?? since
  const out: Due = { item, last, status: 'ok' }
  const etas: string[] = []
  if (item.km > 0) {
    out.dueOdo = baseOdo + item.km
    out.kmLeft = out.dueOdo - odo
    if (kmPerMonth > 0) etas.push(new Date(Date.parse(today) + (out.kmLeft / kmPerMonth) * 30.4375 * DAY).toISOString().slice(0, 10))
  }
  if (item.months > 0 && baseDate) {
    out.dueDate = addMonths(baseDate, item.months)
    out.daysLeft = daysBetween(today, out.dueDate)
    etas.push(out.dueDate)
  }
  out.eta = etas.sort()[0]
  const overdue = (out.kmLeft !== undefined && out.kmLeft <= 0) || (out.daysLeft !== undefined && out.daysLeft <= 0)
  const soon = (out.kmLeft !== undefined && out.kmLeft <= soonKm) || (out.daysLeft !== undefined && out.daysLeft <= soonDays)
  out.status = overdue ? 'overdue' : soon ? 'soon' : 'ok'
  return out
}

/** Average distance per month from the odometer readings in records (+ current reading today). */
export function kmPerMonth(recs: Rec[], odo: number, today: string): number {
  const pts = [...recs.map((r) => [Date.parse(r.date), r.odo] as const), [Date.parse(today), odo] as const].sort((a, b) => a[0] - b[0])
  if (pts.length < 2) return 0
  const [t0, o0] = pts[0], [t1, o1] = pts[pts.length - 1]
  const months = (t1 - t0) / DAY / 30.4375
  return months > 0.5 ? Math.max(0, (o1 - o0) / months) : 0
}
