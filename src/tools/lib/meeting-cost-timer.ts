export interface Group { id: string; role: string; count: number; rate: number }
export type RateMode = 'hourly' | 'annual'

/** Working hours per year used to turn salaries into hourly rates (40 h × 52 weeks). */
export const HOURS_PER_YEAR = 2080

export const hourly = (rate: number, mode: RateMode) => (mode === 'annual' ? rate / HOURS_PER_YEAR : rate)

/** Total cost per hour of everyone in the room, including an overhead multiplier (benefits, office…). */
export function costPerHour(groups: Group[], mode: RateMode, overhead: number): number {
  return groups.reduce((a, g) => a + Math.max(0, g.count) * Math.max(0, hourly(g.rate, mode)), 0) * Math.max(0, overhead)
}

export const people = (groups: Group[]) => groups.reduce((a, g) => a + Math.max(0, g.count), 0)

/** Cost of a meeting lasting `ms` milliseconds. */
export const costAt = (perHour: number, ms: number) => (perHour * ms) / 3_600_000

export const hms = (ms: number) => {
  const t = Math.floor(Math.max(0, ms) / 1000)
  const h = Math.floor(t / 3600)
  const m = Math.floor((t % 3600) / 60)
  const s = t % 60
  return `${h ? h + ':' : ''}${String(m).padStart(h ? 2 : 1, '0')}:${String(s).padStart(2, '0')}`
}

export const THINGS: [string, string, number][] = [
  ['☕', 'coffees', 4.5],
  ['🍕', 'pizzas', 20],
  ['📚', 'books', 25],
  ['🎧', 'pairs of headphones', 150],
  ['📱', 'phones', 800],
  ['💻', 'laptops', 1500],
]

/** The most relatable comparison: the priciest item the cost buys at least one of. */
export function comparison(cost: number): { icon: string; label: string; n: number } {
  let best = THINGS[0]
  for (const t of THINGS) if (cost >= t[2]) best = t
  return { icon: best[0], label: best[1], n: cost / best[2] }
}
