// Live meeting notes: quick-capture prefixes, action extraction (@owner + natural due dates),
// buckets for the open-actions board, Markdown and ICS export. Dates are ISO YYYY-MM-DD (UTC maths).

export type Kind = 'note' | 'action' | 'decision' | 'question'
export const KIND_ICON: Record<Kind, string> = { note: '•', action: '☐', decision: '✔', question: '?' }

/** "A: …" → action, "D: …" → decision, "Q: …" → question, "N: …"/anything else → note. Also "[] …" or "TODO …" → action. */
export function parseEntry(line: string): { kind: Kind; text: string } {
  const m = /^\s*([adqn])\s*[:)]\s*(.*)$/is.exec(line)
  if (m) return { kind: ({ a: 'action', d: 'decision', q: 'question', n: 'note' } as const)[m[1].toLowerCase() as 'a'], text: m[2].trim() }
  const t = /^\s*(?:\[\s?\]|todo\b[:\s]?)\s*(.*)$/is.exec(line)
  if (t) return { kind: 'action', text: t[1].trim() }
  return { kind: 'note', text: line.trim() }
}

const DAY = 86400000
const parse = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10))
const iso = (t: number) => new Date(t).toISOString().slice(0, 10)
export const addDays = (s: string, n: number) => iso(parse(s) + n * DAY)
export const dow = (s: string) => new Date(parse(s)).getUTCDay() // 0 = Sunday

const DAYS: [RegExp, number][] = [
  [/^sun(day)?$/, 0], [/^mon(day)?$/, 1], [/^tue(s|sday)?$/, 2], [/^wed(s|nesday)?$/, 3], [/^thu(r|rs|rsday)?$/, 4], [/^fri(day)?$/, 5], [/^sat(urday)?$/, 6],
]
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const dayIndex = (w: string) => DAYS.find(([r]) => r.test(w))?.[1] ?? -1

export interface Due { date: string; match: string }

/** Finds a due date phrase in free text relative to `ref` (ISO). Returns null when none is found. */
export function parseDue(text: string, ref: string): Due | null {
  const t = text.toLowerCase()
  let m: RegExpExecArray | null
  if ((m = /\b(\d{4}-\d{2}-\d{2})\b/.exec(t)) && iso(parse(m[1])) === m[1]) return { date: m[1], match: m[0] }
  if ((m = /\b(?:(?:by|due|on|before)\s+)?(today|tonight|eod|end of day)\b/.exec(t))) return { date: ref, match: m[0] }
  if ((m = /\b(?:(?:by|due|on|before)\s+)?(tomorrow|tmrw|tmr)\b/.exec(t))) return { date: addDays(ref, 1), match: m[0] }
  if ((m = /\b(?:(?:by|due|before)\s+)?(?:eow|end of (?:the )?week)\b/.exec(t))) return { date: addDays(ref, (5 - dow(ref) + 7) % 7), match: m[0] }
  if ((m = /\b(?:(?:by|due|before)\s+)?next week\b/.exec(t))) return { date: addDays(ref, ((8 - dow(ref)) % 7) || 7), match: m[0] }
  if ((m = /\b(?:(?:by|due|before)\s+)?(?:eom|end of (?:the )?month)\b/.exec(t))) {
    const d = new Date(parse(ref))
    return { date: iso(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)), match: m[0] }
  }
  if ((m = /\b(?:(?:by|due|before)\s+)?next month\b/.exec(t))) {
    const d = new Date(parse(ref))
    return { date: iso(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)), match: m[0] }
  }
  if ((m = /\b(?:(?:by|due|within)\s+)?in\s+(\d{1,3}|a|one|two|three)\s+(day|days|week|weeks)\b/.exec(t))) {
    const n = ({ a: 1, one: 1, two: 2, three: 3 } as Record<string, number>)[m[1]] ?? Number(m[1])
    return { date: addDays(ref, n * (m[2].startsWith('week') ? 7 : 1)), match: m[0] }
  }
  // month names: "nov 3", "3 november", "by dec 1st"
  const mon = `(${MONTHS.join('|')})[a-z]*\\.?`
  const year = (mi: number, d: number) => {
    const y = +ref.slice(0, 4)
    const c = iso(Date.UTC(y, mi, d))
    return c < ref ? iso(Date.UTC(y + 1, mi, d)) : c
  }
  if ((m = new RegExp(`\\b(?:(?:by|due|on|before)\\s+)?${mon}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`).exec(t))) return { date: year(MONTHS.indexOf(m[1]), +m[2]), match: m[0] }
  if ((m = new RegExp(`\\b(?:(?:by|due|on|before)\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+${mon}\\b`).exec(t))) return { date: year(MONTHS.indexOf(m[2]), +m[1]), match: m[0] }
  // weekdays: full names anywhere; abbreviations only after a context word or at the end of the text
  const re = /\b(by|due|on|before|until|till|this|next|for)?\s*\b(sun(?:day)?|mon(?:day)?|tue(?:s|sday)?|wed(?:s|nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?)\b/g
  while ((m = re.exec(t))) {
    const word = m[2], ctx = m[1], end = /^[.!?,;)]*\s*$/.test(t.slice(m.index + m[0].length))
    const full = word.length > 4 && /day$/.test(word)
    if (!full && !ctx && !end) continue
    const target = dayIndex(word)
    if (target < 0) continue
    const today = dow(ref)
    let delta = (target - today + 7) % 7 || 7
    if (ctx === 'this' && target === today) delta = 0
    if (ctx === 'next') {
      // the given weekday in next calendar week (weeks start Monday)
      const toNextMon = ((8 - today) % 7) || 7
      delta = toNextMon + ((target + 6) % 7)
    }
    return { date: addDays(ref, delta), match: m[0].trim() }
  }
  return null
}

