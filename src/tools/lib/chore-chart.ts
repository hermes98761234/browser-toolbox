// Chore rotation and points bookkeeping. Dates are local calendar days as YYYY-MM-DD.

export interface Member { id: string; name: string; emoji: string; color: string }
export interface Chore {
  id: string
  name: string
  emoji: string
  points: number
  /** Weekdays the chore is due, 0 = Monday … 6 = Sunday. */
  days: number[]
  /** Members sharing the chore (one = fixed assignment). */
  who: string[]
  rotate: 'day' | 'week'
}
export interface Reward { id: string; name: string; cost: number }
export interface Redemption { at: string; member: string; reward: string; cost: number }

const DAY = 86400000
/** Day number of an ISO date (UTC-based, so DST never matters). */
export const dayNum = (iso: string) => Math.round(Date.parse(iso + 'T00:00:00Z') / DAY)
export const isoOf = (n: number) => new Date(n * DAY).toISOString().slice(0, 10)
/** 0 = Monday … 6 = Sunday. */
export const weekday = (iso: string) => (dayNum(iso) + 3) % 7
export const mondayOf = (iso: string) => isoOf(dayNum(iso) - weekday(iso))
export const weekNum = (iso: string) => Math.floor((dayNum(iso) + 3) / 7)
export const addDays = (iso: string, n: number) => isoOf(dayNum(iso) + n)

/** Member responsible for `chore` on `date` (null if not due that day). */
export function assignee(c: Chore, date: string): string | null {
  const wd = weekday(date)
  if (!c.days.includes(wd) || !c.who.length) return null
  if (c.who.length === 1) return c.who[0]
  const days = [...c.days].sort((a, b) => a - b)
  const idx = c.rotate === 'week' ? weekNum(date) : weekNum(date) * days.length + days.indexOf(wd)
  return c.who[((idx % c.who.length) + c.who.length) % c.who.length]
}

export const key = (choreId: string, date: string) => `${choreId}|${date}`

/** Points earned per member from completions (`done` maps chore|date → member id), optionally in [from, to]. */
export function earned(chores: Chore[], done: Record<string, string>, from?: string, to?: string): Record<string, number> {
  const pts = new Map(chores.map((c) => [c.id, c.points]))
  const out: Record<string, number> = {}
  for (const [k, m] of Object.entries(done)) {
    const [cid, date] = k.split('|')
    if ((from && date < from) || (to && date > to)) continue
    out[m] = (out[m] ?? 0) + (pts.get(cid) ?? 0)
  }
  return out
}

export function balance(member: string, chores: Chore[], done: Record<string, string>, redeemed: Redemption[]): number {
  return (earned(chores, done)[member] ?? 0) - redeemed.filter((r) => r.member === member).reduce((a, r) => a + r.cost, 0)
}
