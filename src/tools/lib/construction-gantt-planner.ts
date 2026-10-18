// Construction Gantt Planner logic: critical path method (forward/backward pass with FS/SS/FF/SF links
// and lags, total and free float) in working-day units, plus a working calendar built on the
// deadline-calculator holiday/business-day helpers.
import { add, isBusiness, parseCustom, ukEnglandWales, usFederal, type Cal } from './deadline-calculator'

export type LinkType = 'FS' | 'SS' | 'FF' | 'SF'
export interface Dep { id: string; type: LinkType; lag: number }
export interface Task {
  id: string
  name: string
  /** Working days; 0 = milestone. */
  dur: number
  deps: Dep[]
  /** Start-no-earlier-than, as a working-day index (set by dragging). */
  snet: number | null
  phase: string
  progress: number
}

export interface Sched { es: number; ef: number; ls: number; lf: number; tf: number; ff: number; critical: boolean }
export interface CpmResult { sched: Map<string, Sched>; finish: number; order: string[]; error: string }

/** Topological order (Kahn); null on a dependency cycle. */
export function topo(tasks: Task[]): string[] | null {
  const ids = new Set(tasks.map((t) => t.id))
  const indeg = new Map(tasks.map((t) => [t.id, 0]))
  const succ = new Map<string, string[]>(tasks.map((t) => [t.id, []]))
  for (const t of tasks) for (const d of t.deps) if (ids.has(d.id)) {
    indeg.set(t.id, indeg.get(t.id)! + 1)
    succ.get(d.id)!.push(t.id)
  }
  const q = tasks.filter((t) => indeg.get(t.id) === 0).map((t) => t.id)
  const out: string[] = []
  while (q.length) {
    const id = q.shift()!
    out.push(id)
    for (const s of succ.get(id)!) {
      indeg.set(s, indeg.get(s)! - 1)
      if (indeg.get(s) === 0) q.push(s)
    }
  }
  return out.length === tasks.length ? out : null
}

/** Earliest start a task may have given only its predecessors (ignores its own SNET). */
function depStart(t: Task, es: Map<string, number>, ef: Map<string, number>): number {
  let s = 0
  for (const d of t.deps) {
    if (!es.has(d.id)) continue
    const pS = es.get(d.id)!, pF = ef.get(d.id)!
    const v = d.type === 'FS' ? pF + d.lag : d.type === 'SS' ? pS + d.lag : d.type === 'FF' ? pF + d.lag - t.dur : pS + d.lag - t.dur
    s = Math.max(s, v)
  }
  return s
}

export function cpm(tasks: Task[]): CpmResult {
  const order = topo(tasks)
  const sched = new Map<string, Sched>()
  if (!order) return { sched, finish: 0, order: [], error: 'Dependency loop: a task depends (indirectly) on itself.' }
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const es = new Map<string, number>(), ef = new Map<string, number>()
  for (const id of order) {
    const t = byId.get(id)!
    const s = Math.max(depStart(t, es, ef), t.snet ?? 0)
    es.set(id, s)
    ef.set(id, s + t.dur)
  }
  const finish = Math.max(0, ...ef.values())
  const succ = new Map<string, { t: Task; d: Dep }[]>(tasks.map((t) => [t.id, []]))
  for (const t of tasks) for (const d of t.deps) succ.get(d.id)?.push({ t, d })
  const ls = new Map<string, number>(), lf = new Map<string, number>()
  for (const id of [...order].reverse()) {
    const t = byId.get(id)!
    let f = finish
    for (const { t: s, d } of succ.get(id)!) {
      const sLS = ls.get(s.id)!, sLF = lf.get(s.id)!
      const v = d.type === 'FS' ? sLS - d.lag : d.type === 'SS' ? sLS - d.lag + t.dur : d.type === 'FF' ? sLF - d.lag : sLF - d.lag + t.dur
      f = Math.min(f, v)
    }
    lf.set(id, f)
    ls.set(id, f - t.dur)
  }
  for (const id of order) {
    const e = es.get(id)!, x = ef.get(id)!
    let ff = finish - x
    for (const { t: s, d } of succ.get(id)!) {
      const sES = es.get(s.id)!, sEF = ef.get(s.id)!
      const v = d.type === 'FS' ? sES - d.lag - x : d.type === 'SS' ? sES - d.lag - e : d.type === 'FF' ? sEF - d.lag - x : sEF - d.lag - e
      ff = Math.min(ff, v)
    }
    const tf = ls.get(id)! - e
    sched.set(id, { es: e, ef: x, ls: ls.get(id)!, lf: lf.get(id)!, tf, ff: Math.max(0, Math.min(ff, tf)), critical: tf <= 0 })
  }
  return { sched, finish, order, error: '' }
}

