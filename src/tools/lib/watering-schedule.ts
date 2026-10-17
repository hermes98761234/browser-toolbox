// Watering schedule simulation: plant interval × season × heat, outdoor rain counts as watering.

export interface Profile { id: string; name: string; days: number; litres: number; where: 'indoor' | 'outdoor'; tip: string }

export const PROFILES: Profile[] = [
  { id: 'succ', name: 'Succulent / cactus', days: 14, litres: 0.2, where: 'indoor', tip: 'Soak, then let the soil dry out completely.' },
  { id: 'snake', name: 'Snake plant / ZZ', days: 14, litres: 0.3, where: 'indoor', tip: 'Rot is the main killer — err on dry.' },
  { id: 'pothos', name: 'Pothos / philodendron', days: 7, litres: 0.3, where: 'indoor', tip: 'Water when the top 2–3 cm are dry.' },
  { id: 'monstera', name: 'Monstera', days: 7, litres: 0.5, where: 'indoor', tip: 'Water until it drains, empty the saucer.' },
  { id: 'fig', name: 'Fiddle-leaf fig', days: 7, litres: 0.7, where: 'indoor', tip: 'Keeps a steady routine; dislikes moving.' },
  { id: 'lily', name: 'Peace lily', days: 5, litres: 0.4, where: 'indoor', tip: 'Droops when thirsty and recovers fast.' },
  { id: 'fern', name: 'Fern', days: 3, litres: 0.3, where: 'indoor', tip: 'Keep evenly moist; likes humidity.' },
  { id: 'orchid', name: 'Orchid (bark)', days: 7, litres: 0.2, where: 'indoor', tip: 'Soak 10 min, drain fully.' },
  { id: 'herbs', name: 'Herbs in pots', days: 2, litres: 0.3, where: 'outdoor', tip: 'Pots dry fast in sun and wind.' },
  { id: 'citrus', name: 'Citrus in a pot', days: 4, litres: 1.5, where: 'outdoor', tip: 'Deep water, let the top dry between.' },
  { id: 'tomato', name: 'Tomatoes', days: 2, litres: 3, where: 'outdoor', tip: 'Even moisture prevents blossom-end rot.' },
  { id: 'veg', name: 'Vegetable bed (per m²)', days: 3, litres: 10, where: 'outdoor', tip: 'Water the soil, not the leaves, in the morning.' },
  { id: 'roses', name: 'Roses / shrubs', days: 5, litres: 6, where: 'outdoor', tip: 'Deep, infrequent watering builds roots.' },
  { id: 'lawn', name: 'Lawn (per m²)', days: 4, litres: 12, where: 'outdoor', tip: '~25 mm a week incl. rain; water early.' },
]

export const SEASON: Record<string, number> = { Spring: 1.15, Summer: 1, Autumn: 1.35, Winter: 1.8 }

export interface Day { date: string; rain: number; tmax: number }

export const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
export const diffDays = (a: string, b: string) => Math.round((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 864e5)

export interface Opts { season: string; rainCounts: number; hot: number }
export interface Event { date: string; kind: 'water' | 'rain' | 'skip'; note?: string }

/** Effective interval (days) for one day's conditions. */
export function interval(p: Pick<Profile, 'days' | 'where'>, factor: number, o: Opts, day?: Day) {
  let d = p.days * factor * (SEASON[o.season] ?? 1)
  if (p.where === 'outdoor' && day && day.tmax >= o.hot) d *= 0.7
  return Math.max(1, d)
}

/**
 * Simulates from `last` (last watering) up to `today + horizon`: rain ≥ `rainCounts` mm on an outdoor plant
 * counts as a watering; when a watering falls on a day with that much rain forecast it is skipped.
 */
export function simulate(p: Pick<Profile, 'days' | 'where'>, factor: number, last: string, today: string, horizon: number, weather: Day[], o: Opts): Event[] {
  const w = new Map(weather.map((d) => [d.date, d]))
  const ev: Event[] = []
  let prev = last
  const end = addDays(today, horizon)
  let overdue = true
  for (let d = addDays(last, 1); d <= end; d = addDays(d, 1)) {
    const day = w.get(d)
    const rained = p.where === 'outdoor' && day !== undefined && day.rain >= o.rainCounts
    const need = diffDays(d, prev) >= Math.round(interval(p, factor, o, day))
    if (rained) {
      if (need || d >= today) ev.push({ date: d, kind: need ? 'skip' : 'rain', note: `${day!.rain.toFixed(1)} mm rain` })
      prev = d
      continue
    }
    if (d < today) continue
    if (overdue && diffDays(today, prev) >= Math.round(interval(p, factor, o, w.get(today)))) {
      ev.push({ date: today, kind: 'water', note: diffDays(today, prev) > Math.round(interval(p, factor, o, w.get(today))) ? 'overdue' : undefined })
      prev = today
      overdue = false
      if (d === today) continue
    }
    overdue = false
    if (diffDays(d, prev) >= Math.round(interval(p, factor, o, day))) {
      ev.push({ date: d, kind: 'water', note: day && day.tmax >= o.hot && p.where === 'outdoor' ? `hot ${Math.round(day.tmax)}°` : undefined })
      prev = d
    }
  }
  return ev
}

/** Deterministic demo weather around `today`: 7 past + 8 forecast days. */
export function demoWeather(today: string): Day[] {
  const rain = [0, 0, 12.4, 3.1, 0, 0, 0, 0, 0, 0, 7.8, 1.2, 0, 0, 0]
  const tmax = [24, 26, 19, 21, 25, 28, 29, 31, 32, 27, 20, 22, 25, 27, 29]
  return rain.map((r, i) => ({ date: addDays(today, i - 7), rain: r, tmax: tmax[i] }))
}
