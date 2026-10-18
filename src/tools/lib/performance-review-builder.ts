// Performance review maths (weighted scores, gaps, goals) and the document outline for DOCX export.
import type { Block } from './meeting-minutes-template'

export interface Competency { id: string; name: string; desc: string; weight: number; self: number; mgr: number; selfNote: string; mgrNote: string }
export type GoalStatus = 'achieved' | 'on-track' | 'at-risk' | 'missed' | 'dropped'
export interface Goal { id: string; title: string; measure: string; weight: number; progress: number; status: GoalStatus; note: string }
export interface Review {
  employee: string; role: string; manager: string; department: string; from: string; to: string; kind: string
  scale: number; labels: string[]; comps: Competency[]; goals: Goal[]
  goalShare: number; strengths: string; development: string; selfSummary: string; mgrSummary: string
}

/** Weighted mean of ratings (0 = not rated, skipped). Returns NaN when nothing is rated. */
export function weighted(comps: Competency[], who: 'self' | 'mgr'): number {
  let num = 0, den = 0
  for (const c of comps) {
    const r = c[who]
    if (r > 0 && c.weight > 0) {
      num += r * c.weight
      den += c.weight
    }
  }
  return den ? num / den : NaN
}

/** Goal attainment 0–1, weighted; dropped goals are excluded, achieved counts as 100%. */
export function goalScore(goals: Goal[]): number {
  let num = 0, den = 0
  for (const g of goals) {
    if (g.status === 'dropped' || g.weight <= 0) continue
    num += (g.status === 'achieved' ? 1 : Math.max(0, Math.min(1, g.progress / 100))) * g.weight
    den += g.weight
  }
  return den ? num / den : NaN
}

/** Overall rating on the review scale: competencies blended with goals (goalShare 0–100 %). */
export function overall(r: Pick<Review, 'comps' | 'goals' | 'goalShare' | 'scale'>): number {
  const c = weighted(r.comps, 'mgr')
  const g = goalScore(r.goals)
  if (!Number.isFinite(g)) return c
  if (!Number.isFinite(c)) return 1 + g * (r.scale - 1)
  const share = Math.max(0, Math.min(100, r.goalShare)) / 100
  return c * (1 - share) + (1 + g * (r.scale - 1)) * share
}

/** Label for a (possibly fractional) rating: nearest whole point. */
export const label = (x: number, labels: string[]) => (Number.isFinite(x) && x >= 1 ? labels[Math.min(labels.length, Math.round(x)) - 1] ?? '' : 'Not rated')

/** Competencies where self and manager differ by ≥ minGap points, biggest first. */
export function gaps(comps: Competency[], minGap = 1) {
  return comps
    .filter((c) => c.self > 0 && c.mgr > 0 && Math.abs(c.self - c.mgr) >= minGap)
    .map((c) => ({ name: c.name, self: c.self, mgr: c.mgr, diff: c.self - c.mgr }))
    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
}

export const STATUS: Record<GoalStatus, string> = { achieved: 'Achieved', 'on-track': 'On track', 'at-risk': 'At risk', missed: 'Missed', dropped: 'Dropped' }

const fmt1 = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : '—')
const longDate = (d: string) => {
  const t = Date.parse(d + 'T00:00:00Z')
  return Number.isFinite(t) ? new Date(t).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }) : d
}

export function buildDoc(r: Review): Block[] {
  const B: Block[] = []
  const rt = (x: number) => (x > 0 ? `${x} – ${r.labels[x - 1] ?? ''}` : '—')
  B.push({ t: 'title', text: `${r.kind} Performance Review` })
  B.push({ t: 'subtitle', text: r.employee || 'Employee' })
  B.push({ t: 'small', text: `Review period ${longDate(r.from)} – ${longDate(r.to)}` })
  B.push({ t: 'table', head: ['Employee', 'Role', 'Department', 'Manager'], rows: [[r.employee, r.role, r.department, r.manager]], widths: [27, 27, 22, 24] })
  const ov = overall(r)
  B.push({ t: 'h', text: 'Summary' })
  B.push({ t: 'table', head: ['Measure', 'Self', 'Manager'], rows: [
    ['Competencies (weighted)', fmt1(weighted(r.comps, 'self')), fmt1(weighted(r.comps, 'mgr'))],
    ['Goal attainment', '', Number.isFinite(goalScore(r.goals)) ? `${Math.round(goalScore(r.goals) * 100)}%` : '—'],
    [`Overall rating (goals ${r.goalShare}%)`, '', `${fmt1(ov)} – ${label(ov, r.labels)}`],
  ], widths: [50, 25, 25] })
  B.push({ t: 'small', text: `Rating scale: ${r.labels.map((l, i) => `${i + 1} ${l}`).join(' · ')}` })
  B.push({ t: 'h', text: 'Competencies' })
  B.push({ t: 'table', head: ['Competency', 'Weight', 'Self', 'Manager'], rows: r.comps.map((c) => [c.name, `${c.weight}`, rt(c.self), rt(c.mgr)]), widths: [40, 12, 24, 24] })
  for (const c of r.comps) {
    if (!c.selfNote.trim() && !c.mgrNote.trim()) continue
    B.push({ t: 'p', text: `${c.name}` })
    if (c.selfNote.trim()) B.push({ t: 'bullet', text: `Self: ${c.selfNote.trim()}` })
    if (c.mgrNote.trim()) B.push({ t: 'bullet', text: `Manager: ${c.mgrNote.trim()}` })
  }
  if (r.goals.length) {
    B.push({ t: 'h', text: 'Goals' })
    B.push({ t: 'table', head: ['Goal', 'Measure', 'Weight', 'Progress', 'Status'], rows: r.goals.map((g) => [g.title, g.measure, `${g.weight}`, `${g.progress}%`, STATUS[g.status]]), widths: [32, 30, 10, 12, 16] })
    for (const g of r.goals) if (g.note.trim()) B.push({ t: 'bullet', text: `${g.title}: ${g.note.trim()}` })
  }
  const gp = gaps(r.comps)
  if (gp.length) {
    B.push({ t: 'h', text: 'Perception gaps to discuss' })
    for (const g of gp) B.push({ t: 'bullet', text: `${g.name}: self ${g.self} vs manager ${g.mgr} (${g.diff > 0 ? '+' : ''}${g.diff})` })
  }
  const para = (title: string, text: string) => {
    if (!text.trim()) return
    B.push({ t: 'h', text: title })
    for (const line of text.split(/\n+/).map((x) => x.trim()).filter(Boolean)) B.push(line.startsWith('- ') ? { t: 'bullet', text: line.slice(2) } : { t: 'p', text: line })
  }
  para('Key strengths', r.strengths)
  para('Development plan', r.development)
  para('Employee comments', r.selfSummary)
  para('Manager comments', r.mgrSummary)
  B.push({ t: 'p', text: '' })
  B.push({ t: 'table', head: ['Employee', 'Manager'], rows: [[r.employee, r.manager], ['Signature: ____________________', 'Signature: ____________________'], ['Date: ____________', 'Date: ____________']], widths: [50, 50] })
  return B
}
