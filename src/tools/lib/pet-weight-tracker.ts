// Pet weight math: trend (least-squares slope), change over a window, breed reference ranges.

export interface WeighIn { date: string; kg: number }

/** Adult weight ranges in kg (typical breed-standard / registry figures; individuals vary). */
export const BREEDS: Record<string, [string, number, number][]> = {
  Dog: [
    ['Labrador Retriever', 25, 36], ['Golden Retriever', 25, 34], ['German Shepherd', 22, 40], ['French Bulldog', 8, 13], ['Bulldog', 18, 25],
    ['Beagle', 9, 14], ['Poodle (Standard)', 18, 32], ['Poodle (Miniature)', 4.5, 7.5], ['Poodle (Toy)', 2, 3.2], ['Dachshund', 7, 14.5],
    ['Yorkshire Terrier', 2, 3.2], ['Chihuahua', 1.5, 3], ['Boxer', 25, 32], ['Siberian Husky', 16, 27], ['Shih Tzu', 4, 7.3],
    ['Border Collie', 14, 20], ['Pembroke Welsh Corgi', 10, 14], ['Cavalier King Charles Spaniel', 5.9, 8.2], ['Australian Shepherd', 18, 29],
    ['Rottweiler', 35, 60], ['Pug', 6.3, 8.1], ['Great Dane', 50, 79], ['Pomeranian', 1.4, 3.2], ['Boston Terrier', 5, 11],
    ['Miniature Schnauzer', 5, 9], ['Mixed breed – small', 4, 10], ['Mixed breed – medium', 10, 25], ['Mixed breed – large', 25, 45],
  ],
  Cat: [
    ['Domestic Shorthair', 3.5, 5.5], ['Domestic Longhair', 3.5, 6], ['Maine Coon', 5.4, 8.2], ['Siamese', 2.7, 4.5], ['Persian', 3.2, 5.5],
    ['Ragdoll', 4.5, 9], ['British Shorthair', 3.2, 7.7], ['Bengal', 3.6, 6.8], ['Sphynx', 2.7, 5.5], ['Scottish Fold', 2.7, 6], ['Norwegian Forest Cat', 4, 9],
  ],
  Rabbit: [['Netherland Dwarf', 0.5, 1.1], ['Holland Lop', 0.9, 1.8], ['Mini Rex', 1.4, 2], ['Mini Lop', 2, 3], ['Flemish Giant', 6, 10]],
  'Small pet': [['Guinea pig', 0.7, 1.2], ['Ferret', 0.7, 2], ['Hamster (Syrian)', 0.1, 0.2], ['Rat', 0.25, 0.5]],
}

export const range = (species: string, breed: string): [number, number] | null => {
  const b = BREEDS[species]?.find((x) => x[0] === breed)
  return b ? [b[1], b[2]] : null
}

const day = (d: string) => Date.parse(d + 'T00:00:00Z') / 86400000

export const sorted = (w: WeighIn[]) => [...w].filter((x) => x.kg > 0 && x.date).sort((a, b) => a.date.localeCompare(b.date))

/** Least-squares slope in kg per week over weigh-ins within the last `days` days of the latest one. */
export function trendPerWeek(w: WeighIn[], days = 60): number {
  const s = sorted(w)
  if (s.length < 2) return 0
  const last = day(s[s.length - 1].date)
  const pts = s.filter((x) => last - day(x.date) <= days).map((x) => [day(x.date), x.kg] as const)
  if (pts.length < 2) return 0
  const n = pts.length
  const mx = pts.reduce((a, p) => a + p[0], 0) / n, my = pts.reduce((a, p) => a + p[1], 0) / n
  let num = 0, den = 0
  for (const [x, y] of pts) { num += (x - mx) * (y - my); den += (x - mx) ** 2 }
  return den ? (num / den) * 7 : 0
}

/** Weight change versus the latest weigh-in at least `days` days earlier (or the first). */
export function changeSince(w: WeighIn[], days: number): { kg: number; pct: number; from: WeighIn } | null {
  const s = sorted(w)
  if (s.length < 2) return null
  const last = s[s.length - 1]
  const cutoff = day(last.date) - days
  const from = [...s].reverse().find((x) => day(x.date) <= cutoff) ?? s[0]
  if (from === last) return null
  return { kg: last.kg - from.kg, pct: (last.kg - from.kg) / from.kg, from }
}

export type Status = 'under' | 'in' | 'over' | 'unknown'
/** Compares to the adult range with a 5% tolerance band. */
export function status(kg: number, r: [number, number] | null): Status {
  if (!r || !(kg > 0)) return 'unknown'
  if (kg < r[0] * 0.95) return 'under'
  if (kg > r[1] * 1.05) return 'over'
  return 'in'
}

export const KG_LB = 2.20462
