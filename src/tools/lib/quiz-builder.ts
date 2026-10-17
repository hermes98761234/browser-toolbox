// Quiz model, grading and compact URL encoding (deflate-raw + base64url when CompressionStream exists).

export type QType = 'single' | 'multi' | 'tf' | 'text'
export interface Question {
  id: string
  type: QType
  prompt: string
  options: string[] // choices (single/multi), ignored for tf/text
  correct: number[] // indices of correct options; tf: [0]=True [1]=False
  answers: string[] // accepted answers for text questions
  points: number
  explain: string
}
export interface Quiz {
  title: string
  intro: string
  pass: number // percent needed to pass
  shuffleQ: boolean
  shuffleO: boolean
  instant: boolean // show feedback after each question
  questions: Question[]
}
export type Answer = number[] | string

const TYPES: QType[] = ['single', 'multi', 'tf', 'text']

/** Normalises free text for comparison: case, accents, punctuation, extra spaces. */
export const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^\p{L}\p{N}\s.]/gu, ' ').replace(/\s+/g, ' ').trim()

/** Points earned (0..q.points). Multi-select gets partial credit: (right picks − wrong picks) / correct count. */
export function grade(q: Question, a: Answer | undefined): number {
  if (a === undefined) return 0
  if (q.type === 'text') {
    if (typeof a !== 'string') return 0
    const v = norm(a)
    return v && q.answers.some((x) => norm(x) === v) ? q.points : 0
  }
  if (!Array.isArray(a)) return 0
  if (q.type === 'multi') {
    const ok = new Set(q.correct)
    if (!ok.size) return 0
    const right = a.filter((i) => ok.has(i)).length
    const wrong = a.filter((i) => !ok.has(i)).length
    return Math.max(0, (right - wrong) / ok.size) * q.points
  }
  return a.length === 1 && q.correct[0] === a[0] ? q.points : 0
}

export function score(quiz: Quiz, answers: Record<string, Answer>) {
  const per = quiz.questions.map((q) => ({ q, got: grade(q, answers[q.id]) }))
  const max = quiz.questions.reduce((s, q) => s + q.points, 0)
  const got = per.reduce((s, p) => s + p.got, 0)
  const pct = max ? (got / max) * 100 : 0
  return { per, max, got, pct, passed: pct >= quiz.pass }
}

/** Returns a list of problems that make a quiz unanswerable. */
export function validate(quiz: Quiz): string[] {
  const out: string[] = []
  if (!quiz.questions.length) out.push('Add at least one question.')
  quiz.questions.forEach((q, i) => {
    const n = `Q${i + 1}`
    if (!q.prompt.trim()) out.push(`${n}: the question text is empty.`)
    if (q.type === 'single' || q.type === 'multi') {
      if (q.options.filter((o) => o.trim()).length < 2) out.push(`${n}: needs at least two options.`)
      if (!q.correct.length) out.push(`${n}: mark the correct option.`)
    }
    if (q.type === 'text' && !q.answers.some((a) => a.trim())) out.push(`${n}: add at least one accepted answer.`)
    if (!(q.points > 0)) out.push(`${n}: points must be above zero.`)
  })
  return out
}

// ---- compact packing ----
type Packed = [1, string, string, number, number, [number, string, string[], number[], string[], number, string][]]

export function pack(q: Quiz): Packed {
  const flags = (q.shuffleQ ? 1 : 0) | (q.shuffleO ? 2 : 0) | (q.instant ? 4 : 0)
  return [1, q.title, q.intro, flags, q.pass, q.questions.map((x) => [TYPES.indexOf(x.type), x.prompt, x.type === 'single' || x.type === 'multi' ? x.options : [], x.type === 'text' ? [] : x.correct, x.type === 'text' ? x.answers : [], x.points, x.explain])]
}

