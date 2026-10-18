// Fermentation tracker: salt maths for dry-salted and brined ferments, temperature-adjusted ready windows.

export type Method = 'dry' | 'brine' | 'none'
export interface Kind { id: string; name: string; icon: string; method: Method; pct: number; days: [number, number]; tip: string }

/** Typical salt levels and fermentation windows at about 20 °C (room temperature). */
export const KINDS: Kind[] = [
  { id: 'kraut', name: 'Sauerkraut', icon: '🥬', method: 'dry', pct: 2, days: [21, 42], tip: 'Pack tight until the cabbage is under its own brine; skim any surface film.' },
  { id: 'kimchi', name: 'Kimchi', icon: '🌶️', method: 'dry', pct: 2.5, days: [3, 14], tip: 'Taste daily after day 2; move to the fridge when pleasantly sour.' },
  { id: 'pickles', name: 'Cucumber pickles', icon: '🥒', method: 'brine', pct: 3.5, days: [5, 14], tip: 'Add grape, oak or bay leaves (tannins) for crunch; trim blossom ends.' },
  { id: 'veg', name: 'Brined vegetables', icon: '🥕', method: 'brine', pct: 3, days: [7, 21], tip: 'Carrots, beans, cauliflower: keep everything below the brine with a weight.' },
  { id: 'hot', name: 'Hot sauce mash', icon: '🔥', method: 'dry', pct: 3, days: [14, 60], tip: 'Use an airlock; blend with vinegar when the flavour is round.' },
  { id: 'lemons', name: 'Preserved lemons', icon: '🍋', method: 'dry', pct: 10, days: [30, 60], tip: 'Turn the jar every few days so the juice covers the fruit.' },
  { id: 'miso', name: 'Miso', icon: '🫘', method: 'dry', pct: 12, days: [180, 365], tip: 'Salt % here is of the total mash (beans + koji).' },
  { id: 'kombucha', name: 'Kombucha', icon: '🍵', method: 'none', pct: 0, days: [7, 14], tip: 'About 70–100 g sugar per litre of tea; pH should drop below 4.2 in the first days.' },
  { id: 'kefir', name: 'Water kefir', icon: '💧', method: 'none', pct: 0, days: [2, 3], tip: 'Feed grains with 50–60 g sugar per litre; second ferment for fizz.' },
  { id: 'custom', name: 'Other', icon: '🫙', method: 'dry', pct: 2, days: [7, 21], tip: '' },
]
export const kindById = (id: string) => KINDS.find((k) => k.id === id) ?? KINDS[KINDS.length - 1]

/** Salt (g) for dry salting: a percentage of the vegetable weight. */
export const drySalt = (vegG: number, pct: number) => (vegG * pct) / 100

/**
 * Brine salt (g). 'brine' mode: salt is pct of the brine (salt + water), so salt = w·p/(1−p).
 * 'equilibrium' mode: salt is pct of everything in the jar (vegetables + water).
 */
export function brineSalt(waterG: number, pct: number, mode: 'brine' | 'equilibrium' = 'brine', vegG = 0): number {
  const p = pct / 100
  if (p <= 0 || p >= 1) return 0
  return mode === 'brine' ? (waterG * p) / (1 - p) : (waterG + vegG) * p
}

/** Grams of salt per level tablespoon (approximate, by crystal type). */
export const SALTS: [string, string, number][] = [
  ['fine', 'Fine sea / table salt', 18],
  ['morton', 'Morton kosher', 14.5],
  ['diamond', 'Diamond Crystal kosher', 8.5],
  ['flaky', 'Coarse / flaky sea salt', 12],
]

/**
 * Ready window scaled by temperature with Q10 ≈ 2 (activity roughly doubles every 10 °C) around 20 °C,
 * clamped to 8–32 °C where lactic ferments behave sensibly.
 */
export function readyWindow(days: [number, number], tempC: number): [number, number] {
  const f = 2 ** ((20 - Math.max(8, Math.min(32, tempC))) / 10)
  return [Math.max(1, Math.round(days[0] * f)), Math.max(1, Math.round(days[1] * f))]
}

const DAY = 86400000
export const parseDay = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10))
export const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10)
export const addDays = (s: string, n: number) => isoDay(parseDay(s) + n * DAY)
export const daysBetween = (a: string, b: string) => Math.round((parseDay(b) - parseDay(a)) / DAY)

export type Phase = 'early' | 'ready' | 'over' | 'done'
export function phase(day: number, win: [number, number], finished: boolean): Phase {
  if (finished) return 'done'
  return day < win[0] ? 'early' : day <= win[1] ? 'ready' : 'over'
}

/** Salt safety hint for lactic vegetable ferments. */
export function saltAdvice(method: Method, pct: number): { tone: 'ok' | 'warn' | 'err'; text: string } {
  if (method === 'none') return { tone: 'ok', text: 'No salt needed for this ferment.' }
  if (pct < 1.5) return { tone: 'err', text: 'Below 1.5 % salt, spoilage organisms can outcompete lactic bacteria. Use at least 2 %.' }
  if (pct < 2) return { tone: 'warn', text: 'Low salt: fast and soft. 2–3 % is the usual safe range for vegetables.' }
  if (pct > 6 && method === 'brine') return { tone: 'warn', text: 'Very salty brine slows fermentation a lot; rinse before eating.' }
  return { tone: 'ok', text: `${pct} % is in a good range for this method.` }
}
