import { useEffect, useMemo, useRef, useState } from 'react'
import { Btn, color, CsvButton, download, JsonButtons, Note, Panel, Row, Seg, Select, Slider, Stat, Stats, Txt, Area, uid, useToolState } from '../kit'
import { add, toDate } from './lib/deadline-calculator'
import { buildCal, cpm, earliestFromDeps, formatDeps, parseDeps, WorkCal, type HolidaySet, type Task } from './lib/construction-gantt-planner'

type Weekend = 'satsun' | 'sun' | 'fri' | 'none'
interface Project {
  name: string
  start: string
  weekend: Weekend
  holidays: HolidaySet
  custom: string
  tasks: Task[]
  baseline: Record<string, [string, string]> | null
  baselineAt: string
}
const WEEKENDS: Record<Weekend, number[]> = { satsun: [0, 6], sun: [0], fri: [5, 6], none: [] }
const PHASES = ['Preconstruction', 'Site', 'Foundation', 'Structure', 'Envelope', 'MEP', 'Interior', 'Exterior', 'Closeout']

// Compact template rows: [name, duration, phase index, predecessors (row numbers, MS-Project style), progress %]
type Row5 = [string, number, number, string, number?]
const TEMPLATES: Record<string, [string, Row5[]]> = {
  house: ['Single-family house', [
    ['Permits & mobilization', 5, 0, '', 100], ['Site clearing & layout', 3, 1, '1', 100], ['Excavation', 4, 1, '2', 60], ['Footings: form, rebar, pour', 4, 2, '3'],
    ['Footing inspection', 0, 2, '4'], ['Foundation walls', 6, 2, '5'], ['Concrete curing', 7, 2, '6'], ['Waterproofing & drainage', 2, 2, '7'],
    ['Backfill & compaction', 2, 1, '8'], ['Underground plumbing', 3, 5, '6FS+2'], ['Slab on grade', 3, 2, '9, 10'], ['Framing: floors & walls', 12, 3, '11'],
    ['Roof framing & sheathing', 6, 3, '12'], ['Roofing', 4, 4, '13'], ['Windows & exterior doors', 3, 4, '13'], ['Rough plumbing', 5, 5, '14SS+1, 15'],
    ['Rough electrical', 6, 5, '15SS+1'], ['Rough HVAC', 5, 5, '15SS+2'], ['Rough-in inspection', 0, 5, '16, 17, 18'], ['Insulation', 3, 6, '19'],
    ['Drywall: hang, tape, finish', 10, 6, '20'], ['Exterior siding & trim', 10, 7, '15'], ['Interior trim & doors', 6, 6, '21'], ['Cabinets & countertops', 5, 6, '21FS+2'],
    ['Painting', 6, 6, '23SS+2'], ['Flooring', 5, 6, '25'], ['Finish MEP & fixtures', 4, 5, '24, 26'], ['Driveway & landscaping', 6, 7, '22'],
    ['Final inspection', 0, 8, '27, 28'], ['Punch list & handover', 3, 8, '29'],
  ]],
  fitout: ['Office fit-out (600 m²)', [
    ['Design sign-off & permits', 10, 0, '', 100], ['Strip-out & disposal', 5, 1, '1'], ['Partition framing', 6, 3, '2'], ['MEP first fix', 8, 5, '3SS+2'],
    ['Ceiling grid', 4, 6, '4'], ['Boarding & taping', 6, 6, '3, 4FF+1'], ['Data cabling', 5, 5, '4SS+3'], ['Painting', 5, 6, '6'],
    ['Ceiling tiles & lights', 3, 6, '5, 8SS+2'], ['Flooring', 4, 6, '8'], ['MEP second fix', 4, 5, '9'], ['Joinery & kitchen', 5, 6, '10'],
    ['Furniture install', 3, 6, '10, 11'], ['Commissioning & handover', 3, 8, '11, 12, 13'],
  ]],
  bath: ['Bathroom remodel', [
    ['Order fixtures & tile', 2, 0, '', 100], ['Demolition', 2, 1, '1'], ['Plumbing rough-in', 2, 5, '2'], ['Electrical rough-in', 1, 5, '2'],
    ['Inspection', 0, 5, '3, 4'], ['Cement board & waterproofing', 2, 6, '5'], ['Tile floor & walls', 4, 6, '6'], ['Grout cure', 2, 6, '7'],
    ['Vanity & toilet', 1, 6, '8'], ['Fixtures & trim', 1, 5, '9'], ['Paint & caulk', 1, 6, '9SS'], ['Final clean & walkthrough', 1, 8, '10, 11'],
  ]],
}
const LIBRARY: [string, number, number][] = [
  ['Site survey', 2, 1], ['Erosion control', 1, 1], ['Temporary utilities', 2, 1], ['Excavation', 4, 1], ['Piling', 8, 2], ['Footings', 4, 2], ['Slab pour', 2, 2],
  ['Concrete curing', 7, 2], ['Steel erection', 10, 3], ['Masonry walls', 10, 3], ['Framing', 10, 3], ['Roof trusses', 3, 3], ['Roofing', 4, 4], ['Windows', 3, 4],
  ['Rough plumbing', 5, 5], ['Rough electrical', 6, 5], ['HVAC ductwork', 5, 5], ['Fire sprinklers', 4, 5], ['Inspection', 0, 5], ['Insulation', 3, 6], ['Drywall', 8, 6],
  ['Painting', 6, 6], ['Flooring', 5, 6], ['Cabinets', 5, 6], ['Siding', 8, 7], ['Paving', 4, 7], ['Landscaping', 5, 7], ['Snagging / punch list', 3, 8], ['Handover', 0, 8],
]

