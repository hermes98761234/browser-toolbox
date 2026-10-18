// Pure logic for the pill organizer & refill tracker (medication-schedule tool).

export const SLOTS = ['am', 'noon', 'pm', 'bed'] as const
export type Slot = (typeof SLOTS)[number]

export interface Med {
  id: string
  name: string
  strength: string
  /** Pills per slot on a scheduled day. */
  perSlot: Record<Slot, number>
  /** Scheduled weekdays, index 0 = Monday. */
  days: boolean[]
  /** Pills on hand as counted on `countDate`. */
  onHand: number
  countDate: string
  color: string
}

/** taken[date][`${medId}:${slot}`] = true */
export type TakenLog = Record<string, Record<string, boolean>>

const DAY = 86400000
export const isoToUtc = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return Date.UTC(y, (m || 1) - 1, d || 1)
}
export const utcToIso = (t: number) => new Date(t).toISOString().slice(0, 10)
export const addDays = (iso: string, n: number) => utcToIso(isoToUtc(iso) + n * DAY)
export const dayDiff = (a: string, b: string) => Math.round((isoToUtc(b) - isoToUtc(a)) / DAY)
/** 0 = Monday … 6 = Sunday */
export const weekday = (iso: string) => (new Date(isoToUtc(iso)).getUTCDay() + 6) % 7
export const mondayOf = (iso: string) => addDays(iso, -weekday(iso))

export function dosesOn(med: Med, iso: string): number {
  if (!med.days[weekday(iso)]) return 0
  return SLOTS.reduce((a, s) => a + Math.max(0, med.perSlot[s] || 0), 0)
}

/** Average pills per day over a week. */
export function avgDaily(med: Med): number {
  let t = 0
  for (let i = 0; i < 7; i++) if (med.days[i]) t += SLOTS.reduce((a, s) => a + Math.max(0, med.perSlot[s] || 0), 0)
  return t / 7
}

export interface Supply {
  /** Pills left at the start of `today` (before today's doses). */
  left: number
  /** First date on which a scheduled dose can't be covered (null if not within horizon). */
  runOut: string | null
  daysLeft: number | null
  /** runOut minus the lead time. */
  refillBy: string | null
}

/**
 * Projects the pill count: starts from `onHand` at the beginning of `countDate`, subtracts scheduled
 * doses for every day before `today`, then walks forward to find the first day that can't be fully covered.
 */
export function supply(med: Med, today: string, leadDays: number, horizon = 730): Supply {
  let left = Math.max(0, med.onHand)
  const start = med.countDate || today
  for (let d = start; dayDiff(d, today) > 0; d = addDays(d, 1)) left -= dosesOn(med, d)
  left = Math.max(0, left)
  if (avgDaily(med) <= 0) return { left, runOut: null, daysLeft: null, refillBy: null }
  let rem = left
  for (let i = 0; i < horizon; i++) {
    const d = addDays(today, i)
    const need = dosesOn(med, d)
    if (need > rem) return { left, runOut: d, daysLeft: i, refillBy: addDays(d, -leadDays) }
    rem -= need
  }
  return { left, runOut: null, daysLeft: null, refillBy: null }
}

export const doseKey = (medId: string, slot: Slot) => `${medId}:${slot}`

/** Scheduled dose keys on a date. */
export function scheduled(meds: Med[], iso: string): string[] {
  const out: string[] = []
  for (const m of meds) if (m.days[weekday(iso)]) for (const s of SLOTS) if ((m.perSlot[s] || 0) > 0) out.push(doseKey(m.id, s))
  return out
}

/** Fraction of scheduled doses taken on a date (null when nothing is scheduled). */
export function dayAdherence(meds: Med[], taken: TakenLog, iso: string): number | null {
  const keys = scheduled(meds, iso)
  if (!keys.length) return null
  const t = taken[iso] ?? {}
  return keys.filter((k) => t[k]).length / keys.length
}

/**
 * Consecutive fully-taken days ending today (if today is complete) or yesterday.
 * Days with nothing scheduled don't break the streak.
 */
export function streak(meds: Med[], taken: TakenLog, today: string, maxBack = 3650): number {
  let d = dayAdherence(meds, taken, today) === 1 ? today : addDays(today, -1)
  let n = 0
  for (let i = 0; i < maxBack; i++, d = addDays(d, -1)) {
    const a = dayAdherence(meds, taken, d)
    if (a === null) continue
    if (a < 1) break
    n++
  }
  return n
}

/** Overall adherence over the last `days` days (incl. today), ignoring days before the first log entry. */
export function adherence(meds: Med[], taken: TakenLog, today: string, days: number): number | null {
  let tot = 0, got = 0
  const first = Object.keys(taken).filter((k) => Object.values(taken[k]).some(Boolean)).sort()[0]
  if (!first) return null
  for (let i = 0; i < days; i++) {
    const d = addDays(today, -i)
    if (d < first) break
    const keys = scheduled(meds, d)
    tot += keys.length
    got += keys.filter((k) => taken[d]?.[k]).length
  }
  return tot ? got / tot : null
}
