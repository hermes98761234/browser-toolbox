// Meeting cost model: loaded hourly rates per role, per-minute / per-meeting / annual cost,
// including preparation time and the focus lost to context switching.

export type Freq = 'once' | 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly'
export interface Role { id: string; name: string; salary: number }
export interface Meeting { id: string; name: string; freq: Freq; minutes: number; prep: number; attendees: Record<string, number> }
export interface Settings { mode: 'annual' | 'hourly'; hoursPerYear: number; overhead: number; switchMin: number; weeksPerYear: number }

/** Fully loaded hourly cost of one person (salary + overhead %). */
export function hourly(salary: number, s: Settings): number {
  const base = s.mode === 'annual' ? salary / Math.max(1, s.hoursPerYear) : salary
  return base * (1 + s.overhead / 100)
}

export function perYear(f: Freq, weeksPerYear = 48): number {
  return { once: 1, daily: 5 * weeksPerYear, weekly: weeksPerYear, biweekly: weeksPerYear / 2, monthly: 12, quarterly: 4 }[f]
}

export interface Cost { people: number; perMinute: number; meeting: number; prep: number; switching: number; total: number; personHours: number; annual: number; annualHours: number }

export function meetingCost(m: Meeting, roles: Role[], s: Settings): Cost {
  let people = 0, perHour = 0
  for (const r of roles) {
    const n = Math.max(0, m.attendees[r.id] ?? 0)
    people += n
    perHour += n * hourly(r.salary, s)
  }
  const perMinute = perHour / 60
  const meeting = perMinute * m.minutes
  const prep = perMinute * m.prep
  const switching = perMinute * s.switchMin
  const total = meeting + prep + switching
  const personHours = (people * (m.minutes + m.prep + s.switchMin)) / 60
  const k = perYear(m.freq, s.weeksPerYear)
  return { people, perMinute, meeting, prep, switching, total, personHours, annual: total * k, annualHours: personHours * k }
}

/** Cost after a what-if: shorter meetings, fewer attendees (removed from the most expensive role first), lower frequency. */
export function whatIf(m: Meeting, roles: Role[], s: Settings, cutPct: number, dropPeople: number): Cost {
  const att = { ...m.attendees }
  const order = [...roles].sort((a, b) => b.salary - a.salary)
  let left = dropPeople
  for (const r of order) {
    while (left > 0 && (att[r.id] ?? 0) > 1) { att[r.id]--; left-- }
  }
  return meetingCost({ ...m, minutes: Math.max(5, Math.round(m.minutes * (1 - cutPct / 100))), attendees: att }, roles, s)
}

export const THINGS: [string, number][] = [['☕ coffees', 4.5], ['🍕 pizzas', 18], ['🎧 headphones', 250], ['💻 laptops', 1600], ['🏖 week-long trips', 2500]]