export function unpack(p: unknown): Quiz {
  if (!Array.isArray(p) || p[0] !== 1 || !Array.isArray(p[5])) throw new Error('Not a quiz link')
  const [, title, intro, flags, pass, qs] = p as Packed
  return {
    title: String(title ?? ''), intro: String(intro ?? ''), pass: Number(pass) || 0,
    shuffleQ: !!(flags & 1), shuffleO: !!(flags & 2), instant: !!(flags & 4),
    questions: qs.map((x, i) => ({
      id: `q${i}`, type: TYPES[x[0]] ?? 'single', prompt: String(x[1] ?? ''), options: (x[2] ?? []).map(String), correct: (x[3] ?? []).map(Number),
      answers: (x[4] ?? []).map(String), points: Number(x[5]) || 1, explain: String(x[6] ?? ''),
    })),
  }
}

const b64u = (b: Uint8Array) => {
  let s = ''
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000))
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const unb64u = (s: string) => {
  const b = s.replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(b + '='.repeat((4 - (b.length % 4)) % 4)), (c) => c.charCodeAt(0))
}
async function pipe(data: Uint8Array, t: CompressionStream | DecompressionStream) {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(t)
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/** Encodes a quiz for a URL: "z" + deflate-raw base64url, or "j" + plain base64url JSON as a fallback. */
export async function encodeQuiz(q: Quiz, allowCompression = true): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(pack(q)))
  if (allowCompression && typeof CompressionStream !== 'undefined') {
    try {
      return 'z' + b64u(await pipe(json, new CompressionStream('deflate-raw')))
    } catch {
      /* fall back */
    }
  }
  return 'j' + b64u(json)
}

export async function decodeQuiz(s: string): Promise<Quiz> {
  const kind = s[0], body = unb64u(s.slice(1))
  let bytes = body
  if (kind === 'z') {
    if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot decompress the quiz link')
    bytes = await pipe(body, new DecompressionStream('deflate-raw'))
  } else if (kind !== 'j') throw new Error('Unknown quiz link format')
  return unpack(JSON.parse(new TextDecoder().decode(bytes)))
}

/** Deterministic Fisher–Yates shuffle (seeded) so a retake can reshuffle. */
export function shuffled<T>(arr: T[], seed: number): T[] {
  const a = [...arr]
  let s = seed >>> 0 || 1
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0
    const j = s % (i + 1)
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export const SAMPLE: Quiz = {
  title: 'Solar System Basics',
  intro: 'Six quick questions about our cosmic neighbourhood. Good luck!',
  pass: 70, shuffleQ: false, shuffleO: true, instant: true,
  questions: [
    { id: 's1', type: 'single', prompt: 'Which planet is closest to the Sun?', options: ['Venus', 'Mercury', 'Mars', 'Earth'], correct: [1], answers: [], points: 1, explain: 'Mercury orbits at about 0.39 AU.' },
    { id: 's2', type: 'multi', prompt: 'Which of these are gas or ice giants? (select all that apply)', options: ['Jupiter', 'Mars', 'Neptune', 'Saturn', 'Venus'], correct: [0, 2, 3], answers: [], points: 2, explain: 'Jupiter and Saturn are gas giants; Uranus and Neptune are ice giants.' },
    { id: 's3', type: 'tf', prompt: 'Pluto is currently classified as a dwarf planet.', options: [], correct: [0], answers: [], points: 1, explain: 'The IAU reclassified Pluto in 2006.' },
    { id: 's4', type: 'text', prompt: 'What is the largest planet in the Solar System?', options: [], correct: [], answers: ['Jupiter'], points: 1, explain: 'Jupiter is more than twice as massive as all other planets combined.' },
    { id: 's5', type: 'single', prompt: 'Roughly how long does sunlight take to reach Earth?', options: ['8 seconds', '8 minutes', '8 hours', '8 days'], correct: [1], answers: [], points: 1, explain: '1 AU ÷ speed of light ≈ 499 s ≈ 8.3 minutes.' },
    { id: 's6', type: 'text', prompt: 'Name the red planet.', options: [], correct: [], answers: ['Mars', 'planet Mars'], points: 1, explain: 'Iron oxide dust gives Mars its colour.' },
  ],
}
