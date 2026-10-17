// Hiring pipeline maths: stage moves with history, funnel conversion, time-in-stage.

export const STAGES = ['Applied', 'Screen', 'Interview', 'Offer', 'Hired', 'Rejected'] as const
export type Stage = (typeof STAGES)[number]
/** Stages in pipeline order (Rejected is an exit, not a step). */
export const FLOW: Stage[] = ['Applied', 'Screen', 'Interview', 'Offer', 'Hired']

export interface Move { stage: Stage; at: string } // ISO date (yyyy-mm-dd)
export interface FileRef { id: string; name: string; size: number; type: string }
export interface Candidate {
  id: string; name: string; role: string; email: string; phone: string; source: string
  rating: number; tags: string[]; notes: string; stage: Stage; history: Move[]; files: FileRef[]
}

export function moveTo(c: Candidate, stage: Stage, at: string): Candidate {
  if (c.stage === stage) return c
  return { ...c, stage, history: [...c.history, { stage, at }] }
}

const DAY = 86400000
export const daysBetween = (a: string, b: string) => Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / DAY))

/** Days the candidate has been in their current stage. */
export function daysInStage(c: Candidate, today: string): number {
  const last = c.history[c.history.length - 1]
  return last ? daysBetween(last.at, today) : 0
}

/** Highest pipeline step ever reached (index into FLOW). */
export function reached(c: Candidate): number {
  let best = 0
  for (const m of c.history) best = Math.max(best, FLOW.indexOf(m.stage))
  return best
}

/** Count of candidates who reached each FLOW stage and the step conversion rate. */
export function funnel(cs: Candidate[]): { stage: Stage; count: number; rate: number }[] {
  const counts = FLOW.map((_, i) => cs.filter((c) => reached(c) >= i).length)
  return FLOW.map((stage, i) => ({ stage, count: counts[i], rate: i === 0 ? 1 : counts[i - 1] ? counts[i] / counts[i - 1] : 0 }))
}

/** Average days spent in each stage, over completed stays (left the stage) and current stays up to today. */
export function avgStageDays(cs: Candidate[], today: string): Record<string, number> {
  const sum: Record<string, number> = {}, n: Record<string, number> = {}
  for (const c of cs)
    c.history.forEach((m, i) => {
      if (m.stage === 'Hired' || m.stage === 'Rejected') return
      const end = c.history[i + 1]?.at ?? today
      sum[m.stage] = (sum[m.stage] ?? 0) + daysBetween(m.at, end)
      n[m.stage] = (n[m.stage] ?? 0) + 1
    })
  const out: Record<string, number> = {}
  for (const k of Object.keys(sum)) out[k] = sum[k] / n[k]
  return out
}

/** Average days from application to hire. */
export function timeToHire(cs: Candidate[]): number {
  const t = cs.filter((c) => c.stage === 'Hired' && c.history.length).map((c) => daysBetween(c.history[0].at, c.history[c.history.length - 1].at))
  return t.length ? t.reduce((a, b) => a + b, 0) / t.length : NaN
}

export function matches(c: Candidate, q: string): boolean {
  const s = q.trim().toLowerCase()
  if (!s) return true
  return [c.name, c.role, c.email, c.source, c.notes, ...c.tags].some((x) => x.toLowerCase().includes(s))
}
