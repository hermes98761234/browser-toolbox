// Weighted interview scoring: per-interviewer scores, panel aggregate, disagreement and recommendation.

export interface Criterion { id: string; name: string; weight: number }
/** ratings[interviewerId][criterionId] = 1..scale (missing = not rated) */
export type Ratings = Record<string, Record<string, number | undefined>>

/** Weighted score 0..1 for one interviewer; weights renormalised over rated criteria. null if nothing rated. */
export function interviewerScore(r: Record<string, number | undefined> | undefined, criteria: Criterion[], scale: number): number | null {
  let w = 0, acc = 0
  for (const c of criteria) {
    const v = r?.[c.id]
    if (v === undefined || c.weight <= 0) continue
    w += c.weight
    acc += c.weight * ((Math.min(Math.max(v, 1), scale) - 1) / (scale - 1))
  }
  return w > 0 ? acc / w : null
}

export interface Summary {
  score: number | null // mean of interviewer scores 0..1
  spread: number // population std-dev of interviewer scores (0..1)
  perInterviewer: Record<string, number | null>
  perCriterion: Record<string, number | null> // mean rating on the 1..scale scale
  coverage: number // rated cells / total cells
  disagreement: string[] // criterion ids where ratings differ by ≥ 2 points
}

export function summarize(ratings: Ratings, criteria: Criterion[], interviewers: string[], scale: number): Summary {
  const perInterviewer: Record<string, number | null> = {}
  for (const i of interviewers) perInterviewer[i] = interviewerScore(ratings[i], criteria, scale)
  const vals = Object.values(perInterviewer).filter((v): v is number => v !== null)
  const score = vals.length ? vals.reduce((a, v) => a + v, 0) / vals.length : null
  const spread = vals.length > 1 ? Math.sqrt(vals.reduce((a, v) => a + (v - score!) ** 2, 0) / vals.length) : 0
  const perCriterion: Record<string, number | null> = {}
  const disagreement: string[] = []
  let rated = 0
  for (const c of criteria) {
    const rs = interviewers.map((i) => ratings[i]?.[c.id]).filter((v): v is number => v !== undefined)
    rated += rs.length
    perCriterion[c.id] = rs.length ? rs.reduce((a, v) => a + v, 0) / rs.length : null
    if (rs.length > 1 && Math.max(...rs) - Math.min(...rs) >= 2) disagreement.push(c.id)
  }
  return { score, spread, perInterviewer, perCriterion, coverage: criteria.length && interviewers.length ? rated / (criteria.length * interviewers.length) : 0, disagreement }
}

export function recommendation(score: number | null): { label: string; tone: 'good' | 'bad' | 'accent' | undefined } {
  if (score === null) return { label: 'Not scored', tone: undefined }
  if (score >= 0.8) return { label: 'Strong hire', tone: 'good' }
  if (score >= 0.65) return { label: 'Hire', tone: 'good' }
  if (score >= 0.5) return { label: 'Lean no', tone: 'accent' }
  return { label: 'No hire', tone: 'bad' }
}

/** Normalised weights (sum 1). */
export const shares = (criteria: Criterion[]) => {
  const t = criteria.reduce((a, c) => a + Math.max(0, c.weight), 0)
  return criteria.map((c) => (t ? Math.max(0, c.weight) / t : 0))
}
