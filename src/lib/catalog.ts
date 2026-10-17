// Catalog model: the 1000 tools parsed from data/tools.md, their derived facets, filters and paging.

export interface RawCat {
  id: number
  name: string
  slug: string
  libs: string[]
}

export interface RawTool {
  n: number
  slug: string
  name: string
  cat: number
  dim: '2D' | '3D'
  desc: string
  build: string
}

export type Kind =
  | 'calculator' | 'tracker' | 'converter' | 'planner' | 'generator' | 'visualizer'
  | 'editor' | 'analyzer' | 'learning' | 'timer' | 'reference' | 'utility'

export interface Tool extends RawTool {
  kind: Kind
  tech: string[]
}

/** Tool types, in the order the filter shows them. */
export const KINDS: Record<Kind, string> = {
  calculator: 'Calculators',
  converter: 'Converters',
  tracker: 'Trackers & logs',
  planner: 'Planners & designers',
  generator: 'Generators',
  visualizer: 'Visualizers & simulators',
  editor: 'Editors',
  analyzer: 'Analyzers & checkers',
  learning: 'Learning & practice',
  timer: 'Timers & counters',
  reference: 'Reference',
  utility: 'Utilities',
}

const KIND_RULES: [RegExp, Kind][] = [
  [/calculator|estimator|calc\b|cost|budget\b|payoff|projection|sizer|sizing|load\b|yield/i, 'calculator'],
  [/converter|conversion|transl|scaler|resizer|compressor|encoder|decoder/i, 'converter'],
  [/tracker|log\b|logger|journal|diary|record|inventory|register|ledger|history|monitor/i, 'tracker'],
  [/planner|scheduler|designer|builder|layout|organizer|roster|calendar|itinerary|chart maker/i, 'planner'],
  [/generator|maker|creator|composer|randomizer|picker/i, 'generator'],
  [/viewer|visuali[sz]er|simulat|explorer|3d|globe|model|preview|sandbox|orbit|planetarium/i, 'visualizer'],
  [/editor|annotat|drawing|paint|sketch|whiteboard|redact|merger|splitter|cropper/i, 'editor'],
  [/analy[sz]er|checker|inspector|validator|tester|audit|detector|meter\b|finder|comparison|compare|diff/i, 'analyzer'],
  [/trainer|quiz|flashcard|practice|tutor|drill|lesson|learn|game|reader/i, 'learning'],
  [/timer|clock|stopwatch|metronome|counter|countdown|pomodoro|tally/i, 'timer'],
  [/guide|reference|lookup|table|dictionary|glossary|chart\b|cheat/i, 'reference'],
]

export function kindOf(name: string): Kind {
  for (const [re, k] of KIND_RULES) if (re.test(name)) return k
  return 'utility'
}

/** Notable browser technologies, detected from each tool's build notes. */
export const TECH: [string, RegExp][] = [
  ['Three.js', /three\.js|3d|webgl/i],
  ['Charts', /chart|plot|graph|histogram/i],
  ['Canvas', /canvas/i],
  ['SVG', /\bsvg\b/i],
  ['Web Audio', /web audio|audio|oscillator|microphone|mic\b|tone\.js/i],
  ['Maps', /leaflet|map tiles|geojson|turf/i],
  ['Camera & sensors', /camera|getusermedia|webcam|deviceorientation|geolocation|accelerometer|barcodedetector/i],
  ['Files & PDF', /pdf|file|docx|zip|import|csv|xlsx|sheetjs/i],
  ['Offline storage', /indexeddb|localstorage|dexie/i],
  ['WebAssembly', /wasm|webassembly|pyodide|sql\.js|duckdb|ffmpeg/i],
  ['AI in browser', /transformers\.js|tensorflow|mediapipe|tesseract|ocr|model\b/i],
  ['Web Worker', /worker/i],
  ['Speech', /speech|speak|voice/i],
]

export function techOf(build: string): string[] {
  return TECH.filter(([, re]) => re.test(build)).map(([k]) => k)
}

export function classify(r: RawTool): Tool {
  return { ...r, kind: kindOf(r.name), tech: techOf(r.build) }
}

// ---------- filters ----------

export type Sort = 'featured' | 'newest' | 'az' | 'za' | 'number' | 'category'

export interface Filters {
  q: string
  cat: number
  kind: Kind | ''
  dim: '' | '2D' | '3D'
  tech: string
  status: '' | 'ready' | 'soon'
  fav: boolean
  recent: boolean
  sort: Sort
  page: number
}

export const DEFAULT_FILTERS: Filters = { q: '', cat: 0, kind: '', dim: '', tech: '', status: '', fav: false, recent: false, sort: 'featured', page: 1 }

