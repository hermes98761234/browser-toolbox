// Inclusive-language checks, gender-coded word analysis (Gaucher, Friesen & Kay 2011),
// readability and Markdown assembly for job descriptions.

export interface Finding { term: string; category: string; suggestion: string; count: number }

// [regex source, category, suggestion]
const RULES: [string, string, string][] = [
  ['rock ?stars?|ninjas?|gurus?|wizards?|superstars?|unicorns?', 'Jargon / bro-culture', 'Name the actual skill: "expert", "skilled", "experienced"'],
  ['salesman|salesmen', 'Gendered', 'salesperson, sales representative'],
  ['chairman', 'Gendered', 'chair, chairperson'],
  ['manpower', 'Gendered', 'workforce, staffing'],
  ['man-hours?|manhours?', 'Gendered', 'person-hours, work hours'],
  ['guys', 'Gendered', 'everyone, team, folks'],
  ['he or she|he/she|s/he', 'Gendered', 'they, you'],
  ['\\b(?:he|his|him)\\b', 'Gendered', 'they / their, or address the reader as "you"'],
  ['young|youthful', 'Age bias', 'Describe the work, not the person\'s age'],
  ['digital natives?', 'Age bias', 'comfortable with digital tools'],
  ['recent (?:college )?grad(?:uate)?s?', 'Age bias', 'early-career, or state the experience needed'],
  ['energetic|high-energy', 'Age bias', 'motivated, enthusiastic'],
  ['native (?:english )?speakers?', 'Exclusionary', 'fluent in English, excellent written English'],
  ['culture fit', 'Exclusionary', 'culture add, shares our values (list them)'],
  ['must be able to (?:lift|stand|walk)', 'Ability bias', 'Describe the task and say reasonable accommodations are available'],
  ['crazy|insane', 'Ableist', 'intense, surprising, wild'],
  ['sanity check', 'Ableist', 'quick check, confidence check'],
  ['blind spots?', 'Ableist', 'gap, overlooked area'],
  ['able-bodied', 'Ableist', 'Remove; describe the task instead'],
  ['work hard,? play hard', 'Exclusionary', 'Describe real working hours and culture'],
  ['clean-shaven|well-groomed', 'Exclusionary', 'Remove; may exclude religious and cultural groups'],
  ['aggressive', 'Masculine-coded', 'ambitious, proactive, driven'],
  ['dominant|dominate', 'Masculine-coded', 'lead, excel'],
  ['hacker', 'Jargon', 'engineer, developer'],
]

export function checkInclusive(text: string): Finding[] {
  const out: Finding[] = []
  for (const [src, category, suggestion] of RULES) {
    const re = new RegExp(`\\b(?:${src})\\b`, 'gi')
    const hits = text.match(re)
    if (hits) out.push({ term: [...new Set(hits.map((h) => h.toLowerCase()))].join(', '), category, suggestion, count: hits.length })
  }
  return out
}

const MASC = ['active', 'adventurous', 'aggress', 'ambitio', 'analy', 'assert', 'athlet', 'autonom', 'boast', 'challeng', 'compet', 'confident', 'courag', 'decisive', 'determin', 'dominant', 'force', 'greedy', 'headstrong', 'hierarch', 'hostil', 'impulsive', 'independen', 'individual', 'intellect', 'lead', 'logic', 'masculine', 'objective', 'opinion', 'outspoken', 'persist', 'principle', 'reckless', 'stubborn', 'superior', 'self-confiden', 'self-relian', 'self-sufficien']
const FEM = ['affectionate', 'child', 'cheer', 'commit', 'communal', 'compassion', 'connect', 'considerate', 'cooperat', 'depend', 'emotiona', 'empath', 'feminine', 'flatterable', 'gentle', 'honest', 'interpersonal', 'interdependen', 'kind', 'kinship', 'loyal', 'modesty', 'nag', 'nurtur', 'pleasant', 'polite', 'quiet', 'respon', 'sensitiv', 'submissive', 'support', 'sympath', 'tender', 'together', 'trust', 'understand', 'warm', 'whin', 'yield']
// Words that start with a stem but are not coded.
const EXCEPT = ['connecticut', 'kindle', 'childcare']

