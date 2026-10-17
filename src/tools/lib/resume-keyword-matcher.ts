// Resume text extraction (PDF, DOCX) and job-description keyword matching.
import { unescapeXml, unzip } from './excel-to-csv'

// ---------- PDF text extraction (best effort, no pdf.js) ----------

const latin1 = (b: Uint8Array) => {
  let s = ''
  for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode(...b.subarray(i, i + 8192))
  return s
}
const bytesOf = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0) & 255)

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  // zlib stream; tolerate truncated/garbage tails by collecting what decoded before an error
  const ds = new DecompressionStream('deflate')
  const w = ds.writable.getWriter()
  void w.write(data as Uint8Array<ArrayBuffer>).catch(() => undefined)
  void w.close().catch(() => undefined)
  const r = ds.readable.getReader()
  const parts: Uint8Array[] = []
  try {
    for (;;) {
      const { done, value } = await r.read()
      if (done) break
      parts.push(value)
    }
  } catch {
    /* keep partial output */
  }
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0))
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}

interface Obj { dict: string; stream?: Uint8Array }

/** Maps character codes to Unicode text from a ToUnicode CMap. */
export function parseCMap(src: string): { map: Map<number, string>; bytes: number } {
  const map = new Map<number, string>()
  const hexStr = (h: string) => {
    let s = ''
    for (let i = 0; i + 4 <= h.length; i += 4) s += String.fromCharCode(parseInt(h.slice(i, i + 4), 16))
    if (h.length === 2) s = String.fromCharCode(parseInt(h, 16))
    return s
  }
  let bytes = 1
  const cs = /begincodespacerange\s*<([0-9a-f]+)>/i.exec(src)
  if (cs) bytes = cs[1].length / 2
  for (const blk of src.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const m of blk[1].matchAll(/<([0-9a-f]+)>\s*<([0-9a-f]*)>/gi)) map.set(parseInt(m[1], 16), hexStr(m[2]))
  }
  for (const blk of src.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const m of blk[1].matchAll(/<([0-9a-f]+)>\s*<([0-9a-f]+)>\s*(<[0-9a-f]*>|\[[^\]]*\])/gi)) {
      const lo = parseInt(m[1], 16), hi = parseInt(m[2], 16)
      if (hi - lo > 65535) continue
      if (m[3].startsWith('[')) {
        const items = [...m[3].matchAll(/<([0-9a-f]*)>/gi)].map((x) => hexStr(x[1]))
        items.forEach((t, i) => map.set(lo + i, t))
      } else {
        const base = m[3].slice(1, -1)
        const head = base.slice(0, -4)
        const last = parseInt(base.slice(-4) || '0', 16)
        for (let c = lo; c <= hi; c++) map.set(c, hexStr(head) + String.fromCharCode(last + c - lo))
      }
    }
  }
  return { map, bytes }
}

const WIN: Record<number, string> = { 0x91: '‘', 0x92: '’', 0x93: '“', 0x94: '”', 0x95: '•', 0x96: '–', 0x97: '—', 0x85: '…', 0x80: '€', 0x99: '™' }

/** Decodes a PDF literal string body (without the outer parentheses). */
function literal(s: string): number[] {
  const out: number[] = []
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c !== '\\') {
      out.push(c.charCodeAt(0) & 255)
      continue
    }
    const n = s[++i]
    const esc: Record<string, number> = { n: 10, r: 13, t: 9, b: 8, f: 12, '(': 40, ')': 41, '\\': 92 }
    if (n in esc) out.push(esc[n])
    else if (/[0-7]/.test(n)) {
      let oct = n
      while (oct.length < 3 && /[0-7]/.test(s[i + 1] ?? '')) oct += s[++i]
      out.push(parseInt(oct, 8) & 255)
    } else if (n === '\r' || n === '\n') {
      if (n === '\r' && s[i + 1] === '\n') i++
    } else if (n !== undefined) out.push(n.charCodeAt(0) & 255)
  }
  return out
}

