// Gestation / incubation periods for farm and domestic animals, date maths (UTC, ISO dates) and ICS export.

export interface Species { id: string; name: string; days: number; min: number; max: number; check: number; checkLabel: string; prep: number; young: string; egg?: boolean }

/** Typical lengths in days (breed and litter size shift these a few days). */
export const SPECIES: Species[] = [
  { id: 'cattle', name: 'Cattle (cow)', days: 283, min: 279, max: 290, check: 35, checkLabel: 'Ultrasound pregnancy check', prep: 60, young: 'calf' },
  { id: 'buffalo', name: 'Water buffalo', days: 310, min: 300, max: 320, check: 40, checkLabel: 'Pregnancy check', prep: 60, young: 'calf' },
  { id: 'horse', name: 'Horse (mare)', days: 340, min: 320, max: 370, check: 16, checkLabel: 'Ultrasound (twins check)', prep: 30, young: 'foal' },
  { id: 'donkey', name: 'Donkey (jenny)', days: 365, min: 350, max: 380, check: 18, checkLabel: 'Ultrasound check', prep: 30, young: 'foal' },
  { id: 'sheep', name: 'Sheep (ewe)', days: 147, min: 142, max: 152, check: 45, checkLabel: 'Scan for pregnancy / litter size', prep: 21, young: 'lamb' },
  { id: 'goat', name: 'Goat (doe)', days: 150, min: 145, max: 155, check: 45, checkLabel: 'Ultrasound check', prep: 21, young: 'kid' },
  { id: 'pig', name: 'Pig (sow / gilt)', days: 114, min: 111, max: 117, check: 28, checkLabel: 'Pregnancy check (ultrasound)', prep: 7, young: 'piglets' },
  { id: 'alpaca', name: 'Alpaca', days: 345, min: 335, max: 360, check: 21, checkLabel: 'Spit-off / ultrasound', prep: 30, young: 'cria' },
  { id: 'llama', name: 'Llama', days: 350, min: 330, max: 370, check: 21, checkLabel: 'Spit-off / ultrasound', prep: 30, young: 'cria' },
  { id: 'deer', name: 'Red deer (hind)', days: 233, min: 225, max: 240, check: 40, checkLabel: 'Pregnancy scan', prep: 21, young: 'calf' },
  { id: 'rabbit', name: 'Rabbit (doe)', days: 31, min: 28, max: 35, check: 12, checkLabel: 'Palpation', prep: 3, young: 'kits' },
  { id: 'guinea', name: 'Guinea pig', days: 68, min: 59, max: 72, check: 21, checkLabel: 'Palpation', prep: 7, young: 'pups' },
  { id: 'dog', name: 'Dog (bitch)', days: 63, min: 58, max: 68, check: 28, checkLabel: 'Ultrasound / palpation', prep: 7, young: 'puppies' },
  { id: 'cat', name: 'Cat (queen)', days: 65, min: 63, max: 67, check: 21, checkLabel: 'Ultrasound / palpation', prep: 7, young: 'kittens' },
  { id: 'chicken', name: 'Chicken eggs (incubation)', days: 21, min: 20, max: 22, check: 7, checkLabel: 'Candle eggs', prep: 3, young: 'chicks', egg: true },
  { id: 'duck', name: 'Duck eggs (incubation)', days: 28, min: 27, max: 29, check: 7, checkLabel: 'Candle eggs', prep: 3, young: 'ducklings', egg: true },
  { id: 'muscovy', name: 'Muscovy duck eggs', days: 35, min: 33, max: 37, check: 8, checkLabel: 'Candle eggs', prep: 3, young: 'ducklings', egg: true },
  { id: 'goose', name: 'Goose eggs (incubation)', days: 30, min: 28, max: 32, check: 8, checkLabel: 'Candle eggs', prep: 3, young: 'goslings', egg: true },
  { id: 'turkey', name: 'Turkey eggs (incubation)', days: 28, min: 27, max: 29, check: 8, checkLabel: 'Candle eggs', prep: 3, young: 'poults', egg: true },
  { id: 'quail', name: 'Quail eggs (incubation)', days: 17, min: 16, max: 18, check: 5, checkLabel: 'Candle eggs', prep: 3, young: 'chicks', egg: true },
]
export const speciesById = (id: string) => SPECIES.find((s) => s.id === id) ?? SPECIES[0]

const DAY = 86400000
export const parseISO = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10))
export const iso = (t: number) => new Date(t).toISOString().slice(0, 10)
export const addDays = (s: string, n: number) => iso(parseISO(s) + n * DAY)
export const diffDays = (a: string, b: string) => Math.round((parseISO(b) - parseISO(a)) / DAY)
export const validISO = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && iso(parseISO(s)) === s

export type Status = 'early' | 'mid' | 'late' | 'window' | 'overdue' | 'done'
export interface Due { due: string; early: string; late: string; check: string; prep: string; day: number; left: number; pct: number; status: Status }

/** Dates and progress for a breeding (or set-eggs) date as of `today`. */
export function due(sp: Species, bred: string, today: string, customDays?: number): Due {
  const days = customDays && customDays > 0 ? customDays : sp.days
  const shift = days - sp.days
  const d = addDays(bred, days)
  const early = addDays(bred, sp.min + shift), late = addDays(bred, sp.max + shift)
  const day = diffDays(bred, today)
  const left = diffDays(today, d)
  const pct = Math.max(0, Math.min(1, day / days))
  const status: Status = today > addDays(late, 14) ? 'done' : today > late ? 'overdue' : today >= early ? 'window' : pct < 1 / 3 ? 'early' : pct < 2 / 3 ? 'mid' : 'late'
  return { due: d, early, late, check: addDays(bred, sp.check), prep: addDays(d, -sp.prep), day, left, pct, status }
}

/** 6×7 grid of ISO dates (Monday first) covering the month. */
export function monthGrid(year: number, month: number): string[] {
  const first = Date.UTC(year, month, 1)
  const dow = (new Date(first).getUTCDay() + 6) % 7
  return Array.from({ length: 42 }, (_, i) => iso(first + (i - dow) * DAY))
}

const icsEsc = (s: string) => s.replace(/[\\;,]/g, (m) => '\\' + m).replace(/\n/g, '\\n')
/** All-day VEVENTs (date, title, description). */
export function ics(events: { date: string; title: string; desc?: string; uid: string }[], stamp = '20260101T000000Z'): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Browser Toolbox//Gestation Calculator//EN', 'CALSCALE:GREGORIAN']
  for (const e of events) {
    lines.push('BEGIN:VEVENT', `UID:${e.uid}@browser-toolbox`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${e.date.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${addDays(e.date, 1).replace(/-/g, '')}`, `SUMMARY:${icsEsc(e.title)}`)
    if (e.desc) lines.push(`DESCRIPTION:${icsEsc(e.desc)}`)
    lines.push('END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return lines.join('\r\n') + '\r\n'
}