/** Earliest start from dependencies alone (used when dragging: earlier than this is impossible). */
export function earliestFromDeps(tasks: Task[], id: string): number {
  const r = cpm(tasks.map((t) => (t.id === id ? { ...t, snet: null } : t)))
  return r.sched.get(id)?.es ?? 0
}

// ---------- predecessor text, e.g. "2, 3SS+2, 5FF-1" (row numbers) ----------

export function parseDeps(text: string, tasks: Task[], self: string): { deps: Dep[]; bad: string[] } {
  const deps: Dep[] = [], bad: string[] = []
  for (const raw of text.split(/[,;]+/).map((s) => s.trim()).filter(Boolean)) {
    const m = /^(\d+)\s*(FS|SS|FF|SF)?\s*(?:([+-])\s*(\d+)\s*d?)?$/i.exec(raw)
    const t = m ? tasks[Number(m[1]) - 1] : undefined
    if (!m || !t || t.id === self) { bad.push(raw); continue }
    deps.push({ id: t.id, type: (m[2]?.toUpperCase() ?? 'FS') as LinkType, lag: m[4] ? Number(m[4]) * (m[3] === '-' ? -1 : 1) : 0 })
  }
  return { deps, bad }
}

export function formatDeps(deps: Dep[], tasks: Task[]): string {
  return deps.map((d) => {
    const i = tasks.findIndex((t) => t.id === d.id)
    if (i < 0) return ''
    const typ = d.type === 'FS' && !d.lag ? '' : d.type
    return `${i + 1}${typ}${d.lag ? (d.lag > 0 ? '+' : '') + d.lag : ''}`
  }).filter(Boolean).join(', ')
}

// ---------- working calendar ----------

export type HolidaySet = 'none' | 'us' | 'uk'
export function buildCal(weekend: number[], set: HolidaySet, custom: string, startYear: number, years = 4): Cal {
  const holidays = new Map<string, string>()
  for (let y = startYear - 1; y <= startYear + years; y++) {
    const list = set === 'us' ? usFederal(y) : set === 'uk' ? ukEnglandWales(y) : []
    for (const h of list) holidays.set(h.date, h.name)
  }
  for (const h of parseCustom(custom).list) holidays.set(h.date, h.name)
  return { weekend, holidays }
}

/** Working-day index ⇄ ISO date map from the project start. */
export class WorkCal {
  private days: string[] = []
  private index = new Map<string, number>()
  start: string
  cal: Cal
  constructor(start: string, cal: Cal) {
    this.start = start
    this.cal = cal
    let d = start
    for (let i = 0; i < 3000 && !isBusiness(d, cal); i++) d = add(d, 1)
    this.first = d
  }
  first: string
  private grow(n: number) {
    let d = this.days.length ? add(this.days[this.days.length - 1], 1) : this.first
    while (this.days.length <= n) {
      if (isBusiness(d, this.cal)) {
        this.index.set(d, this.days.length)
        this.days.push(d)
      }
      d = add(d, 1)
    }
  }
  /** Date of working day n (n ≥ 0). */
  date(n: number): string {
    if (n < 0) return add(this.first, n)
    this.grow(n)
    return this.days[n]
  }
  /** Working-day index of a date (non-working dates roll forward). */
  indexOf(d: string): number {
    if (d <= this.first) return 0
    let x = d
    for (let i = 0; i < 400 && !isBusiness(x, this.cal); i++) x = add(x, 1)
    while (!this.index.has(x) && (this.days.length === 0 || this.days[this.days.length - 1] < x)) this.grow(this.days.length + 64)
    return this.index.get(x) ?? 0
  }
  /** Inclusive finish date of a task occupying [es, ef). Milestones finish on their start date. */
  finishDate(es: number, ef: number): string {
    return ef > es ? this.date(ef - 1) : this.date(es)
  }
}