function fromTemplate(key: string): Task[] {
  const rows = TEMPLATES[key][1]
  const tasks: Task[] = rows.map(([name, dur, ph, , pr]) => ({ id: uid(), name, dur, deps: [], snet: null, phase: PHASES[ph], progress: pr ?? 0 }))
  rows.forEach(([, , , deps], i) => (tasks[i].deps = parseDeps(deps, tasks, tasks[i].id).deps))
  return tasks
}

const DEF: Project = { name: 'Maple Street house', start: '2026-11-02', weekend: 'satsun', holidays: 'us', custom: '2026-12-24 Site closed\n2026-12-31 Site closed', tasks: fromTemplate('house'), baseline: null, baselineAt: '' }

// ---------- IndexedDB project store (falls back to nothing if unavailable) ----------
const DB = 'browser-toolbox-construction-gantt'
function openDb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    if (typeof indexedDB === 'undefined') return rej(new Error('IndexedDB unavailable'))
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => r.result.createObjectStore('projects', { keyPath: 'name' })
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
}
async function idb<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await openDb()
  return new Promise<T>((res, rej) => {
    const req = fn(db.transaction('projects', mode).objectStore('projects'))
    req.onsuccess = () => res(req.result as T)
    req.onerror = () => rej(req.error)
  }).finally(() => db.close())
}

const days = (a: string, b: string) => Math.round((toDate(b).getTime() - toDate(a).getTime()) / 86400000)
const fmtD = (d: string) => toDate(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Rasterizes the chart SVGs (CSS variables resolved) side by side into a PNG. */
async function exportPng(svgs: SVGSVGElement[], name: string) {
  const cs = getComputedStyle(document.documentElement)
  const imgs = await Promise.all(svgs.map((svg) => new Promise<HTMLImageElement>((res, rej) => {
    const xml = new XMLSerializer().serializeToString(svg).replace(/var\((--[\w-]+)\)/g, (_, v: string) => cs.getPropertyValue(v).trim() || '#888')
    const img = new Image()
    img.onload = () => res(img)
    img.onerror = rej
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml)
  })))
  const w = svgs.reduce((a, s) => a + s.width.baseVal.value, 0), h = Math.max(...svgs.map((s) => s.height.baseVal.value))
  const c = document.createElement('canvas')
  c.width = w * 2
  c.height = h * 2
  const ctx = c.getContext('2d')!
  ctx.scale(2, 2)
  ctx.fillStyle = cs.getPropertyValue('--panel').trim() || '#fff'
  ctx.fillRect(0, 0, w, h)
  let x = 0
  imgs.forEach((im, i) => {
    ctx.drawImage(im, x, 0)
    x += svgs[i].width.baseVal.value
  })
  c.toBlob((b) => b && download(name, b, 'image/png'))
}

