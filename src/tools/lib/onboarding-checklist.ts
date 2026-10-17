// Onboarding Checklist: role templates, due dates from the start date (calendar or working days) and progress.

export type Owner = 'HR' | 'IT' | 'Manager' | 'Buddy' | 'New hire'
export interface TaskTpl { t: string; o: Owner; d: number } // d = day offset from start (0 = first day, negative = before)
export interface Task { id: string; title: string; owner: Owner; offset: number; due: string; done: boolean; note: string; custom?: boolean }

const iso = (d: Date) => d.toISOString().slice(0, 10)
const parse = (s: string) => new Date(`${s}T00:00:00Z`)

/** Adds n working days (Mon–Fri). n = 0 on a weekend rolls forward to Monday. */
export function addWorkdays(start: string, n: number): string {
  const d = parse(start)
  const wk = (x: Date) => x.getUTCDay() % 6 !== 0
  if (n === 0) {
    while (!wk(d)) d.setUTCDate(d.getUTCDate() + 1)
    return iso(d)
  }
  const step = n > 0 ? 1 : -1
  let left = Math.abs(n)
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + step)
    if (wk(d)) left--
  }
  return iso(d)
}

export function addDays(start: string, n: number): string {
  const d = parse(start)
  d.setUTCDate(d.getUTCDate() + n)
  return iso(d)
}

export const daysBetween = (a: string, b: string) => Math.round((parse(b).getTime() - parse(a).getTime()) / 86400000)

export const PHASES: [string, number, number][] = [
  ['Before day 1', -1e9, -1], ['Day 1', 0, 0], ['Week 1', 1, 4], ['First 30 days', 5, 21], ['Days 31–60', 22, 43], ['Days 61–90', 44, 1e9],
]
/** Phase index for a working-day offset. */
export const phaseOf = (offset: number) => PHASES.findIndex(([, a, b]) => offset >= a && offset <= b)

const COMMON: TaskTpl[] = [
  { t: 'Send offer letter, contract and welcome email', o: 'HR', d: -10 },
  { t: 'Collect tax, ID and banking forms', o: 'HR', d: -5 },
  { t: 'Order laptop and peripherals', o: 'IT', d: -8 },
  { t: 'Create e-mail, SSO and chat accounts', o: 'IT', d: -2 },
  { t: 'Assign an onboarding buddy', o: 'Manager', d: -5 },
  { t: 'Share first-week schedule', o: 'Manager', d: -2 },
  { t: 'Welcome meeting and office / remote tour', o: 'Manager', d: 0 },
  { t: 'Set up laptop, password manager and 2FA', o: 'New hire', d: 0 },
  { t: 'Lunch or coffee with the team', o: 'Buddy', d: 0 },
  { t: 'Complete security and privacy training', o: 'New hire', d: 2 },
  { t: 'Read the handbook and benefits guide', o: 'New hire', d: 3 },
  { t: 'Agree 30/60/90-day goals', o: 'Manager', d: 4 },
  { t: 'Benefits enrollment', o: 'HR', d: 9 },
  { t: '30-day check-in', o: 'Manager', d: 21 },
  { t: '60-day check-in', o: 'Manager', d: 43 },
  { t: '90-day review and feedback survey', o: 'HR', d: 64 },
]

export const ROLES: Record<string, { label: string; tasks: TaskTpl[] }> = {
  engineer: { label: 'Software engineer', tasks: [
    { t: 'Grant repository, CI and cloud access', o: 'IT', d: -1 },
    { t: 'Clone the main repo and run it locally', o: 'New hire', d: 1 },
    { t: 'Ship a first small pull request', o: 'New hire', d: 4 },
    { t: 'Architecture walkthrough', o: 'Buddy', d: 2 },
    { t: 'Shadow an on-call shift', o: 'Buddy', d: 15 },
    { t: 'Own a small feature end-to-end', o: 'New hire', d: 30 },
    { t: 'Join the on-call rotation', o: 'Manager', d: 55 },
  ] },
  sales: { label: 'Sales rep', tasks: [
    { t: 'CRM licence and dialer setup', o: 'IT', d: -1 },
    { t: 'Product and pricing training', o: 'Manager', d: 1 },
    { t: 'Shadow 5 discovery calls', o: 'Buddy', d: 4 },
    { t: 'Pitch certification role-play', o: 'Manager', d: 10 },
    { t: 'Build territory / account plan', o: 'New hire', d: 15 },
    { t: 'Run first solo demo', o: 'New hire', d: 20 },
    { t: 'Reach 50% of ramp quota', o: 'New hire', d: 60 },
  ] },
  support: { label: 'Customer support', tasks: [
    { t: 'Helpdesk and knowledge-base access', o: 'IT', d: -1 },
    { t: 'Learn tone of voice and macros', o: 'New hire', d: 1 },
    { t: 'Shadow live chats and calls', o: 'Buddy', d: 2 },
    { t: 'Answer first tickets with review', o: 'New hire', d: 4 },
    { t: 'Handle a full queue independently', o: 'New hire', d: 15 },
    { t: 'Write or improve a help article', o: 'New hire', d: 30 },
    { t: 'Meet CSAT and response-time targets', o: 'Manager', d: 60 },
  ] },
  designer: { label: 'Product designer', tasks: [
    { t: 'Design tool seats and design-system access', o: 'IT', d: -1 },
    { t: 'Design system and brand walkthrough', o: 'Buddy', d: 1 },
    { t: 'Review recent user research', o: 'New hire', d: 3 },
    { t: 'Sit in on 3 customer interviews', o: 'New hire', d: 15 },
    { t: 'Deliver a first design improvement', o: 'New hire', d: 25 },
    { t: 'Present work at design critique', o: 'New hire', d: 40 },
  ] },
  manager: { label: 'People manager', tasks: [
    { t: 'HR system and approvals access', o: 'IT', d: -1 },
    { t: '1:1s with every direct report', o: 'New hire', d: 4 },
    { t: 'Meet key stakeholders', o: 'New hire', d: 10 },
    { t: 'Review team goals, budget and hiring plan', o: 'Manager', d: 15 },
    { t: 'Manager training: feedback and performance', o: 'HR', d: 20 },
    { t: 'Share a 90-day team plan', o: 'New hire', d: 45 },
  ] },
  generic: { label: 'Any role (common tasks only)', tasks: [] },
}

/** Builds the task list for a role. Template offsets are working days; in calendar mode they are scaled by 7/5. */
export function generate(role: string, start: string, workdays: boolean): Task[] {
  const tpl = [...COMMON, ...(ROLES[role]?.tasks ?? [])].sort((a, b) => a.d - b.d)
  return tpl.map((x, i) => ({ id: `${role}-${i}`, title: x.t, owner: x.o, offset: x.d, due: workdays ? addWorkdays(start, x.d) : addDays(start, Math.round((x.d * 7) / 5)), done: false, note: '' }))
}

export type Status = 'done' | 'overdue' | 'soon' | 'later'
export function status(t: Task, today: string): Status {
  if (t.done) return 'done'
  const d = daysBetween(today, t.due)
  return d < 0 ? 'overdue' : d <= 3 ? 'soon' : 'later'
}

export function progress(tasks: Task[]): { done: number; total: number; share: number } {
  const done = tasks.filter((t) => t.done).length
  return { done, total: tasks.length, share: tasks.length ? done / tasks.length : 0 }
}
