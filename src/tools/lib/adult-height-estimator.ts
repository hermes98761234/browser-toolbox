// Adult height estimates: Tanner mid-parental target height and the percent-of-adult-height method.

export type Sex = 'boy' | 'girl'

/** Mid-parental (Tanner) target: average of parents' heights ±6.5 cm for sex (cm). */
export function midParental(father: number, mother: number, sex: Sex): number {
  return (father + mother + (sex === 'boy' ? 13 : -13)) / 2
}

/** Tanner's target range: roughly ±8.5 cm covers ~95% of children of those parents. */
export const TARGET_RANGE = 8.5

// Approximate average % of adult height reached by age (years), from classic growth-study tables.
export const PCT: Record<Sex, [number, number][]> = {
  boy: [[0, 28.6], [1, 42.2], [2, 49.5], [3, 53.8], [4, 58.0], [5, 61.8], [6, 65.2], [7, 69.0], [8, 72.0], [9, 75.0], [10, 78.0], [11, 81.1], [12, 84.2], [13, 87.3], [14, 91.5], [15, 96.1], [16, 98.3], [17, 99.3], [18, 99.8], [19, 100], [21, 100]],
  girl: [[0, 30.6], [1, 44.7], [2, 52.8], [3, 57.0], [4, 61.8], [5, 66.2], [6, 70.3], [7, 74.0], [8, 77.5], [9, 80.7], [10, 84.4], [11, 88.4], [12, 92.9], [13, 96.5], [14, 98.3], [15, 99.1], [16, 99.6], [17, 100], [21, 100]],
}

export function pctAt(age: number, sex: Sex): number {
  const t = PCT[sex]
  if (age <= t[0][0]) return t[0][1]
  for (let i = 1; i < t.length; i++) {
    if (age <= t[i][0]) {
      const [a0, p0] = t[i - 1], [a1, p1] = t[i]
      return p0 + ((p1 - p0) * (age - a0)) / (a1 - a0)
    }
  }
  return 100
}

/** Adult height predicted from a child's current height and age. */
export function fromCurrent(height: number, age: number, sex: Sex): number {
  return height / (pctAt(age, sex) / 100)
}

export const cmToFtIn = (cm: number): [number, number] => {
  const inches = cm / 2.54
  let ft = Math.floor(inches / 12)
  let i = Math.round((inches - ft * 12) * 10) / 10
  if (i >= 12) { ft += 1; i -= 12 }
  return [ft, i]
}
export const ftInToCm = (ft: number, inch: number) => (ft * 12 + inch) * 2.54