export default function ConstructionGanttPlanner() {
  const [p, set, reset] = useToolState<Project>('construction-gantt-planner', DEF)
  const [dayW, setDayW] = useState(10)
  const [colorBy, setColorBy] = useState<'crit' | 'phase'>('crit')
  const [tpl, setTpl] = useState('house')
  const [lib, setLib] = useState(0)
  const [drag, setDrag] = useState<{ id: string; mode: 'move' | 'size'; x0: number; dx: number } | null>(null)
  const [saved, setSaved] = useState<string[] | null>(null)
  const [msg, setMsg] = useState('')
  const [today] = useState(() => new Date().toISOString().slice(0, 10))
  const labels = useRef<SVGSVGElement>(null), chart = useRef<SVGSVGElement>(null)

  const refreshSaved = () => idb<string[]>('readonly', (s) => s.getAllKeys()).then(setSaved, () => setSaved(null))
  useEffect(() => {
    refreshSaved()
  }, [])

  const wc = useMemo(() => new WorkCal(p.start, buildCal(WEEKENDS[p.weekend], p.holidays, p.custom, toDate(p.start).getUTCFullYear())), [p.start, p.weekend, p.holidays, p.custom])
  const res = useMemo(() => cpm(p.tasks), [p.tasks])
  const tasks = p.tasks
  const setTasks = (f: (t: Task[]) => Task[]) => set((s) => ({ ...s, tasks: f(s.tasks) }))
  const edit = (id: string, patch: Partial<Task>) => setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t)))

  const sd = (t: Task) => res.sched.get(t.id)
  const startOf = (t: Task) => wc.date(sd(t)?.es ?? 0)
  const finishOf = (t: Task) => wc.finishDate(sd(t)?.es ?? 0, sd(t)?.ef ?? 0)
  const projFinish = res.error ? p.start : wc.finishDate(0, res.finish)
  const crit = tasks.filter((t) => sd(t)?.critical).length
  const baseFinish = p.baseline ? Object.values(p.baseline).reduce((a, [, f]) => (f > a ? f : a), '') : ''
  const slip = p.baseline && baseFinish ? wc.indexOf(projFinish) - wc.indexOf(baseFinish) : 0
  const done = tasks.reduce((a, t) => a + t.dur * t.progress, 0) / Math.max(1, tasks.reduce((a, t) => a + t.dur * 100, 0))

  // ---------- chart geometry ----------
  const rowH = 28, head = 44, labelW = 230
  const origin = add(wc.first, -2)
  const endD = add(projFinish, 10)
  const span = Math.max(30, days(origin, endD))
  const W = span * dayW, H = head + tasks.length * rowH + 8
  const X = (d: string) => days(origin, d) * dayW
  const shift = (t: Task) => (drag && drag.id === t.id && drag.mode === 'move' ? Math.round(drag.dx / dayW) * dayW : 0)
  const grow = (t: Task) => (drag && drag.id === t.id && drag.mode === 'size' ? Math.round(drag.dx / dayW) * dayW : 0)
  const barOf = (t: Task) => {
    const x1 = X(startOf(t)) + shift(t)
    const x2 = (t.dur === 0 ? X(startOf(t)) : X(finishOf(t)) + dayW) + shift(t) + grow(t)
    return [x1, Math.max(x1 + (t.dur ? dayW / 2 : 0), x2)] as const
  }
  const colorOf = (t: Task) => (colorBy === 'crit' ? (sd(t)?.critical ? '#ef4444' : '#6366f1') : color(Math.max(0, PHASES.indexOf(t.phase))))
  const nonWork: string[] = []
  if (dayW >= 5) for (let i = 0; i <= span; i++) {
    const d = add(origin, i)
    if (WEEKENDS[p.weekend].includes(toDate(d).getUTCDay()) || wc.cal.holidays.has(d)) nonWork.push(d)
  }
  const monthTicks: string[] = []
  for (let i = 0; i <= span; i++) {
    const d = add(origin, i)
    if (d.endsWith('-01') || (i === 0 && toDate(d).getUTCDate() < 22)) monthTicks.push(d)
  }

  const commitDrag = () => {
    if (!drag) return
    const t = tasks.find((x) => x.id === drag.id)
    const n = Math.round(drag.dx / dayW)
    setDrag(null)
    if (!t || !n) return
    if (drag.mode === 'move') {
      const idx = wc.indexOf(add(startOf(t), n))
      const dep = earliestFromDeps(tasks, t.id)
      edit(t.id, { snet: idx > dep ? idx : null })
      setMsg(idx < dep ? `"${t.name}" cannot start before its predecessors allow (${fmtD(wc.date(dep))}); snapped back.` : `Moved "${t.name}" to ${fmtD(wc.date(Math.max(idx, dep)))}; successors follow.`)
    } else {
      const es = sd(t)!.es
      const f = add(finishOf(t), n)
      const idx = wc.indexOf(f)
      const dur = Math.max(1, idx - es + (wc.date(idx) === f ? 1 : 0))
      edit(t.id, { dur })
      setMsg(`"${t.name}" is now ${dur} working days.`)
    }
  }

  const arrows = res.error ? [] : tasks.flatMap((t, i) => t.deps.map((d) => {
    const j = tasks.findIndex((x) => x.id === d.id)
    if (j < 0) return null
    const [a1, a2] = barOf(tasks[j]), [b1, b2] = barOf(t)
    const sy = head + j * rowH + rowH / 2, ey = head + i * rowH + rowH / 2
    const fromEnd = d.type === 'FS' || d.type === 'FF', toStart = d.type === 'FS' || d.type === 'SS'
    const sx = fromEnd ? a2 : a1, ex = toStart ? b1 : b2
    const bx = sx + (fromEnd ? 6 : -6)
    const mid = ey + (ey > sy ? -rowH / 2 : rowH / 2)
    const pre = toStart ? ex - 8 : ex + 8
    const path = (toStart ? pre >= bx : pre <= bx)
      ? `M${sx},${sy}H${pre}V${ey}H${ex}`
      : `M${sx},${sy}H${bx}V${mid}H${pre}V${ey}H${ex}`
    const critical = sd(t)?.critical && sd(tasks[j])?.critical
    return <path key={`${t.id}-${d.id}`} d={path} fill="none" stroke={critical && colorBy === 'crit' ? '#ef4444' : 'var(--muted)'} strokeWidth={1.2} markerEnd={critical && colorBy === 'crit' ? 'url(#arrC)' : 'url(#arr)'} opacity={0.85} />
  }))

  const saveIdb = async () => {
    try {
      await idb('readwrite', (s) => s.put(structuredClone(p)))
      setMsg(`Saved "${p.name}" to this browser's IndexedDB.`)
      refreshSaved()
    } catch {
      setMsg('IndexedDB is not available here; use Backup instead.')
    }
  }

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 380px), 1fr))', gap: 16 }}>
        <Panel title="Project">
          <Row>
            <Txt label="Project name" value={p.name} onChange={(name) => set({ name })} />
            <Txt label="Start date" type="date" value={p.start} onChange={(start) => start && set({ start })} />
          </Row>
          <Row>
            <Select<Weekend> label="Non-working days" value={p.weekend} onChange={(weekend) => set({ weekend })} options={[['satsun', 'Sat + Sun'], ['sun', 'Sunday only (6-day week)'], ['fri', 'Fri + Sat'], ['none', 'None (7-day week)']]} />
            <Select<HolidaySet> label="Public holidays" value={p.holidays} onChange={(holidays) => set({ holidays })} options={[['none', 'None'], ['us', 'US federal'], ['uk', 'UK (England & Wales)']]} />
          </Row>
          <Area label="Extra site closures (YYYY-MM-DD note, one per line)" value={p.custom} onChange={(custom) => set({ custom })} rows={2} mono />
        </Panel>
        <Panel title="Templates & storage">
          <Row>
            <Select label="Template" value={tpl} onChange={setTpl} options={Object.entries(TEMPLATES).map(([k, [n]]) => [k, n] as [string, string])} />
            <div style={{ alignSelf: 'end' }}>
              <Btn onClick={() => set({ tasks: fromTemplate(tpl), name: TEMPLATES[tpl][0], baseline: null, baselineAt: '' })}>Load template</Btn>
            </div>
          </Row>
          <Row>
            <Btn kind="primary" onClick={saveIdb}>💾 Save project</Btn>
            {saved && saved.length > 0 && (
              <select aria-label="Open saved project" value="" onChange={async (e) => {
                const name = e.target.value
                const pr = await idb<Project | undefined>('readonly', (s) => s.get(name)).catch(() => undefined)
                if (pr) { set(pr); setMsg(`Opened "${name}".`) }
              }}>
                <option value="">Open saved…</option>
                {saved.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            )}
            {saved?.includes(p.name) && <Btn kind="ghost" onClick={async () => { await idb('readwrite', (s) => s.delete(p.name)).catch(() => 0); refreshSaved(); setMsg(`Deleted saved copy of "${p.name}".`) }}>Delete saved</Btn>}
          </Row>
          <Row>
            <JsonButtons name={`${p.name || 'project'}.json`} data={p} onLoad={(d) => set(d)} />
            <Btn kind="ghost" onClick={reset}>Reset</Btn>
          </Row>
          <div className="muted" style={{ fontSize: 12 }}>{saved === null ? 'IndexedDB unavailable: use Backup/Restore.' : `${saved.length} project(s) saved in this browser (IndexedDB). The current project also autosaves.`}</div>
        </Panel>
      </div>

      {res.error ? <Note tone="err">{res.error}</Note> : (
        <Stats>
          <Stat label="Start" value={fmtD(wc.first)} sub={wc.first} />
          <Stat label="Finish" value={fmtD(projFinish)} sub={`${res.finish} working days · ${days(wc.first, projFinish) + 1} calendar days`} tone="accent" />
          <Stat label="Critical tasks" value={`${crit} / ${tasks.length}`} sub="zero total float" tone="bad" />
          <Stat label="Complete" value={`${Math.round(done * 100)}%`} sub="duration-weighted" />
          {p.baseline && <Stat label="vs baseline" value={slip === 0 ? 'On time' : `${slip > 0 ? '+' : ''}${slip} d`} sub={`baseline ${p.baselineAt}`} tone={slip > 0 ? 'bad' : 'good'} />}
        </Stats>
      )}
      {msg && <Note tone="info">{msg}</Note>}

      <Panel
        title="Gantt chart"
        actions={
          <>
            <Seg value={colorBy} onChange={setColorBy} options={[['crit', 'Critical path'], ['phase', 'Phases']]} />
            <Btn onClick={() => {
              const b: Record<string, [string, string]> = {}
              for (const t of tasks) b[t.id] = [startOf(t), finishOf(t)]
              set({ baseline: b, baselineAt: today })
              setMsg('Baseline saved: grey bars show the plan as of now.')
            }}>📌 Set baseline</Btn>
            {p.baseline && <Btn kind="ghost" onClick={() => set({ baseline: null, baselineAt: '' })}>Clear baseline</Btn>}
            <Btn onClick={() => labels.current && chart.current && exportPng([labels.current, chart.current], `${p.name || 'gantt'}.png`)}>⬇ PNG</Btn>
            <CsvButton name={`${p.name || 'schedule'}.csv`} rows={() => [['#', 'Task', 'Phase', 'Duration (wd)', 'Predecessors', 'Start', 'Finish', 'Late start', 'Late finish', 'Total float', 'Free float', 'Critical', 'Progress %', 'Baseline finish'],
              ...tasks.map((t, i) => { const s = sd(t)!; return [i + 1, t.name, t.phase, t.dur, formatDeps(t.deps, tasks), startOf(t), finishOf(t), wc.date(s.ls), wc.finishDate(s.ls, s.lf), s.tf, s.ff, s.critical ? 'yes' : 'no', t.progress, p.baseline?.[t.id]?.[1] ?? ''] })]} />
          </>
        }
      >
        <div style={{ maxWidth: 260 }}>
          <Slider label="Zoom" value={dayW} onChange={setDayW} min={4} max={36} unit=" px/day" show={(v) => String(v)} />
        </div>
        {!res.error && (
          <div style={{ display: 'flex', border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden' }}>
            <svg ref={labels} width={labelW} height={H} style={{ flex: 'none', background: 'var(--panel)', borderRight: '1px solid var(--line)' }}>
              <text x={8} y={28} fontSize={12} fontWeight={700} fill="var(--muted)">#  Task</text>
              {tasks.map((t, i) => (
                <g key={t.id}>
                  {i % 2 === 0 && <rect x={0} y={head + i * rowH} width={labelW} height={rowH} fill="var(--bg2)" opacity={0.6} />}
                  <text x={8} y={head + i * rowH + 18} fontSize={12} fill={sd(t)?.critical ? '#ef4444' : 'var(--fg)'} fontWeight={sd(t)?.critical ? 700 : 400}>
                    {`${i + 1}`.padStart(2, ' ')}  {t.name.length > 26 ? t.name.slice(0, 25) + '…' : t.name}
                  </text>
                </g>
              ))}
            </svg>
            <div style={{ overflowX: 'auto', flex: 1 }}>
              <svg
                ref={chart}
                width={W}
                height={H}
                style={{ display: 'block', background: 'var(--panel)', touchAction: drag ? 'none' : 'pan-x pan-y', userSelect: 'none' }}
                onPointerMove={(e) => drag && setDrag({ ...drag, dx: e.clientX - drag.x0 })}
                onPointerUp={commitDrag}
                onPointerCancel={() => setDrag(null)}
              >
                <defs>
                  <marker id="arr" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0L8,4L0,8z" fill="var(--muted)" /></marker>
                  <marker id="arrC" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0L8,4L0,8z" fill="#ef4444" /></marker>
                </defs>
                {tasks.map((t, i) => i % 2 === 0 && <rect key={t.id} x={0} y={head + i * rowH} width={W} height={rowH} fill="var(--bg2)" opacity={0.6} />)}
                {nonWork.map((d) => <rect key={d} x={X(d)} y={head} width={dayW} height={H - head} fill={wc.cal.holidays.has(d) ? 'rgba(245,158,11,.18)' : 'var(--line)'} opacity={0.55}><title>{wc.cal.holidays.get(d) ?? 'Non-working day'}</title></rect>)}
                {monthTicks.map((d) => (
                  <g key={d}>
                    <line x1={X(d)} x2={X(d)} y1={0} y2={H} stroke="var(--grid-strong)" />
                    <text x={X(d) + 4} y={16} fontSize={12} fontWeight={700} fill="var(--fg)">{MONTHS[toDate(d).getUTCMonth()]} {toDate(d).getUTCFullYear()}</text>
                  </g>
                ))}
                {Array.from({ length: span + 1 }, (_, i) => add(origin, i)).filter((d) => (dayW >= 16 ? true : toDate(d).getUTCDay() === 1)).map((d) => (
                  <text key={d} x={X(d) + (dayW >= 16 ? dayW / 2 : 2)} y={36} fontSize={10} textAnchor={dayW >= 16 ? 'middle' : 'start'} fill="var(--muted)">{toDate(d).getUTCDate()}</text>
                ))}
                <line x1={0} x2={W} y1={head - 2} y2={head - 2} stroke="var(--line)" />
                {today >= origin && today <= endD && <line x1={X(today) + dayW / 2} x2={X(today) + dayW / 2} y1={head} y2={H} stroke="#10b981" strokeWidth={2} strokeDasharray="4 3"><title>Today</title></line>}
                {arrows}
                {tasks.map((t, i) => {
                  const s = sd(t)!
                  const y = head + i * rowH
                  const [x1, x2] = barOf(t)
                  const c = colorOf(t)
                  const base = p.baseline?.[t.id]
                  const floatEnd = s.tf > 0 ? X(wc.finishDate(s.ls, s.lf)) + (t.dur ? dayW : 0) : 0
                  const tip = `${t.name}\n${fmtD(startOf(t))} → ${fmtD(finishOf(t))} (${t.dur} wd)\nTotal float ${s.tf} d · free float ${s.ff} d${s.critical ? '\nCRITICAL' : ''}`
                  const down = (mode: 'move' | 'size') => (e: React.PointerEvent) => {
                    e.stopPropagation()
                    ;(e.currentTarget as Element).closest('svg')?.setPointerCapture(e.pointerId)
                    setDrag({ id: t.id, mode, x0: e.clientX, dx: 0 })
                  }
                  return (
                    <g key={t.id}>
                      {base && <rect x={X(base[0])} y={y + rowH - 7} width={Math.max(3, X(base[1]) + dayW - X(base[0]))} height={4} rx={2} fill="var(--muted)" opacity={0.7}><title>Baseline {fmtD(base[0])} → {fmtD(base[1])}</title></rect>}
                      {s.tf > 0 && !drag && <line x1={x2} x2={floatEnd} y1={y + rowH / 2} y2={y + rowH / 2} stroke={c} strokeWidth={1.5} strokeDasharray="2 3" opacity={0.6}><title>Total float: {s.tf} working days</title></line>}
                      {t.dur === 0 ? (
                        <path d={`M${x1},${y + 6}l8,8l-8,8l-8,-8z`} fill={c} style={{ cursor: 'grab' }} onPointerDown={down('move')}><title>{tip}</title></path>
                      ) : (
                        <g style={{ cursor: 'grab' }}>
                          <rect x={x1} y={y + 5} width={x2 - x1} height={rowH - 12} rx={4} fill={c} opacity={0.45} onPointerDown={down('move')}><title>{tip}</title></rect>
                          <rect x={x1} y={y + 5} width={((x2 - x1) * t.progress) / 100} height={rowH - 12} rx={4} fill={c} pointerEvents="none" />
                          <rect x={x1} y={y + 5} width={x2 - x1} height={rowH - 12} rx={4} fill="none" stroke={c} strokeWidth={1.5} pointerEvents="none" />
                          <rect x={x2 - 6} y={y + 5} width={8} height={rowH - 12} fill="transparent" style={{ cursor: 'ew-resize' }} onPointerDown={down('size')}><title>Drag to change duration</title></rect>
                        </g>
                      )}
                      <text x={Math.max(x1, x2) + 12} y={y + 18} fontSize={11} fill="var(--muted)" pointerEvents="none">{t.dur ? `${t.dur}d` : fmtD(startOf(t))}{t.snet !== null ? ' 📌' : ''}</text>
                    </g>
                  )
                })}
              </svg>
            </div>
          </div>
        )}
        <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
          Drag a bar to reschedule (sets a start-no-earlier-than; successors move with it), drag its right edge to change duration. Dotted whiskers show total float; grey bars the baseline; shaded columns weekends (amber = holidays).
        </div>
      </Panel>

      <Panel
        title="Tasks"
        actions={
          <>
            <Select label="Add from library" value={lib} onChange={setLib} options={LIBRARY.map(([n, d], i) => [i, `${n} (${d}d)`] as [number, string])} />
            <Btn onClick={() => { const [n, d, ph] = LIBRARY[lib]; setTasks((ts) => [...ts, { id: uid(), name: n, dur: d, deps: ts.length ? [{ id: ts[ts.length - 1].id, type: 'FS', lag: 0 }] : [], snet: null, phase: PHASES[ph], progress: 0 }]) }}>+ Add</Btn>
            <Btn onClick={() => setTasks((ts) => [...ts, { id: uid(), name: 'New task', dur: 3, deps: [], snet: null, phase: PHASES[3], progress: 0 }])}>+ Blank task</Btn>
          </>
        }
      >
        <div className="k-table-wrap">
          <table className="k-table">
            <thead>
              <tr><th>#</th><th>Task</th><th>Phase</th><th>Days</th><th title="Row numbers, e.g. 3, 4SS+2, 5FF-1">Predecessors</th><th>Start</th><th>Finish</th><th>TF</th><th>FF</th><th>Done %</th><th>Δ base</th><th></th></tr>
            </thead>
            <tbody>
              {tasks.map((t, i) => {
                const s = sd(t)
                const b = p.baseline?.[t.id]
                const dv = b && s ? wc.indexOf(finishOf(t)) - wc.indexOf(b[1]) : null
                return (
                  <tr key={t.id} style={s?.critical ? { boxShadow: 'inset 3px 0 0 #ef4444' } : undefined}>
                    <td>{i + 1}</td>
                    <td><input value={t.name} onChange={(e) => edit(t.id, { name: e.target.value })} aria-label="Task name" style={{ minWidth: 170 }} /></td>
                    <td>
                      <select value={t.phase} onChange={(e) => edit(t.id, { phase: e.target.value })} aria-label="Phase">
                        {PHASES.map((ph) => <option key={ph}>{ph}</option>)}
                      </select>
                    </td>
                    <td><input type="number" min={0} value={t.dur} onChange={(e) => edit(t.id, { dur: Math.max(0, Math.round(Number(e.target.value) || 0)) })} aria-label="Duration" style={{ width: 56 }} /></td>
                    <td>
                      <input
                        key={formatDeps(t.deps, tasks)}
                        defaultValue={formatDeps(t.deps, tasks)}
                        placeholder="e.g. 3, 4SS+2"
                        aria-label="Predecessors"
                        style={{ width: 110 }}
                        onBlur={(e) => {
                          const r = parseDeps(e.target.value, tasks, t.id)
                          edit(t.id, { deps: r.deps })
                          setMsg(r.bad.length ? `Ignored: ${r.bad.join(', ')} (use row numbers with optional FS/SS/FF/SF and ±lag).` : '')
                        }}
                        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                      />
                    </td>
                    <td>{fmtD(startOf(t))}{t.snet !== null && <button type="button" className="k-btn ghost" title="Remove manual start constraint" onClick={() => edit(t.id, { snet: null })}>📌✕</button>}</td>
                    <td>{fmtD(finishOf(t))}</td>
                    <td style={{ color: s?.critical ? '#ef4444' : undefined, fontWeight: s?.critical ? 700 : 400 }}>{s?.tf ?? '—'}</td>
                    <td>{s?.ff ?? '—'}</td>
                    <td><input type="number" min={0} max={100} step={10} value={t.progress} onChange={(e) => edit(t.id, { progress: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })} aria-label="Progress" style={{ width: 56 }} /></td>
                    <td style={{ color: dv && dv > 0 ? 'var(--err)' : dv && dv < 0 ? 'var(--ok)' : undefined }}>{dv === null ? '—' : dv === 0 ? '0' : `${dv > 0 ? '+' : ''}${dv}`}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button type="button" className="k-btn ghost" title="Move up" disabled={i === 0} onClick={() => setTasks((ts) => { const a = ts.slice(); [a[i - 1], a[i]] = [a[i], a[i - 1]]; return a })}>↑</button>
                      <button type="button" className="k-btn ghost" title="Delete" onClick={() => setTasks((ts) => ts.filter((x) => x.id !== t.id).map((x) => ({ ...x, deps: x.deps.filter((d) => d.id !== t.id) })))}>✕</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <Note>
          Critical path method: a forward pass gives earliest start/finish, a backward pass latest; <b>TF</b> (total float) is how many working days a task can slip without delaying the project,
          <b> FF</b> (free float) how many before it delays any successor. Link types: FS finish→start (default), SS start→start, FF finish→finish, SF start→finish; lag in working days (negative = lead).
        </Note>
      </Panel>
    </div>
  )
}