export function filtersToQuery(f: Filters): string {
  const p = new URLSearchParams()
  if (f.q) p.set('q', f.q)
  if (f.cat) p.set('cat', String(f.cat))
  if (f.kind) p.set('kind', f.kind)
  if (f.dim) p.set('dim', f.dim)
  if (f.tech) p.set('tech', f.tech)
  if (f.status) p.set('status', f.status)
  if (f.fav) p.set('fav', '1')
  if (f.recent) p.set('recent', '1')
  if (f.sort !== 'featured') p.set('sort', f.sort)
  if (f.page > 1) p.set('page', String(f.page))
  return p.toString()
}

export function queryToFilters(q: string): Filters {
  const p = new URLSearchParams(q)
  const pick = <T extends string>(v: string | null, ok: readonly T[], d: T): T => (v && (ok as readonly string[]).includes(v) ? (v as T) : d)
  return {
    q: p.get('q') ?? '',
    cat: Math.max(0, Math.floor(Number(p.get('cat')) || 0)),
    kind: pick(p.get('kind'), Object.keys(KINDS) as Kind[], '' as Kind | ''),
    dim: pick(p.get('dim'), ['2D', '3D'] as const, ''),
    tech: p.get('tech') ?? '',
    status: pick(p.get('status'), ['ready', 'soon'] as const, ''),
    fav: p.get('fav') === '1',
    recent: p.get('recent') === '1',
    sort: pick(p.get('sort'), ['featured', 'newest', 'az', 'za', 'number', 'category'] as const, 'featured'),
    page: Math.max(1, Math.floor(Number(p.get('page')) || 1)),
  }
}

/** Lower-cased, accent-free text for search. */
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

export function matches(t: Tool, q: string, catName = ''): boolean {
  const words = norm(q).split(/\s+/).filter(Boolean)
  if (!words.length) return true
  const hay = norm(`${t.name} ${t.desc} ${t.build} ${catName} #${t.n}`)
  return words.every((w) => hay.includes(w))
}

/** Interleaves tools so that consecutive items come from different categories. */
export function roundRobin(list: Tool[]): Tool[] {
  const groups = new Map<number, Tool[]>()
  for (const t of list) {
    const g = groups.get(t.cat)
    if (g) g.push(t)
    else groups.set(t.cat, [t])
  }
  const qs = [...groups.values()]
  const out: Tool[] = []
  for (let i = 0; out.length < list.length; i++) for (const q of qs) if (i < q.length) out.push(q[i])
  return out
}

export interface Mine {
  fav: string[]
  recent: string[]
}

export function filterTools(
  all: Tool[], f: Filters, ready: (slug: string) => boolean, mine: Mine,
  catName: (id: number) => string = () => '', added: Record<string, string> = {},
): Tool[] {
  let list = all
  if (f.fav) list = mine.fav.map((s) => all.find((t) => t.slug === s)).filter((t): t is Tool => !!t)
  else if (f.recent) list = mine.recent.map((s) => all.find((t) => t.slug === s)).filter((t): t is Tool => !!t)
  list = list.filter(
    (t) =>
      (!f.cat || t.cat === f.cat) &&
      (!f.kind || t.kind === f.kind) &&
      (!f.dim || t.dim === f.dim) &&
      (!f.tech || t.tech.includes(f.tech)) &&
      (!f.status || (f.status === 'ready') === ready(t.slug)) &&
      matches(t, f.q, catName(t.cat)),
  )
  if (f.fav || f.recent) return list
  switch (f.sort) {
    case 'az':
      return [...list].sort((a, b) => a.name.localeCompare(b.name))
    case 'za':
      return [...list].sort((a, b) => b.name.localeCompare(a.name))
    case 'number':
      return [...list].sort((a, b) => a.n - b.n)
    case 'newest':
      // Most recently built first, then the rest in catalog order.
      return [...list].sort((a, b) => (added[b.slug] ?? '').localeCompare(added[a.slug] ?? '') || a.n - b.n)
    case 'category':
      return [...list].sort((a, b) => a.cat - b.cat || a.n - b.n)
    default: {
      // Working tools first, each group mixed across categories.
      const r = list.filter((t) => ready(t.slug))
      const s = list.filter((t) => !ready(t.slug))
      return [...roundRobin(r), ...roundRobin(s)]
    }
  }
}

export const PAGE_SIZE = 50

export function paginate<T>(list: T[], page: number, size = PAGE_SIZE) {
  const pages = Math.max(1, Math.ceil(list.length / size))
  const p = Math.min(Math.max(1, page), pages)
  return { items: list.slice((p - 1) * size, p * size), page: p, pages }
}

/** Page buttons: first, last and current ±2; 0 marks a gap. */
export function pageList(page: number, pages: number): number[] {
  const out: number[] = []
  for (let i = 1; i <= pages; i++) {
    if (i === 1 || i === pages || Math.abs(i - page) <= 2) out.push(i)
    else if (out[out.length - 1] !== 0) out.push(0)
  }
  return out
}
