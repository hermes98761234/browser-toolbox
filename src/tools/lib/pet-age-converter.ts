// Pet age → human-equivalent age. Dogs: IDEXX/AVMA size chart and the epigenetic clock
// (Wang et al. 2020: 16·ln(age) + 31). Cats: AAHA/AAFP convention (15, 24, then +4/yr).
// Horses: common equine chart. Small mammals: physiological scaling (maturity → 18, lifespan → 80).

export type Species = 'dog' | 'cat' | 'rabbit' | 'guinea' | 'hamster' | 'horse'
export type DogSize = 'small' | 'medium' | 'large' | 'giant'

// human-equivalent at ages 1..16 (IDEXX chart)
const DOG: Record<DogSize, number[]> = {
  small: [15, 24, 28, 32, 36, 40, 44, 48, 52, 56, 60, 64, 68, 72, 76, 80],
  medium: [15, 24, 28, 32, 36, 42, 47, 51, 56, 60, 65, 69, 74, 78, 83, 87],
  large: [15, 24, 28, 32, 36, 45, 50, 55, 61, 66, 72, 77, 82, 88, 93, 99],
  giant: [12, 22, 31, 38, 45, 49, 56, 64, 71, 79, 86, 93, 100, 107, 114, 121],
}
const HORSE = [6.5, 13, 18, 20.5, 24, 26.5, 29, 31.5, 34, 36.5, 39, 41.5, 44, 46.5, 49, 51.5, 54, 56.5, 59, 61.5, 64, 66.5, 69, 71.5, 74, 76.5, 79, 81.5, 84, 86.5]

/** Piecewise-linear lookup in a chart indexed by whole years 1..n (0 → 0), extrapolating the last slope. */
function chart(table: number[], age: number): number {
  if (age <= 0) return 0
  if (age <= 1) return table[0] * age
  const n = table.length
  if (age >= n) return table[n - 1] + (age - n) * (table[n - 1] - table[n - 2])
  const i = Math.floor(age), t = age - i
  return table[i - 1] + (table[i] - table[i - 1]) * t
}

export const dogChart = (age: number, size: DogSize) => chart(DOG[size], age)
/** Epigenetic (DNA methylation) clock; meaningful from about 1 year (below that it is clamped to the chart). */
export const dogLog = (age: number) => (age >= 1 ? 16 * Math.log(age) + 31 : chart(DOG.medium, age))
export const catAge = (age: number) => (age <= 1 ? 15 * age : age <= 2 ? 15 + 9 * (age - 1) : 24 + 4 * (age - 2))
export const horseAge = (age: number) => chart(HORSE, age)

/** Physiological scaling: birth → 0, maturity → 18, typical lifespan → 80, linear beyond. */
export function scaled(age: number, maturity: number, lifespan: number): number {
  if (age <= 0) return 0
  if (age <= maturity) return (age / maturity) * 18
  return 18 + ((age - maturity) / (lifespan - maturity)) * 62
}

export const SMALL: Record<'rabbit' | 'guinea' | 'hamster', { maturity: number; lifespan: number }> = {
  rabbit: { maturity: 0.5, lifespan: 10 },
  guinea: { maturity: 0.25, lifespan: 6 },
  hamster: { maturity: 0.15, lifespan: 2.5 },
}

export function humanAge(sp: Species, age: number, size: DogSize = 'medium'): number {
  switch (sp) {
    case 'dog': return dogChart(age, size)
    case 'cat': return catAge(age)
    case 'horse': return horseAge(age)
    default: return scaled(age, SMALL[sp].maturity, SMALL[sp].lifespan)
  }
}

/** Typical lifespan range in years. */
const DOG_LIFE: Record<DogSize, [number, number]> = { small: [14, 16], medium: [12, 14], large: [10, 12], giant: [8, 10] }
const LIFE: Record<Exclude<Species, 'dog'>, [number, number]> = { cat: [13, 17], rabbit: [8, 12], guinea: [5, 7], hamster: [2, 3], horse: [25, 30] }
export const lifespan = (sp: Species, size: DogSize = 'medium'): [number, number] => (sp === 'dog' ? DOG_LIFE[size] : LIFE[sp])

export interface Stage { name: string; from: number; to: number; tip: string }

/** Life stages (AAHA 2019 canine, AAFP 2021 feline; proportional for others). */
export function stages(sp: Species, size: DogSize = 'medium'): Stage[] {
  const [, hi] = lifespan(sp, size)
  if (sp === 'cat')
    return [
      { name: 'Kitten', from: 0, to: 1, tip: 'Vaccines, spay/neuter, kitten food, play and socialisation.' },
      { name: 'Young adult', from: 1, to: 7, tip: 'Annual check-ups, dental care, keep a lean weight.' },
      { name: 'Mature adult', from: 7, to: 11, tip: 'Watch weight and teeth; consider yearly bloodwork.' },
      { name: 'Senior', from: 11, to: hi + 5, tip: 'Twice-yearly vet visits: kidneys, thyroid, blood pressure, arthritis.' },
    ]
  if (sp === 'dog') {
    const pup = { small: 0.75, medium: 1, large: 1.25, giant: 1.5 }[size]
    return [
      { name: 'Puppy', from: 0, to: pup, tip: 'Vaccines, socialisation, training, puppy food until growth ends.' },
      { name: 'Young adult', from: pup, to: hi * 0.25 + pup / 2, tip: 'Exercise, training, annual check-ups, dental care.' },
      { name: 'Mature adult', from: hi * 0.25 + pup / 2, to: hi * 0.75, tip: 'Weight control and joint care; yearly bloodwork from mid-life.' },
      { name: 'Senior', from: hi * 0.75, to: hi + 4, tip: 'Twice-yearly exams, senior diet, gentle exercise, comfort.' },
    ]
  }
  const mat = sp === 'horse' ? 4 : SMALL[sp].maturity
  return [
    { name: 'Juvenile', from: 0, to: mat, tip: 'Growth, handling and socialisation, appropriate young-animal diet.' },
    { name: 'Adult', from: mat, to: hi * 0.6, tip: 'Routine health checks, teeth and weight, enrichment.' },
    { name: 'Mature', from: hi * 0.6, to: hi * 0.8, tip: 'Watch for weight loss, dental and joint issues.' },
    { name: 'Senior', from: hi * 0.8, to: hi * 1.5, tip: 'More frequent vet checks, softer food if teeth wear, warmth and comfort.' },
  ]
}

export const stageAt = (st: Stage[], age: number) => st.find((s) => age < s.to) ?? st[st.length - 1]

/** Age in years from a birth date (YYYY-MM-DD) to `today`. */
export function ageFromBirth(birth: string, today: Date = new Date()): number {
  const b = new Date(birth + 'T00:00')
  return Math.max(0, (today.getTime() - b.getTime()) / (365.2425 * 86400000))
}