/** Extracts the text of a content stream given font-name → CMap lookups. */
export function contentText(src: string, fonts: Map<string, { map: Map<number, string>; bytes: number }>): string {
  let out = ''
  let font: { map: Map<number, string>; bytes: number } | undefined
  let lastY: number | null = null
  const ops: string[] = []
  const decode = (codes: number[]) => {
    if (!font) return codes.map((c) => WIN[c] ?? String.fromCharCode(c)).join('')
    let s = ''
    for (let i = 0; i < codes.length; i += font.bytes) {
      let code = 0
      for (let k = 0; k < font.bytes; k++) code = (code << 8) | (codes[i + k] ?? 0)
      s += font.map.get(code) ?? (font.bytes === 1 ? (WIN[code] ?? String.fromCharCode(code)) : '')
    }
    return s
  }
  const re = /\((?:\\[\s\S]|[^\\)(]|\((?:\\[\s\S]|[^\\)])*\))*\)|<[0-9a-fA-F\s]*>|\[|\]|\/[^\s/[\]()<>]+|[-+]?\d*\.?\d+|[A-Za-z'"*]+/g
  let arr: (number[] | number)[] | null = null
  const stack: (string | number[] | number)[] = []
  const nl = () => {
    if (out && !out.endsWith('\n')) out += '\n'
  }
  for (const m of src.matchAll(re)) {
    const t = m[0]
    if (t[0] === '(') {
      const codes = literal(t.slice(1, -1))
      if (arr) arr.push(codes)
      else stack.push(codes)
    } else if (t[0] === '<') {
      const h = t.slice(1, -1).replace(/\s/g, '')
      const codes: number[] = []
      for (let i = 0; i < h.length; i += 2) codes.push(parseInt(h.slice(i, i + 2).padEnd(2, '0'), 16))
      if (arr) arr.push(codes)
      else stack.push(codes)
    } else if (t === '[') arr = []
    else if (t === ']') {
      if (arr) stack.push(arr as unknown as number[])
      ops.push('arr')
      arr = null
    } else if (t[0] === '/') stack.push(t)
    else if (/^[-+]?\d*\.?\d+$/.test(t)) {
      if (arr) arr.push(Number(t))
      else stack.push(Number(t))
    } else {
      // operator
      if (t === 'Tf') {
        const name = stack[stack.length - 2]
        font = typeof name === 'string' ? fonts.get(name.slice(1)) : undefined
      } else if (t === 'Tj' || t === "'" || t === '"') {
        if (t !== 'Tj') nl()
        const v = stack[stack.length - 1]
        if (Array.isArray(v)) out += decode(v as number[])
      } else if (t === 'TJ') {
        const v = stack[stack.length - 1] as unknown as (number[] | number)[]
        if (Array.isArray(v)) for (const part of v) {
          if (typeof part === 'number') {
            if (part < -180 && !out.endsWith(' ')) out += ' '
          } else out += decode(part)
        }
      } else if (t === 'Td' || t === 'TD' || t === 'Tm') {
        const y = Number(stack[stack.length - 1])
        const ty: number = t === 'Tm' ? y : (lastY ?? 0) + y
        if (t === 'Tm' ? lastY !== null && Math.abs(y - lastY) > 1 : Math.abs(y) > 1) nl()
        else if (out && !/\s$/.test(out)) out += ' '
        lastY = ty
      } else if (t === 'T*') nl()
      else if (t === 'ET') {
        if (out && !/\s$/.test(out)) out += ' '
      }
      stack.length = 0
    }
  }
  return out
}

