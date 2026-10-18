// Skills matrix analysis: coverage against targets, gaps, single points of failure, mentoring pairs.
import { parseCsv } from './chart-builder'

export const LEVELS = ['None', 'Aware', 'Working', 'Proficient', 'Expert'] as const
export interface Skill { id: string; name: string; group: string; target: number; need: number }
export interface Person { id: string; name: string; role: string }
export interface Matrix { skills: Skill[]; people: Person[]; r: Record<string, number>; interest: Record<string, boolean> }

export const key = (p: string, s: string) => `${p}:${s}`
export const level = (m: Matrix, p: string, s: string) => m.r[key(p, s)] ?? 0

export interface SkillStat {
  skill: Skill
  covered: number // people at or above target
  gap: number // max(0, need − covered)
  avg: number
  experts: number
  spof: boolean // exactly one person meets the target
  learners: number // interested people below target
  risk: 'gap' | 'spof' | 'ok'
}

export function skillStats(m: Matrix): SkillStat[] {
  return m.skills.map((sk) => {
    const lv = m.people.map((p) => level(m, p.id, sk.id))
    const covered = lv.filter((x) => x >= sk.target).length
    const gap = Math.max(0, sk.need - covered)
    const spof = covered === 1 && sk.need >= 1
    const learners = m.people.filter((p) => m.interest[key(p.id, sk.id)] && level(m, p.id, sk.id) < sk.target).length
    return { skill: sk, covered, gap, avg: lv.length ? lv.reduce((a, b) => a + b, 0) / lv.length : 0, experts: lv.filter((x) => x >= 4).length, spof, learners, risk: gap > 0 ? 'gap' : spof ? 'spof' : 'ok' }
  })
}

export interface PersonStat { person: Person; total: number; max: number; strengths: string[]; unique: string[] }

/** Per person: score as share of the maximum, top skills and skills only they cover (key-person risk). */
export function personStats(m: Matrix, stats = skillStats(m)): PersonStat[] {
  return m.people.map((p) => {
    const lv = m.skills.map((s) => level(m, p.id, s.id))
    const total = lv.reduce((a, b) => a + b, 0)
    const strengths = m.skills.filter((s) => level(m, p.id, s.id) >= 4).map((s) => s.name)
    const unique = stats.filter((st) => st.covered === 1 && level(m, p.id, st.skill.id) >= st.skill.target).map((st) => st.skill.name)
    return { person: p, total, max: m.skills.length * 4, strengths, unique }
  })
}

/** Mentor → learner suggestions: an expert (≥ 3 and ≥ target) paired with someone interested and below target. */
export function mentoring(m: Matrix): { skill: string; mentor: string; learner: string }[] {
  const out: { skill: string; mentor: string; learner: string }[] = []
  for (const s of m.skills) {
    const mentors = m.people.filter((p) => level(m, p.id, s.id) >= Math.max(3, s.target)).sort((a, b) => level(m, b.id, s.id) - level(m, a.id, s.id))
    const learners = m.people.filter((p) => m.interest[key(p.id, s.id)] && level(m, p.id, s.id) < s.target)
    learners.forEach((l, i) => {
      const mentor = mentors.filter((x) => x.id !== l.id)[i % Math.max(1, mentors.length)]
      if (mentor) out.push({ skill: s.name, mentor: mentor.name, learner: l.name })
    })
  }
  return out
}

/**
 * Imports "Name,Role?,Skill A,Skill B…" CSV. A "Role" column is optional; cells hold 0–4 or level names,
 * a trailing "*" or "+" marks interest. Skill groups can be given as "Group / Skill".
 */
export function importCsv(text: string, id: () => string): Matrix | null {
  const rows = parseCsv(text.trim())
  if (rows.length < 2 || rows[0].length < 2) return null
  const head = rows[0]
  const hasRole = /^(role|title|position)$/i.test(head[1] ?? '')
  const first = hasRole ? 2 : 1
  const skills: Skill[] = head.slice(first).map((h) => {
    const [g, n] = h.includes('/') ? h.split('/').map((x) => x.trim()) : ['General', h.trim()]
    return { id: id(), name: n || 'Skill', group: g || 'General', target: 3, need: 2 }
  })
  const people: Person[] = []
  const r: Record<string, number> = {}, interest: Record<string, boolean> = {}
  for (const row of rows.slice(1)) {
    if (!row[0]) continue
    const p = { id: id(), name: row[0], role: hasRole ? row[1] ?? '' : '' }
    people.push(p)
    skills.forEach((s, j) => {
      const raw = (row[first + j] ?? '').trim()
      const star = /[*+]$/.test(raw)
      const v = raw.replace(/[*+]$/, '').trim()
      const byName = LEVELS.findIndex((l) => l.toLowerCase() === v.toLowerCase())
      const n = byName >= 0 ? byName : Math.round(Number(v))
      if (Number.isFinite(n) && n > 0) r[key(p.id, s.id)] = Math.min(4, Math.max(0, n))
      if (star) interest[key(p.id, s.id)] = true
    })
  }
  return { skills, people, r, interest }
}

export function exportCsv(m: Matrix): (string | number)[][] {
  return [['Name', 'Role', ...m.skills.map((s) => `${s.group} / ${s.name}`)], ...m.people.map((p) => [p.name, p.role, ...m.skills.map((s) => `${level(m, p.id, s.id)}${m.interest[key(p.id, s.id)] ? '*' : ''}`)])]
}
