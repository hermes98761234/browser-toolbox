// Reference Check Form: question templates, answer scoring/summary and a lint for risky questions.

export type Kind = 'rating' | 'yesno' | 'text'
export interface Question { id: string; text: string; comp: string; kind: Kind }
export interface Answer { rating?: number; yes?: 'yes' | 'no' | 'unsure'; note: string }
export interface Reference {
  id: string
  name: string
  title: string
  company: string
  relationship: string
  years: number
  contact: string
  date: string
  consent: boolean
  rehire: '' | 'yes' | 'no' | 'unsure'
  overall: number
  answers: Record<string, Answer>
  flags: string
}

const q = (id: string, comp: string, kind: Kind, text: string): Question => ({ id, comp, kind, text })

export const TEMPLATES: Record<string, { label: string; questions: Question[] }> = {
  general: {
    label: 'General (any role)',
    questions: [
      q('g1', 'Context', 'text', 'How do you know the candidate, and for how long did you work together?'),
      q('g2', 'Context', 'text', 'What were their main responsibilities?'),
      q('g3', 'Quality of work', 'rating', 'How would you rate the quality and accuracy of their work?'),
      q('g4', 'Reliability', 'rating', 'How dependable were they with deadlines and commitments?'),
      q('g5', 'Communication', 'rating', 'How well did they communicate with colleagues and stakeholders?'),
      q('g6', 'Teamwork', 'rating', 'How effectively did they work with others, including under pressure?'),
      q('g7', 'Growth', 'text', 'What is one area where they could grow or would benefit from support?'),
      q('g8', 'Strengths', 'text', 'What would you say are their greatest strengths?'),
      q('g9', 'Rehire', 'yesno', 'Would you work with or hire them again?'),
    ],
  },
  manager: {
    label: 'Former manager',
    questions: [
      q('m1', 'Context', 'text', 'What was your reporting relationship and how long did it last?'),
      q('m2', 'Performance', 'rating', 'Compared with others in the same role, how did they perform?'),
      q('m3', 'Ownership', 'rating', 'How well did they take ownership of problems and outcomes?'),
      q('m4', 'Feedback', 'rating', 'How did they respond to feedback and coaching?'),
      q('m5', 'Judgement', 'rating', 'How sound was their judgement when making decisions without you?'),
      q('m6', 'Growth', 'text', 'What development goals did you set together, and how did they progress?'),
      q('m7', 'Departure', 'text', 'Why did they leave the role? (Only if the referee is comfortable sharing.)'),
      q('m8', 'Rehire', 'yesno', 'Would you rehire them for a similar role?'),
    ],
  },
  peer: {
    label: 'Peer / colleague',
    questions: [
      q('p1', 'Context', 'text', 'What projects did you work on together?'),
      q('p2', 'Teamwork', 'rating', 'How easy were they to collaborate with?'),
      q('p3', 'Communication', 'rating', 'How clearly did they share information and decisions?'),
      q('p4', 'Conflict', 'text', 'Describe a disagreement you had and how it was resolved.'),
      q('p5', 'Reliability', 'rating', 'Could you count on them to deliver their part?'),
      q('p6', 'Strengths', 'text', 'What did you learn from working with them?'),
      q('p7', 'Rehire', 'yesno', 'Would you want them on your team again?'),
    ],
  },
  leader: {
    label: 'People leader role',
    questions: [
      q('l1', 'Context', 'text', 'How large was the team they led, and what was its remit?'),
      q('l2', 'Leadership', 'rating', 'How well did they set direction and priorities for the team?'),
      q('l3', 'Coaching', 'rating', 'How effective were they at developing people?'),
      q('l4', 'Leadership', 'rating', 'How did they handle underperformance or difficult conversations?'),
      q('l5', 'Change', 'text', 'Tell me about a significant change they led. What went well and what did not?'),
      q('l6', 'Stakeholders', 'rating', 'How well did they manage senior stakeholders?'),
      q('l7', 'Rehire', 'yesno', 'Would you want to work for them?'),
    ],
  },
  technical: {
    label: 'Technical role',
    questions: [
      q('t1', 'Context', 'text', 'Which systems or products did they work on?'),
      q('t2', 'Technical skill', 'rating', 'How strong were their technical skills relative to their level?'),
      q('t3', 'Quality of work', 'rating', 'How maintainable and well-tested was their work?'),
      q('t4', 'Problem solving', 'rating', 'How did they approach ambiguous or hard problems?'),
      q('t5', 'Communication', 'rating', 'How well did they explain technical topics to non-specialists?'),
      q('t6', 'Growth', 'text', 'Where did they stretch themselves most during your time together?'),
      q('t7', 'Rehire', 'yesno', 'Would you hire them again for a technical team?'),
    ],
  },
}