export interface ParsedAction { task: string; owner: string; due: string }
/** Pulls "@owner" and a due-date phrase out of an action line. */
export function parseAction(text: string, ref: string): ParsedAction {
  const om = /@([\p{L}][\p{L}\p{N}._-]*)/u.exec(text)
  const owner = om ? om[1].replace(/[._-]+$/, '') : ''
  const d = parseDue(text, ref)
  let task = text
  if (om) task = task.replace(om[0], ' ')
  if (d) {
    const i = task.toLowerCase().indexOf(d.match)
    if (i >= 0) task = task.slice(0, i) + ' ' + task.slice(i + d.match.length)
  }
  task = task.replace(/\s{2,}/g, ' ').replace(/\s+([,.;:!?])/g, '$1').replace(/^[\s,;:–—-]+|[\s,;:.–—-]+$/g, '').trim()
  return { task: task ? task[0].toUpperCase() + task.slice(1) : text.trim(), owner, due: d?.date ?? '' }
}

export type Bucket = 'overdue' | 'today' | 'week' | 'later' | 'none'
export const BUCKETS: [Bucket, string][] = [['overdue', 'Overdue'], ['today', 'Today'], ['week', 'Next 7 days'], ['later', 'Later'], ['none', 'No date']]
export function bucket(due: string, today: string): Bucket {
  if (!due) return 'none'
  if (due < today) return 'overdue'
  if (due === today) return 'today'
  return due <= addDays(today, 7) ? 'week' : 'later'
}

export const clock = (sec: number) => {
  const s = Math.max(0, Math.round(Math.abs(sec)))
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60
  return `${sec < 0 ? '−' : ''}${h ? `${h}:${String(m).padStart(2, '0')}` : m}:${String(r).padStart(2, '0')}`
}

export interface Entry { id: string; at: number; item: string; kind: Kind; text: string }
export interface Item { id: string; title: string; minutes: number; spent: number }
export interface Action { id: string; task: string; owner: string; due: string; done: boolean }
export interface Meeting { id: string; title: string; date: string; attendees: string; items: Item[]; entries: Entry[]; actions: Action[]; ended?: boolean }

export function toMarkdown(m: Meeting): string {
  const L: string[] = [`# ${m.title || 'Meeting'} — ${m.date}`, '']
  if (m.attendees.trim()) L.push(`**Attendees:** ${m.attendees.trim()}`, '')
  const by = (k: Kind) => m.entries.filter((e) => e.kind === k)
  for (const it of m.items) {
    const es = m.entries.filter((e) => e.item === it.id)
    L.push(`## ${it.title} _(${it.minutes} min planned${it.spent ? `, ${Math.round(it.spent / 60)} min used` : ''})_`)
    if (!es.length) L.push('_No notes._')
    for (const e of es) L.push(`- ${e.kind === 'note' ? '' : `**${e.kind[0].toUpperCase() + e.kind.slice(1)}:** `}${e.text}`)
    L.push('')
  }
  const loose = m.entries.filter((e) => !m.items.some((i) => i.id === e.item))
  if (loose.length) { L.push('## Other notes'); loose.forEach((e) => L.push(`- ${e.text}`)); L.push('') }
  if (by('decision').length) { L.push('## Decisions'); by('decision').forEach((e) => L.push(`- ${e.text}`)); L.push('') }
  if (by('question').length) { L.push('## Open questions'); by('question').forEach((e) => L.push(`- ${e.text}`)); L.push('') }
  if (m.actions.length) {
    L.push('## Action items')
    m.actions.forEach((a) => L.push(`- [${a.done ? 'x' : ' '}] ${a.task}${a.owner ? ` — @${a.owner}` : ''}${a.due ? ` (due ${a.due})` : ''}`))
    L.push('')
  }
  return L.join('\n')
}

const icsEsc = (s: string) => s.replace(/[\\;,]/g, (c) => '\\' + c).replace(/\n/g, '\\n')
/** All-day events for actions with a due date (VEVENT imports everywhere, unlike VTODO). */
export function toIcs(actions: (Action & { meeting?: string })[], stamp: string): string {
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Browser Toolbox//Meeting Notes//EN', 'CALSCALE:GREGORIAN']
  for (const a of actions.filter((x) => x.due && !x.done)) {
    L.push('BEGIN:VEVENT', `UID:${a.id}@browser-toolbox-meeting-notes`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${a.due.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${addDays(a.due, 1).replace(/-/g, '')}`, `SUMMARY:${icsEsc(`☐ ${a.task}${a.owner ? ` (@${a.owner})` : ''}`)}`)
    if (a.meeting) L.push(`DESCRIPTION:${icsEsc(`From meeting: ${a.meeting}`)}`)
    L.push('END:VEVENT')
  }
  L.push('END:VCALENDAR')
  return L.join('\r\n') + '\r\n'
}

/** Case-insensitive search over title, attendees, entries and actions. */
export function matches(m: Meeting, q: string): boolean {
  const s = q.trim().toLowerCase()
  if (!s) return true
  const hay = [m.title, m.attendees, m.date, ...m.items.map((i) => i.title), ...m.entries.map((e) => e.text), ...m.actions.map((a) => `${a.task} @${a.owner}`)].join('\n').toLowerCase()
  return s.split(/\s+/).every((w) => hay.includes(w))
}
