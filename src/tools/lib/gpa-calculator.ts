// GPA scales and calculations.

export interface Scale { id: string; name: string; max: number; grades: [string, number][] }

export const SCALES: Scale[] = [
  { id: 'us4', name: 'US 4.0 (with +/−)', max: 4, grades: [['A+', 4], ['A', 4], ['A−', 3.7], ['B+', 3.3], ['B', 3], ['B−', 2.7], ['C+', 2.3], ['C', 2], ['C−', 1.7], ['D+', 1.3], ['D', 1], ['D−', 0.7], ['F', 0]] },
  { id: 'us43', name: 'US 4.33 (A+ = 4.33)', max: 4.33, grades: [['A+', 4.33], ['A', 4], ['A−', 3.67], ['B+', 3.33], ['B', 3], ['B−', 2.67], ['C+', 2.33], ['C', 2], ['C−', 1.67], ['D+', 1.33], ['D', 1], ['D−', 0.67], ['F', 0]] },
  { id: 'simple', name: 'US 4.0 (letters only)', max: 4, grades: [['A', 4], ['B', 3], ['C', 2], ['D', 1], ['F', 0]] },
  { id: 'in10', name: '10-point (India CGPA)', max: 10, grades: [['O', 10], ['A+', 9], ['A', 8], ['B+', 7], ['B', 6], ['C', 5], ['P', 4], ['F', 0]] },
  { id: 'ects', name: 'ECTS (A–F → 4.0)', max: 4, grades: [['A', 4], ['B', 3.5], ['C', 3], ['D', 2.5], ['E', 2], ['FX', 0], ['F', 0]] },
]

export type Level = 'regular' | 'honors' | 'ap'
export const LEVEL_BONUS: Record<Level, number> = { regular: 0, honors: 0.5, ap: 1 }

export interface Course { id: string; name: string; credits: number; grade: string; level: Level; include: boolean }

export function gradePoints(scale: Scale, grade: string) {
  return scale.grades.find((g) => g[0] === grade)?.[1]
}

/** Credit-weighted GPA; failing grades get no level bonus. Pass/fail (excluded) courses are skipped. */
export function gpa(courses: Course[], scale: Scale, weighted: boolean) {
  let pts = 0, cr = 0
  for (const c of courses) {
    if (!c.include || !(c.credits > 0)) continue
    const g = gradePoints(scale, c.grade)
    if (g === undefined) continue
    const bonus = weighted && g > 0 ? LEVEL_BONUS[c.level] : 0
    pts += (g + bonus) * c.credits
    cr += c.credits
  }
  return { gpa: cr ? pts / cr : NaN, points: pts, credits: cr }
}

/** Combines prior cumulative GPA/credits with new points/credits. */
export function cumulative(priorGpa: number, priorCredits: number, points: number, credits: number) {
  const tc = priorCredits + credits
  return tc ? (priorGpa * priorCredits + points) / tc : NaN
}

/** GPA needed on `remaining` credits to reach `target` overall. */
export function requiredGpa(currentGpa: number, currentCredits: number, target: number, remaining: number) {
  if (!(remaining > 0)) return NaN
  return (target * (currentCredits + remaining) - currentGpa * currentCredits) / remaining
}

/** Approximate US 4.0 GPA from a percentage (common 90/80/70/60 cut-offs with +/−). */
export function percentToLetter(p: number) {
  const cuts: [number, string][] = [[97, 'A+'], [93, 'A'], [90, 'A−'], [87, 'B+'], [83, 'B'], [80, 'B−'], [77, 'C+'], [73, 'C'], [70, 'C−'], [67, 'D+'], [63, 'D'], [60, 'D−']]
  return cuts.find(([c]) => p >= c)?.[1] ?? 'F'
}