export async function extractPdfText(buf: Uint8Array): Promise<string> {
  const raw = latin1(buf)
  if (!raw.startsWith('%PDF')) throw new Error('Not a PDF file')
  const objs = new Map<number, Obj>()
  const parseObj = async (body: string): Promise<Obj> => {
    const si = body.search(/stream\r?\n/)
    if (si < 0) return { dict: body }
    const dict = body.slice(0, si)
    let data = body.slice(si).replace(/^stream\r?\n/, '')
    data = data.replace(/\r?\n?endstream[\s\S]*$/, '')
    const lenM = /\/Length\s+(\d+)(?!\s+\d+\s+R)/.exec(dict)
    if (lenM && +lenM[1] <= data.length) data = data.slice(0, +lenM[1])
    let stream: Uint8Array = bytesOf(data)
    if (/\/FlateDecode|\/Fl\b/.test(dict)) stream = await inflate(stream)
    else if (/\/Filter/.test(dict)) stream = new Uint8Array() // images etc.
    return { dict, stream }
  }
  for (const m of raw.matchAll(/(\d+)\s+\d+\s+obj\b([\s\S]*?)endobj/g)) objs.set(+m[1], await parseObj(m[2]))
  // compressed object streams
  for (const o of [...objs.values()]) {
    if (!/\/Type\s*\/ObjStm/.test(o.dict) || !o.stream) continue
    const n = Number(/\/N\s+(\d+)/.exec(o.dict)?.[1] ?? 0)
    const first = Number(/\/First\s+(\d+)/.exec(o.dict)?.[1] ?? 0)
    const s = latin1(o.stream)
    const nums = s.slice(0, first).trim().split(/\s+/).map(Number)
    for (let i = 0; i < n; i++) {
      const start = first + nums[i * 2 + 1]
      const end = i + 1 < n ? first + nums[i * 2 + 3] : s.length
      if (!objs.has(nums[i * 2])) objs.set(nums[i * 2], { dict: s.slice(start, end) })
    }
  }
  const ref = (s: string | undefined) => (s ? Number(/(\d+)\s+\d+\s+R/.exec(s)?.[1]) : NaN)
  const dictOf = (v: string): string => {
    const r = /^\s*(\d+)\s+\d+\s+R/.exec(v)
    return r ? (objs.get(+r[1])?.dict ?? '') : v
  }
  const sub = (dict: string, key: string): string | undefined => {
    const i = dict.indexOf(`/${key}`)
    if (i < 0) return undefined
    let j = i + key.length + 1
    while (/\s/.test(dict[j])) j++
    if (dict.startsWith('<<', j)) {
      let depth = 0
      for (let k = j; k < dict.length - 1; k++) {
        if (dict.startsWith('<<', k)) { depth++; k++ } else if (dict.startsWith('>>', k)) { depth--; k++; if (!depth) return dict.slice(j, k + 1) }
      }
      return dict.slice(j)
    }
    const m = /^(\d+\s+\d+\s+R|\[[^\]]*\]|\/\S+|[^/>\s]+)/.exec(dict.slice(j))
    return m?.[1]
  }
  const cmapCache = new Map<number, { map: Map<number, string>; bytes: number }>()
  const fontsFor = (page: string) => {
    const fonts = new Map<string, { map: Map<number, string>; bytes: number }>()
    let node: string | undefined = page
    let res: string | undefined
    for (let guard = 0; node && !res && guard < 20; guard++) {
      res = sub(node, 'Resources')
      if (!res) node = objs.get(ref(sub(node, 'Parent')))?.dict
    }
    const fd = res ? sub(dictOf(res), 'Font') : undefined
    if (!fd) return fonts
    const fdict = dictOf(fd)
    for (const m of fdict.matchAll(/\/([^\s/<>[\]()]+)\s+(\d+)\s+\d+\s+R/g)) {
      const f = objs.get(+m[2])
      if (!f) continue
      const tu = ref(sub(f.dict, 'ToUnicode'))
      if (Number.isNaN(tu)) {
        if (/Identity-H/.test(f.dict)) fonts.set(m[1], { map: new Map(), bytes: 2 })
        continue
      }
      if (!cmapCache.has(tu)) {
        const st = objs.get(tu)?.stream
        cmapCache.set(tu, parseCMap(st ? latin1(st) : ''))
      }
      fonts.set(m[1], cmapCache.get(tu)!)
    }
    return fonts
  }
  const pages = [...objs.entries()].filter(([, o]) => /\/Type\s*\/Page(?!s)\b/.test(o.dict)).sort((a, b) => a[0] - b[0])
  // order pages by the page tree when possible
  const order: number[] = []
  const walk = (id: number, depth = 0) => {
    const o = objs.get(id)
    if (!o || depth > 30) return
    if (/\/Type\s*\/Page(?!s)\b/.test(o.dict)) return void order.push(id)
    const kids = sub(o.dict, 'Kids')
    if (kids) for (const k of kids.matchAll(/(\d+)\s+\d+\s+R/g)) walk(+k[1], depth + 1)
  }
  const root = [...objs.entries()].find(([, o]) => /\/Type\s*\/Pages\b/.test(o.dict) && !/\/Parent/.test(o.dict))
  if (root) walk(root[0])
  const ids = order.length === pages.length ? order : pages.map((p) => p[0])
  const texts: string[] = []
  for (const id of ids) {
    const page = objs.get(id)!.dict
    const fonts = fontsFor(page)
    const c = sub(page, 'Contents') ?? ''
    let src = ''
    for (const r of c.matchAll(/(\d+)\s+\d+\s+R/g)) {
      const o = objs.get(+r[1])
      if (o?.stream) src += latin1(o.stream) + '\n'
      else if (o && /^\s*\[/.test(o.dict)) for (const r2 of o.dict.matchAll(/(\d+)\s+\d+\s+R/g)) { const o2 = objs.get(+r2[1]); if (o2?.stream) src += latin1(o2.stream) + '\n' }
    }
    texts.push(contentText(src, fonts))
  }
  return texts.join('\n\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

export async function extractDocxText(buf: Uint8Array): Promise<string> {
  const files = await unzip(buf)
  const doc = files.get('word/document.xml')
  if (!doc) throw new Error('Not a .docx file (word/document.xml missing)')
  const xml = new TextDecoder().decode(doc)
  return xml
    .split(/<\/w:p>/)
    .map((p) => [...p.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\/>|<w:br\/>/g)].map((m) => (m[1] !== undefined ? unescapeXml(m[1]) : m[0].includes('tab') ? '\t' : '\n')).join(''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// ---------- keyword analysis ----------

const STOP = new Set(
  ('a about above after again against all also am an and any are as at be because been before being below between both but by can could did do does doing down during each etc ' +
    'few for from further had has have having he her here hers him his how i if in into is it its itself just me more most my no nor not now of off on once only or other our ours out over own ' +
    'same she should so some such than that the their them then there these they this those through to too under until up very was we were what when where which while who whom why will with ' +
    'would you your yours yourself able across along among including within without via per using use used well new strong excellent good great plus ideal ideally must may might shall ' +
    'role team teams company work working join looking candidate candidates position job opportunity responsibilities requirements required preferred qualifications experience experienced ' +
    'years year skills skill knowledge understanding ability abilities etc e.g i.e like help helping make makes making take part day days based level high highly key ensure ensuring ' +
    'senior junior mid principal staff build builds built maintain own evolve deep familiarity familiar thousands millions keep green fast similar others other various multiple ' +
    'want wants need needs needed seek seeking hiring hire love passionate passion exciting environment fully full time remote hybrid office salary benefits apply ' +
    'you’ll we’re you’re it’s don’t won’t can’t we’ll will be our us one two three four five six seven eight nine ten least least plus bonus nice').split(' '),
)

/** Single words that are almost always hard skills (boosted in ranking). */
const TECH = new Set(('javascript typescript python java kotlin swift go golang rust ruby php scala c++ c# .net sql nosql postgresql postgres mysql mongodb redis kafka spark hadoop ' +
  'react angular vue svelte redux next.js node.js express django flask spring rails laravel html css sass tailwind webpack vite jest playwright cypress selenium storybook figma ' +
  'docker kubernetes terraform ansible aws azure gcp linux git github gitlab jenkins graphql rest grpc d3 tableau looker excel powerpoint salesforce hubspot jira confluence ' +
  'seo sem ppc crm erp sap gdpr hipaa wcag tensorflow pytorch pandas numpy llm nlp ai ml ui ux qa api apis sdk ios android flutter unity blender autocad solidworks matlab').split(' '))
const SHORT_OK = new Set(['ai', 'ml', 'ui', 'ux', 'qa', 'go', 'c#', 'r', 'c', 'bi', 'hr', 'pr', 'ux/ui', 'ci', 'cd', 'ar', 'vr', 'os', 'it'])

/** Multi-word skills recognised as single keywords. */
const PHRASES = [
  'machine learning', 'deep learning', 'data analysis', 'data science', 'data visualization', 'project management', 'product management', 'stakeholder management', 'change management',
  'customer service', 'customer success', 'user experience', 'user research', 'design systems', 'design system', 'unit testing', 'end-to-end testing', 'test automation', 'continuous integration',
  'ci/cd', 'rest api', 'rest apis', 'restful api', 'graphql', 'web performance', 'accessibility', 'responsive design', 'cross-functional', 'agile', 'scrum', 'kanban', 'a/b testing',
  'google analytics', 'power bi', 'microsoft excel', 'sql server', 'amazon web services', 'google cloud', 'node.js', 'react native', 'next.js', 'vue.js', 'type script', 'version control',
  'code review', 'code reviews', 'problem solving', 'problem-solving', 'communication skills', 'team leadership', 'people management', 'financial modeling', 'supply chain', 'risk management',
  'business development', 'lead generation', 'content marketing', 'social media', 'search engine optimization', 'technical writing', 'state management', 'server-side rendering', 'micro frontends',
]

const norm = (w: string) => w.toLowerCase().replace(/[’']s$/, '').replace(/^[^a-z0-9#+.]+|[^a-z0-9#+]+$/g, '')
/** Very light stemmer so "APIs/API", "tests/testing/tested" match. */
export function stem(w: string): string {
  if (w.length <= 3 || /[#+.]/.test(w)) return w
  return w.replace(/(ies)$/, 'y').replace(/(ing|ed)$/, '').replace(/(es|s)$/, (m, _g, i: number) => (i > 2 && !/ss$/.test(w) ? '' : m))
}

export function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[“”"()[\]{}<>|•·●▪■–—]/g, ' ')
    .split(/[\s,;:!?]+|\/(?![a-z]{1,3}\b)/)
    .map(norm)
    .filter(Boolean)
}

export interface Keyword { term: string; key: string; weight: number; count: number; phrase: boolean }

/** Ranked keywords of a job description: skill phrases, repeated bigrams and meaningful single words. */
export function keywords(jd: string, max = 60): Keyword[] {
  const lower = ` ${jd.toLowerCase().replace(/\s+/g, ' ')} `
  const found = new Map<string, Keyword>()
  for (const p of PHRASES) {
    const re = new RegExp(`(?<![a-z0-9])${p.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}(?![a-z0-9])`, 'g')
    const n = (lower.match(re) ?? []).length
    if (n) found.set(p, { term: p, key: p.split(/\s+/).map(stem).join(' '), weight: n * 2.2, count: n, phrase: true })
  }
  const toks = tokens(jd)
  const uni = new Map<string, { term: string; n: number }>()
  const bi = new Map<string, { term: string; n: number }>()
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i]
    if (STOP.has(t) || !/[a-z]/.test(t) || (t.length < 3 && !SHORT_OK.has(t))) continue
    const k = stem(t)
    const u = uni.get(k) ?? { term: t, n: 0 }
    u.n++
    uni.set(k, u)
    const nx = toks[i + 1]
    if (nx && !STOP.has(nx) && /[a-z]/.test(nx) && (nx.length > 2 || SHORT_OK.has(nx))) {
      const bk = `${k} ${stem(nx)}`
      const b = bi.get(bk) ?? { term: `${t} ${nx}`, n: 0 }
      b.n++
      bi.set(bk, b)
    }
  }
  const inPhrase = (k: string) => [...found.values()].some((f) => f.key.split(' ').includes(k))
  for (const [k, b] of bi) if (b.n >= 2 && ![...found.values()].some((f) => f.key === k)) found.set(k, { term: b.term, key: k, weight: b.n * 1.8, count: b.n, phrase: true })
  for (const [k, u] of uni) {
    if (inPhrase(k) && u.n < 2) continue
    found.set(k, { term: u.term, key: k, weight: u.n * (TECH.has(u.term) || /[#+]|\.\w/.test(u.term) ? 1.6 : 1), count: u.n, phrase: false })
  }
  return [...found.values()].sort((a, b) => b.weight - a.weight || a.term.localeCompare(b.term)).slice(0, max)
}

export interface Match { kw: Keyword; inResume: number }

export function match(jd: string, resume: string, max = 60): { matches: Match[]; score: number } {
  const rToks = tokens(resume).map(stem)
  const rText = ` ${rToks.join(' ')} `
  const matches = keywords(jd, max).map((kw) => {
    const needle = ` ${kw.key} `
    let n = 0
    for (let i = rText.indexOf(needle); i >= 0; i = rText.indexOf(needle, i + 1)) n++
    return { kw, inResume: n }
  })
  const total = matches.reduce((a, m) => a + m.kw.weight, 0)
  const got = matches.reduce((a, m) => a + (m.inResume ? m.kw.weight : 0), 0)
  return { matches, score: total ? got / total : 0 }
}
