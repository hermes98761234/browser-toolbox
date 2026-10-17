// Study planner: spreads topic hours over available days before each exam (urgency-weighted), plus ICS export.

export interface Topic { id: string; name: string; hours: number }
export interface Exam { id: string; name: string; date: string; topics: Topic[] }
export interface PlanInput {
  start: string
  exams: Exam[]
  /** Hours available per weekday, index 0 = Monday. */
  week: number[]
  blocked: string[]
  block: number // smallest study chunk in hours
  review: number // hours reserved on the day before each exam
}
export interface Slot { examId: string; topic: string; hours: number; review?: boolean }
export interface Day { date: string; cap: number; slots: Slot[] }
export interface Plan { days: Day[]; unscheduled: Record<string, number>; planned: Record<string, number> }

const MS = 86400000
export const toDate = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10))
export const iso = (t: number) => new Date(t).toISOString().slice(0, 10)
export const addDays = (s: string, n: number) => iso(toDate(s) + n * MS)
export const daysBetween = (a: string, b: string) => Math.round((toDate(b) - toDate(a)) / MS)
/** 0 = Monday … 6 = Sunday. */
export const weekday = (s: string) => (new Date(toDate(s)).getUTCDay() + 6) % 7

export function schedule(inp: PlanInput): Plan {
  const exams = inp.exams.filter((e) => e.date > inp.start).sort((a, b) => a.date.localeCompare(b.date))
  const last = exams.length ? exams[exams.length - 1].date : inp.start
  const blocked = new Set(inp.blocked)
  const days: Day[] = []
  for (let d = inp.start; d < last; d = addDays(d, 1)) days.push({ date: d, cap: blocked.has(d) ? 0 : Math.max(0, inp.week[weekday(d)] ?? 0), slots: [] })
  const queue = new Map(exams.map((e) => [e.id, e.topics.filter((t) => t.hours > 0).map((t) => ({ name: t.name, left: t.hours }))]))
  const left = (id: string) => queue.get(id)!.reduce((a, t) => a + t.left, 0)
  const planned: Record<string, number> = {}
  const add = (day: Day, examId: string, topic: string, h: number, review = false) => {
    const prev = day.slots.find((s) => s.examId === examId && s.topic === topic && !!s.review === review)
    if (prev) prev.hours += h
    else day.slots.push({ examId, topic, hours: h, review: review || undefined })
    planned[examId] = (planned[examId] ?? 0) + h
  }
  const examDates = new Set(exams.map((e) => e.date))
  const reserved = (d: Day) => Math.min(d.cap, inp.review > 0 && examDates.has(addDays(d.date, 1)) ? inp.review * exams.filter((e) => e.date === addDays(d.date, 1)).length : 0)
  for (const [di, day] of days.entries()) {
    let free = day.cap
    // Review the day before an exam comes first.
    for (const e of exams) {
      if (addDays(day.date, 1) === e.date && inp.review > 0 && free > 0) {
        const h = Math.min(free, inp.review)
        add(day, e.id, 'Review & practice exam', h, true)
        free -= h
      }
    }
    const step = Math.max(0.25, inp.block)
    while (free > 1e-9) {
      // Most urgent exam: remaining work relative to the study hours still available before it.
      let best: Exam | null = null, score = -1
      for (const e of exams) {
        if (e.date <= day.date) continue
        const rem = left(e.id)
        if (rem <= 1e-9) continue
        let ahead = free
        for (let k = di + 1; k < days.length && days[k].date < e.date; k++) ahead += days[k].cap - reserved(days[k])
        const sc = rem / Math.max(ahead, 1e-6)
        if (sc > score) { score = sc; best = e }
      }
      if (!best) break
      const q = queue.get(best.id)!
      const t = q.find((x) => x.left > 1e-9)!
      const h = Math.min(step, free, t.left)
      add(day, best.id, t.name, h)
      t.left -= h
      free -= h
    }
  }
  const unscheduled: Record<string, number> = {}
  for (const e of exams) unscheduled[e.id] = Math.round(left(e.id) * 100) / 100
  return { days, unscheduled, planned }
}

const icsDate = (d: string, minutes: number) => {
  const h = Math.floor(minutes / 60), m = Math.round(minutes % 60)
  return `${d.replace(/-/g, '')}T${String(h).padStart(2, '0')}${String(m).padStart(2, '0')}00`
}
const esc = (s: string) => s.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\n/g, '\\n')

/** iCalendar with one event per study slot (sequential from `startMin`, floating local time) and one per exam. */
export function toIcs(plan: Plan, exams: Exam[], startMin = 17 * 60): string {
  const name = new Map(exams.map((e) => [e.id, e.name]))
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z'
  const ev: string[] = []
  let n = 0
  for (const d of plan.days) {
    let t = startMin
    for (const s of d.slots) {
      const end = t + s.hours * 60
      ev.push(['BEGIN:VEVENT', `UID:study-${d.date}-${n++}@browser-toolbox`, `DTSTAMP:${stamp}`, `DTSTART:${icsDate(d.date, t)}`, `DTEND:${icsDate(d.date, end)}`, `SUMMARY:${esc(`${name.get(s.examId) ?? 'Study'}: ${s.topic}`)}`, 'END:VEVENT'].join('\r\n'))
      t = end
    }
  }
  for (const e of exams) ev.push(['BEGIN:VEVENT', `UID:exam-${e.id}@browser-toolbox`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${e.date.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${addDays(e.date, 1).replace(/-/g, '')}`, `SUMMARY:${esc(`EXAM: ${e.name}`)}`, 'END:VEVENT'].join('\r\n'))
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Browser Toolbox//Study Planner//EN', 'CALSCALE:GREGORIAN', ...ev, 'END:VCALENDAR', ''].join('\r\n')
}