export function genderCoding(text: string): { masc: string[]; fem: string[]; verdict: string } {
  const words = text.toLowerCase().match(/[a-z][a-z-]*/g) ?? []
  const masc: string[] = [], fem: string[] = []
  for (const w of words) {
    if (EXCEPT.some((e) => w.startsWith(e))) continue
    if (MASC.some((s) => w.startsWith(s))) masc.push(w)
    else if (FEM.some((s) => w.startsWith(s))) fem.push(w)
  }
  const d = masc.length - fem.length
  const verdict = !masc.length && !fem.length ? 'Neutral' : d > 3 ? 'Strongly masculine-coded' : d > 0 ? 'Slightly masculine-coded' : d < -3 ? 'Strongly feminine-coded' : d < 0 ? 'Slightly feminine-coded' : 'Balanced'
  return { masc, fem, verdict }
}

export function syllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '')
  if (!w) return 0
  if (w.length <= 3) return 1
  const t = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '')
  return Math.max(1, (t.match(/[aeiouy]{1,2}/g) ?? []).length)
}

/** Flesch reading ease (higher = easier; 60–70 is plain English). */
export function flesch(text: string): { score: number; words: number; sentences: number } {
  const words = text.match(/[A-Za-z][A-Za-z'-]*/g) ?? []
  const sentences = Math.max(1, (text.match(/[^.!?\n]+[.!?\n]+/g) ?? []).filter((s) => /[a-z]/i.test(s)).length)
  if (!words.length) return { score: NaN, words: 0, sentences: 0 }
  const syl = words.reduce((a, w) => a + syllables(w), 0)
  return { score: 206.835 - 1.015 * (words.length / sentences) - 84.6 * (syl / words.length), words: words.length, sentences }
}

export interface Jd {
  title: string; company: string; location: string; workplace: string; type: string; salary: string
  about: string; summary: string; duties: string[]; must: string[]; nice: string[]; benefits: string[]; apply: string; eeo: string
}

const list = (xs: string[]) => xs.map((x) => x.trim()).filter(Boolean).map((x) => `- ${x}`).join('\n')

export function toMarkdown(j: Jd): string {
  const meta = [j.location && `**Location:** ${j.location}${j.workplace ? ` (${j.workplace})` : ''}`, j.type && `**Employment:** ${j.type}`, j.salary && `**Salary:** ${j.salary}`].filter(Boolean).join('  \n')
  const sec = (h: string, body: string) => (body.trim() ? `## ${h}\n\n${body.trim()}\n` : '')
  return [
    `# ${j.title || 'Job title'}${j.company ? ` at ${j.company}` : ''}\n`,
    meta ? meta + '\n' : '',
    sec(`About ${j.company || 'us'}`, j.about),
    sec('The role', j.summary),
    sec('What you will do', list(j.duties)),
    sec('What you bring', list(j.must)),
    sec('Nice to have', list(j.nice)),
    sec('What we offer', list(j.benefits)),
    sec('How to apply', j.apply),
    j.eeo.trim() ? `---\n\n_${j.eeo.trim()}_\n` : '',
  ].filter(Boolean).join('\n')
}

/** Very small Markdown → HTML for the preview/export (headings, lists, bold, italics, rules, paragraphs, hard breaks). */
export function mdToHtml(md: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const inline = (s: string) => esc(s.trim()).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/(^|\W)_(.+?)_(?=\W|$)/g, '$1<em>$2</em>')
  const out: string[] = []
  let list: string[] = [], para: string[] = []
  const flush = () => {
    if (list.length) out.push(`<ul>\n${list.map((l) => `<li>${inline(l)}</li>`).join('\n')}\n</ul>`)
    if (para.length) out.push(`<p>${para.map((l, i) => inline(l) + (i < para.length - 1 ? (/ {2}$/.test(l) ? '<br>' : ' ') : '')).join('')}</p>`)
    list = []
    para = []
  }
  for (const line of md.split('\n')) {
    const li = /^[-*] (.*)/.exec(line)
    if (li) { if (para.length) flush(); list.push(li[1]); continue }
    if (list.length) flush()
    if (/^#{1,3} /.test(line)) { flush(); const n = line.indexOf(' '); out.push(`<h${n}>${inline(line.slice(n + 1))}</h${n}>`) }
    else if (line.trim() === '---') { flush(); out.push('<hr>') }
    else if (!line.trim()) flush()
    else para.push(line)
  }
  flush()
  return out.join('\n')
}
