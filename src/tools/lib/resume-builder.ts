// Resume model, JSON Resume conversion, plain-text rendering and ATS checks.

export interface Work { id: string; name: string; position: string; location: string; startDate: string; endDate: string; highlights: string }
export interface Edu { id: string; institution: string; studyType: string; area: string; startDate: string; endDate: string; score: string }
export interface Skill { id: string; name: string; keywords: string }
export interface Project { id: string; name: string; description: string; url: string }
export interface Resume {
  basics: { name: string; label: string; email: string; phone: string; url: string; location: string; summary: string }
  work: Work[]
  education: Edu[]
  skills: Skill[]
  projects: Project[]
  certificates: string
  languages: string
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "2021-03" → "Mar 2021"; "2021" stays; empty end → "Present". */
export function fmtDate(d: string, end = false): string {
  const m = /^(\d{4})(?:-(\d{1,2}))?/.exec(d.trim())
  if (!m) return d.trim() || (end ? 'Present' : '')
  return m[2] ? `${MONTHS[Number(m[2]) - 1] ?? ''} ${m[1]}`.trim() : m[1]
}
export const range = (a: string, b: string) => [fmtDate(a), fmtDate(b, true)].filter(Boolean).join(' – ')

export const lines = (s: string) => s.split('\n').map((l) => l.replace(/^\s*[-•*]\s*/, '').trim()).filter(Boolean)

export function toPlainText(r: Resume): string {
  const b = r.basics
  const out: string[] = [b.name.toUpperCase(), b.label, [b.email, b.phone, b.location, b.url].filter(Boolean).join(' | '), '']
  if (b.summary.trim()) out.push('SUMMARY', b.summary.trim(), '')
  if (r.work.length) {
    out.push('EXPERIENCE')
    for (const w of r.work) {
      out.push(`${w.position}, ${w.name}${w.location ? `, ${w.location}` : ''} (${range(w.startDate, w.endDate)})`)
      lines(w.highlights).forEach((h) => out.push(`- ${h}`))
      out.push('')
    }
  }
  if (r.education.length) {
    out.push('EDUCATION')
    for (const e of r.education) out.push(`${[e.studyType, e.area].filter(Boolean).join(', ')}, ${e.institution} (${range(e.startDate, e.endDate)})${e.score ? `, ${e.score}` : ''}`)
    out.push('')
  }
  if (r.skills.length) {
    out.push('SKILLS')
    for (const s of r.skills) out.push(`${s.name}: ${s.keywords}`)
    out.push('')
  }
  if (r.projects.length) {
    out.push('PROJECTS')
    for (const p of r.projects) out.push(`${p.name}${p.url ? ` (${p.url})` : ''}: ${p.description}`)
    out.push('')
  }
  if (lines(r.certificates).length) out.push('CERTIFICATIONS', ...lines(r.certificates), '')
  if (r.languages.trim()) out.push('LANGUAGES', r.languages.trim(), '')
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n'
}

const VERBS = /^(led|built|designed|developed|launched|reduced|increased|improved|created|managed|delivered|shipped|automated|migrated|implemented|mentored|owned|drove|grew|cut|scaled|optimized|optimised|architected|negotiated|established|introduced|streamlined|coordinated|analyzed|analysed|wrote|won|saved|trained|resolved)\b/i

export interface Check { ok: boolean; msg: string }

export function atsChecks(r: Resume): Check[] {
  const b = r.basics
  const bullets = r.work.flatMap((w) => lines(w.highlights))
  const quantified = bullets.filter((x) => /\d/.test(x)).length
  const verbs = bullets.filter((x) => VERBS.test(x)).length
  const words = toPlainText(r).split(/\s+/).filter(Boolean).length
  const badDates = r.work.filter((w) => w.startDate && w.endDate && w.endDate < w.startDate)
  const sw = b.summary.split(/\s+/).filter(Boolean).length
  return [
    { ok: !!b.name.trim(), msg: 'Name is present' },
    { ok: /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(b.email.trim()), msg: 'Valid email address' },
    { ok: b.phone.replace(/\D/g, '').length >= 7, msg: 'Phone number included' },
    { ok: sw >= 25 && sw <= 90, msg: `Summary is 25–90 words (now ${sw})` },
    { ok: r.work.length > 0 && r.work.every((w) => lines(w.highlights).length >= 2), msg: 'Every job has at least 2 bullet points' },
    { ok: bullets.length > 0 && quantified / bullets.length >= 0.5, msg: `At least half of the bullets contain numbers (${quantified}/${bullets.length})` },
    { ok: bullets.length > 0 && verbs / bullets.length >= 0.6, msg: `Bullets start with strong action verbs (${verbs}/${bullets.length})` },
    { ok: !badDates.length, msg: badDates.length ? `End date before start date: ${badDates.map((w) => w.name).join(', ')}` : 'Dates are in order' },
    { ok: r.skills.length > 0, msg: 'Skills section present' },
    { ok: words >= 250 && words <= 900, msg: `Length 250–900 words, roughly 1–2 pages (now ${words})` },
  ]
}

const STOP = new Set('a an the and or for to of in on at by with from as is are be will you your we our this that it its their they who what which have has can able using use work team teams role about into across within plus more other per must should strong experience years year etc including hiring hire join looking ideal candidate company great'.split(' '))

/** Most frequent meaningful words of a job description and whether the resume mentions them. */
export function keywordMatch(resume: string, jd: string, top = 20): { word: string; found: boolean }[] {
  const freq = new Map<string, number>()
  for (const w of jd.toLowerCase().match(/[a-z][a-z0-9+#.-]*[a-z0-9+#]|[a-z]/g) ?? []) {
    if (w.length < 3 || STOP.has(w)) continue
    freq.set(w, (freq.get(w) ?? 0) + 1)
  }
  const text = resume.toLowerCase()
  return [...freq]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, top)
    .map(([word]) => ({ word, found: new RegExp(`(^|[^a-z0-9])${word.replace(/[.+#-]/g, '\\$&')}($|[^a-z0-9])`).test(text) }))
}

/** Converts to the public JSON Resume schema (jsonresume.org). */
export function toJsonResume(r: Resume) {
  return {
    basics: { ...r.basics, location: { address: r.basics.location } },
    work: r.work.map(({ name, position, location, startDate, endDate, highlights }) => ({ name, position, location, startDate, endDate, highlights: lines(highlights) })),
    education: r.education.map(({ institution, area, studyType, startDate, endDate, score }) => ({ institution, area, studyType, startDate, endDate, score })),
    skills: r.skills.map((s) => ({ name: s.name, keywords: s.keywords.split(',').map((k) => k.trim()).filter(Boolean) })),
    projects: r.projects.map(({ name, description, url }) => ({ name, description, url })),
    certificates: lines(r.certificates).map((name) => ({ name })),
    languages: r.languages.split(',').map((l) => l.trim()).filter(Boolean).map((language) => ({ language })),
  }
}

type J = Record<string, unknown>
const str = (v: unknown) => (typeof v === 'string' ? v : '')
const arr = (v: unknown): J[] => (Array.isArray(v) ? (v as J[]) : [])

/** Reads a JSON Resume document (or this tool's own backup) into the editor model. */
export function fromJsonResume(j: J, id: () => string): Resume {
  const b = (j.basics ?? {}) as J
  const loc = b.location as J | string | undefined
  return {
    basics: {
      name: str(b.name), label: str(b.label), email: str(b.email), phone: str(b.phone), url: str(b.url) || str(b.website), summary: str(b.summary),
      location: typeof loc === 'string' ? loc : [str(loc?.address), str(loc?.city), str(loc?.region), str(loc?.countryCode)].filter(Boolean).join(', '),
    },
    work: arr(j.work).map((w) => ({ id: id(), name: str(w.name) || str(w.company), position: str(w.position), location: str(w.location), startDate: str(w.startDate), endDate: str(w.endDate), highlights: Array.isArray(w.highlights) ? (w.highlights as string[]).join('\n') : str(w.highlights) || str(w.summary) })),
    education: arr(j.education).map((e) => ({ id: id(), institution: str(e.institution), studyType: str(e.studyType), area: str(e.area), startDate: str(e.startDate), endDate: str(e.endDate), score: str(e.score) })),
    skills: arr(j.skills).map((s) => ({ id: id(), name: str(s.name), keywords: Array.isArray(s.keywords) ? (s.keywords as string[]).join(', ') : str(s.keywords) })),
    projects: arr(j.projects).map((p) => ({ id: id(), name: str(p.name), description: str(p.description), url: str(p.url) })),
    certificates: Array.isArray(j.certificates) ? arr(j.certificates).map((c) => str(c.name)).join('\n') : str(j.certificates),
    languages: Array.isArray(j.languages) ? arr(j.languages).map((l) => [str(l.language), str(l.fluency)].filter(Boolean).join(' — ')).join(', ') : str(j.languages),
  }
}