/** Topics an employer should not ask referees about (discrimination risk in most jurisdictions). */
const RISKY: [RegExp, string][] = [
  [/\b(age|old|young|born|birth|retire)/i, 'age'],
  [/\b(pregnan|maternity|children|kids|family plans?|childcare)/i, 'family / pregnancy'],
  [/\b(married|marital|spouse|husband|wife|partner)\b/i, 'marital status'],
  [/\b(religio|church|mosque|synagogue|faith|pray)/i, 'religion'],
  [/\b(disab|health|sick|illness|medical|mental|diagnos|medication)/i, 'health / disability'],
  [/\b(race|ethnic|nationality|accent|native|immigra|citizen)/i, 'race / national origin'],
  [/\b(union|strike)\b/i, 'union membership'],
  [/\b(sexual|gay|lesbian|transgender|gender identity)/i, 'sexual orientation / gender identity'],
  [/\b(arrest|criminal|convict)/i, 'criminal record (use a lawful background check instead)'],
  [/\b(salary|pay|earn|compensation)\b/i, 'pay history (banned in many US states)'],
]
export function lint(text: string): string[] {
  return RISKY.filter(([re]) => re.test(text)).map(([, label]) => label)
}

export interface Summary {
  comps: { comp: string; avg: number; n: number; spread: number }[]
  ratingAvg: number | null
  overallAvg: number | null
  rehire: { yes: number; no: number; unsure: number }
  completed: number
  coverage: number
  verdict: { label: string; tone: 'good' | 'bad' | 'accent' }
  concerns: string[]
}

/** Aggregates rating answers per competency over the given references. */
export function summarize(qs: Question[], refs: Reference[]): Summary {
  const by = new Map<string, number[]>()
  let asked = 0, answered = 0
  for (const r of refs)
    for (const qq of qs) {
      const a = r.answers[qq.id]
      asked++
      if (a && (a.rating || a.yes || a.note.trim())) answered++
      if (qq.kind === 'rating' && a?.rating) by.set(qq.comp, [...(by.get(qq.comp) ?? []), a.rating])
    }
  const comps = [...by.entries()].map(([comp, v]) => ({ comp, n: v.length, avg: v.reduce((x, y) => x + y, 0) / v.length, spread: Math.max(...v) - Math.min(...v) }))
  const all = [...by.values()].flat()
  const ratingAvg = all.length ? all.reduce((x, y) => x + y, 0) / all.length : null
  const ov = refs.map((r) => r.overall).filter((x) => x > 0)
  const overallAvg = ov.length ? ov.reduce((x, y) => x + y, 0) / ov.length : null
  const rehire = { yes: 0, no: 0, unsure: 0 }
  for (const r of refs) {
    const v = r.rehire || qs.filter((x) => x.kind === 'yesno' && x.comp === 'Rehire').map((x) => r.answers[x.id]?.yes).find(Boolean)
    if (v) rehire[v]++
  }
  const completed = refs.filter((r) => qs.every((x) => x.kind === 'text' || r.answers[x.id]?.rating || r.answers[x.id]?.yes)).length
  const concerns: string[] = []
  for (const c of comps) {
    if (c.avg < 3) concerns.push(`Low ${c.comp.toLowerCase()} (${c.avg.toFixed(1)}/5)`)
    if (c.n > 1 && c.spread >= 2) concerns.push(`Referees disagree on ${c.comp.toLowerCase()}`)
  }
  if (rehire.no) concerns.push(`${rehire.no} referee${rehire.no > 1 ? 's' : ''} would not rehire`)
  for (const r of refs) if (r.flags.trim()) concerns.push(`${r.name || 'Referee'}: ${r.flags.trim()}`)
  if (refs.some((r) => !r.consent)) concerns.push('Candidate consent not recorded for every reference')
  const score = overallAvg ?? ratingAvg
  const verdict: Summary['verdict'] =
    score === null || completed === 0 ? { label: 'In progress', tone: 'accent' }
      : rehire.no > 0 || score < 3 ? { label: 'Concerns — discuss before offer', tone: 'bad' }
        : score >= 4 && completed >= 2 ? { label: 'Strong references', tone: 'good' }
          : { label: 'Positive, verify gaps', tone: 'accent' }
  return { comps, ratingAvg, overallAvg, rehire, completed, coverage: asked ? answered / asked : 0, verdict, concerns }
}

/** Greedy word wrap by measured width (used for PDF text). */
export function wrapBy(text: string, width: number, measure: (s: string) => number): string[] {
  const out: string[] = []
  for (const para of text.split('\n')) {
    let line = ''
    for (const w of para.split(/\s+/).filter(Boolean)) {
      const t = line ? `${line} ${w}` : w
      if (line && measure(t) > width) {
        out.push(line)
        line = w
      } else line = t
    }
    out.push(line)
  }
  return out
}

/** pdf-lib standard fonts are WinAnsi: replace typographic characters it cannot encode. */
export const latin = (s: string) => s.replace(/[–—]/g, '-').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/…/g, '...').replace(/[^\x20-\x7e\xa0-\xff]/g, '?')
