// Weekly review: ISO-week keys, guided steps, completion, comparison and Markdown export.

export interface Step {
  id: string
  title: string
  minutes: number
  intro: string
  checks?: [string, string][]
  questions?: [string, string, string][] // id, question, placeholder
  ratings?: boolean
  priorities?: boolean
}

export const RATINGS: [string, string][] = [['energy', 'Energy'], ['focus', 'Focus & productivity'], ['mood', 'Mood'], ['health', 'Health & sleep'], ['people', 'Relationships'], ['growth', 'Learning & growth']]

export const STEPS: Step[] = [
  { id: 'clear', title: 'Get clear', minutes: 10, intro: 'Empty every inbox so nothing is hiding.', checks: [
    ['inbox', 'Process email and messages to zero (or to a clear "to read" folder)'], ['paper', 'Collect loose papers, receipts and notes'], ['notes', 'Move notes and voice memos into your system'], ['dump', 'Brain-dump anything still on your mind']] },
  { id: 'current', title: 'Get current', minutes: 15, intro: 'Bring your lists up to date with reality.', checks: [
    ['pastcal', "Review last week's calendar for follow-ups"], ['nextcal', 'Look at the next two weeks of calendar'], ['actions', 'Update action lists — tick off done, delete stale'], ['waiting', 'Check "waiting for" items and send nudges'], ['projects', 'Make sure every active project has a next action']] },
  { id: 'reflect', title: 'Reflect', minutes: 10, intro: 'Look back honestly — short answers are fine.', questions: [
    ['wins', 'What went well? (wins, big or small)', 'Shipped the report draft; ran 3 times'], ['hard', 'What was hard or didn’t go to plan?', 'Too many meetings on Wednesday'], ['learn', 'What did you learn?', 'Blocking mornings works'], ['grateful', 'What are you grateful for?', 'Dinner with friends']] },
  { id: 'rate', title: 'Rate the week', minutes: 3, intro: 'Score each area from 1 (poor) to 5 (great).', ratings: true },
  { id: 'plan', title: 'Plan next week', minutes: 10, intro: 'Choose what matters most before the week chooses for you.', priorities: true, questions: [
    ['theme', 'Theme or focus for next week', 'Finish the migration'], ['stop', 'One thing to stop or do less of', 'Checking email before 10 am']] },
  { id: 'creative', title: 'Get creative', minutes: 5, intro: 'Leave room for ideas.', checks: [['someday', 'Skim the someday/maybe list']], questions: [['idea', 'One idea worth exploring', 'Weekend workshop on woodworking']] },
]

export interface Priority { text: string; done: boolean }
export interface Entry {
  week: string
  checks: Record<string, boolean>
  answers: Record<string, string>
  ratings: Record<string, number>
  priorities: Priority[]
  updated: string
}

export const emptyEntry = (week: string): Entry => ({ week, checks: {}, answers: {}, ratings: {}, priorities: [{ text: '', done: false }, { text: '', done: false }, { text: '', done: false }], updated: '' })

/** ISO-8601 week key, e.g. "2026-W42", for a YYYY-MM-DD date. */
export function isoWeek(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d))
  const day = (t.getUTCDay() + 6) % 7
  t.setUTCDate(t.getUTCDate() - day + 3) // Thursday of this week
  const wy = t.getUTCFullYear()
  const jan4 = new Date(Date.UTC(wy, 0, 4))
  const w = 1 + Math.round(((t.getTime() - jan4.getTime()) / 86400000 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7)
  return `${wy}-W${String(w).padStart(2, '0')}`
}

/** Monday (YYYY-MM-DD) of an ISO week key. */
export function weekStart(key: string): string {
  const [, ys, ws] = /^(\d{4})-W(\d{2})$/.exec(key) ?? ['', '1970', '01']
  const jan4 = new Date(Date.UTC(+ys, 0, 4))
  const mon = new Date(jan4.getTime() - ((jan4.getUTCDay() + 6) % 7) * 86400000 + (+ws - 1) * 7 * 86400000)
  return mon.toISOString().slice(0, 10)
}

export const shiftWeek = (key: string, n: number) => {
  const t = Date.parse(weekStart(key) + 'T00:00:00Z') + n * 7 * 86400000
  return isoWeek(new Date(t).toISOString().slice(0, 10))
}

/** Fraction of guided items completed (checks, answers, ratings, at least one priority). */
export function completion(e: Entry): number {
  let tot = 0, got = 0
  for (const s of STEPS) {
    for (const [id] of s.checks ?? []) { tot++; if (e.checks[id]) got++ }
    for (const [id] of s.questions ?? []) { tot++; if (e.answers[id]?.trim()) got++ }
    if (s.ratings) for (const [id] of RATINGS) { tot++; if (e.ratings[id]) got++ }
    if (s.priorities) { tot++; if (e.priorities.some((p) => p.text.trim())) got++ }
  }
  return tot ? got / tot : 0
}

export function stepDone(s: Step, e: Entry): number {
  let tot = 0, got = 0
  for (const [id] of s.checks ?? []) { tot++; if (e.checks[id]) got++ }
  for (const [id] of s.questions ?? []) { tot++; if (e.answers[id]?.trim()) got++ }
  if (s.ratings) for (const [id] of RATINGS) { tot++; if (e.ratings[id]) got++ }
  if (s.priorities) { tot++; if (e.priorities.some((p) => p.text.trim())) got++ }
  return tot ? got / tot : 1
}

export function avgRating(e: Entry | undefined): number | null {
  if (!e) return null
  const v = RATINGS.map(([id]) => e.ratings[id]).filter((x): x is number => !!x)
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
}

/** Consecutive reviewed weeks (completion ≥ 50 %) ending at `week` or the week before. */
export function reviewStreak(entries: Record<string, Entry>, week: string): number {
  const ok = (k: string) => !!entries[k] && completion(entries[k]) >= 0.5
  let k = ok(week) ? week : shiftWeek(week, -1)
  let n = 0
  while (ok(k) && n < 520) { n++; k = shiftWeek(k, -1) }
  return n
}

export function toMarkdown(e: Entry, prev?: Entry): string {
  const L: string[] = [`# Weekly review — ${e.week} (week of ${weekStart(e.week)})`, '']
  if (prev?.priorities.some((p) => p.text.trim())) {
    L.push("## Last week's priorities")
    for (const p of prev.priorities) if (p.text.trim()) L.push(`- [${p.done ? 'x' : ' '}] ${p.text}`)
    L.push('')
  }
  for (const s of STEPS) {
    L.push(`## ${s.title}`)
    for (const [id, t] of s.checks ?? []) L.push(`- [${e.checks[id] ? 'x' : ' '}] ${t}`)
    for (const [id, q] of s.questions ?? []) L.push(`**${q}**`, '', (e.answers[id] ?? '').trim() || '_—_', '')
    if (s.ratings) {
      L.push('| Area | Score | vs last week |', '|---|---|---|')
      for (const [id, n] of RATINGS) {
        const v = e.ratings[id], pv = prev?.ratings[id]
        L.push(`| ${n} | ${v ? '★'.repeat(v) + '☆'.repeat(5 - v) : '—'} | ${v && pv ? (v - pv > 0 ? `+${v - pv}` : v - pv === 0 ? '=' : String(v - pv)) : ''} |`)
      }
    }
    if (s.priorities) {
      L.push('**Top 3 for next week**', '')
      e.priorities.forEach((p, i) => p.text.trim() && L.push(`${i + 1}. ${p.text}`))
    }
    L.push('')
  }
  return L.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n'
}
