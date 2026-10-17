import { useEffect, useState } from 'react'
import { BarChart, Btn, Check, color, CsvButton, Donut, JsonButtons, money, Note, Num, Panel, Row, Select, Split, Stat, Stats, Table, Txt, uid, useToolState } from '../kit'
import { addDaysMs, byDayProject, dayKey, durMs, type Entry, hhmm, hms, invoiceLines, type Project, weekStart } from './lib/time-tracker'

interface State { projects: Project[]; entries: Entry[]; currency: string; rounding: number }

function sample(): State {
  const projects: Project[] = [
    { id: 'web', name: 'Website redesign', client: 'Northwind', rate: 85, color: color(0) },
    { id: 'app', name: 'Mobile app', client: 'Contoso', rate: 95, color: color(2) },
    { id: 'sup', name: 'Support retainer', client: 'Northwind', rate: 70, color: color(3) },
    { id: 'adm', name: 'Admin & email', client: 'Internal', rate: 0, color: color(10) },
  ]
  const entries: Entry[] = []
  const notes: Record<string, string[]> = { web: ['Homepage wireframes', 'Design review call', 'CSS refactor', 'Content migration'], app: ['Login flow', 'API integration', 'Bug fixes', 'Release build'], sup: ['Ticket #482', 'Server patching', 'Backup check'], adm: ['Invoicing', 'Inbox zero', 'Planning'] }
  let r = 11
  const today0 = new Date()
  today0.setHours(0, 0, 0, 0)
  for (let d = 13; d >= 1; d--) {
    const day = addDaysMs(today0.getTime(), -d)
    const dow = new Date(day).getDay()
    if (dow === 0 || dow === 6) continue
    let t = day + 9 * 3600000
    for (let k = 0; k < 4; k++) {
      r = (r * 9301 + 49297) % 233280
      const p = projects[r % 4]
      const len = (40 + (r % 110)) * 60000
      const ns = notes[p.id]
      entries.push({ id: uid(), project: p.id, start: t, end: t + len, note: ns[r % ns.length], billable: p.rate > 0 })
      t += len + (k === 1 ? 45 : 10) * 60000
    }
  }
  const t = new Date()
  const start = Math.max(today0.getTime() + 9 * 3600000, t.getTime() - 3 * 3600000)
  if (start < t.getTime() - 20 * 60000) entries.push({ id: uid(), project: 'web', start, end: Math.min(start + 95 * 60000, t.getTime() - 10 * 60000), note: 'Header component', billable: true })
  return { projects, entries, currency: '$', rounding: 15 }
}
const DEF = sample()
const pad = (n: number) => String(n).padStart(2, '0')
const toLocalInput = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}` }
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export default function TimeTracker() {
  const [s, set, reset] = useToolState('time-tracker', DEF)
  const [now, setNow] = useState(() => Date.now())
  const running = s.entries.find((e) => e.end === null)
  const [proj, setProj] = useState(s.projects[0]?.id ?? '')
  const [note, setNote] = useState('')
  const [wk, setWk] = useState(() => weekStart(Date.now()))
  const [mStart, setMStart] = useState(() => toLocalInput(Date.now() - 3600000))
  const [mEnd, setMEnd] = useState(() => toLocalInput(Date.now()))
  const [client, setClient] = useState('all')
  const [from, setFrom] = useState(() => dayKey(new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime()))
  const [to, setTo] = useState(() => dayKey(Date.now()))

  useEffect(() => {
    if (!running) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [running])

  const pOf = (id: string) => s.projects.find((p) => p.id === id)
  const start = () => {
    if (!pOf(proj)) return
    const t = Date.now()
    setNow(t)
    set({ entries: [...s.entries.map((e) => (e.end === null ? { ...e, end: t } : e)), { id: uid(), project: proj, start: t, end: null, note, billable: (pOf(proj)?.rate ?? 0) > 0 }] })
  }
  const stop = () => set({ entries: s.entries.map((e) => (e.end === null ? { ...e, end: Date.now() } : e)) })
  const editE = (id: string, p: Partial<Entry>) => set({ entries: s.entries.map((e) => (e.id === id ? { ...e, ...p } : e)) })
  const editP = (id: string, p: Partial<Project>) => set({ projects: s.projects.map((x) => (x.id === id ? { ...x, ...p } : x)) })

  const wkEnd = addDaysMs(wk, 7)
  const agg = byDayProject(s.entries, wk, wkEnd, now)
  const days = Array.from({ length: 7 }, (_, i) => dayKey(addDaysMs(wk, i)))
  const perProject = s.projects.map((p) => ({ p, ms: days.reduce((a, d) => a + (agg[d]?.[p.id] ?? 0), 0) }))
  const weekMs = perProject.reduce((a, x) => a + x.ms, 0)
  const weekBill = perProject.reduce((a, x) => a + (x.ms / 3600000) * x.p.rate, 0)
  const todayMs = Object.values(agg[dayKey(now)] ?? {}).reduce((a, v) => a + v, 0)
  const weekEntries = s.entries.filter((e) => e.start >= wk && e.start < wkEnd).sort((a, b) => b.start - a.start)
  const clients = [...new Set(s.projects.map((p) => p.client))]
  const fromMs = new Date(from + 'T00:00').getTime(), toMs = addDaysMs(new Date(to + 'T00:00').getTime(), 1)
  const lines = invoiceLines(s.entries.filter((e) => client === 'all' || pOf(e.project)?.client === client), s.projects, fromMs, toMs, s.rounding, now)
  const invTotal = lines.reduce((a, l) => a + l.amount, 0)
  const m = (x: number) => money(x, s.currency)

  return (
    <Split>
      <div>
        <Panel title="Timer">
          <div style={{ textAlign: 'center', fontSize: 44, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: running ? 'var(--accent)' : 'var(--muted)' }}>{running ? hms(now - running.start) : '0:00:00'}</div>
          {running && <p style={{ textAlign: 'center', margin: '0 0 8px' }}><b style={{ color: pOf(running.project)?.color }}>● {pOf(running.project)?.name}</b> <span className="muted">{running.note}</span></p>}
          <Select label="Project" value={proj} onChange={setProj} options={s.projects.map((p) => [p.id, `${p.name} · ${p.client}`] as [string, string])} />
          <Txt label="What are you working on?" value={note} onChange={setNote} placeholder="e.g. Fix checkout bug" />
          <Row>
            {running ? <Btn kind="danger" onClick={stop}>■ Stop</Btn> : <Btn kind="primary" onClick={start} disabled={!pOf(proj)}>▶ Start</Btn>}
            {running && <Btn onClick={start}>⇄ Switch to selected</Btn>}
          </Row>
          <p className="muted" style={{ fontSize: 12.5, marginBottom: 0 }}>The timer keeps running if you close the tab — it stores the start time, not a counter.</p>
        </Panel>
        <Panel title="Add time manually">
          <Row>
            <Txt label="Start" type="datetime-local" value={mStart} onChange={setMStart} />
            <Txt label="End" type="datetime-local" value={mEnd} onChange={setMEnd} />
          </Row>
          <Btn disabled={!(new Date(mEnd).getTime() > new Date(mStart).getTime()) || !pOf(proj)} onClick={() => set({ entries: [...s.entries, { id: uid(), project: proj, start: new Date(mStart).getTime(), end: new Date(mEnd).getTime(), note, billable: (pOf(proj)?.rate ?? 0) > 0 }] })}>+ Add entry ({Number.isFinite(new Date(mEnd).getTime() - new Date(mStart).getTime()) && new Date(mEnd) > new Date(mStart) ? hhmm(new Date(mEnd).getTime() - new Date(mStart).getTime()) : '—'})</Btn>
        </Panel>
        <Panel title="Projects & rates" actions={<Btn onClick={() => set({ projects: [...s.projects, { id: uid(), name: 'New project', client: 'Client', rate: 50, color: color(s.projects.length) }] })}>+ Project</Btn>}>
          {s.projects.map((p) => (
            <div key={p.id} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
              <input type="color" value={p.color} onChange={(e) => editP(p.id, { color: e.target.value })} aria-label="Colour" style={{ width: 28, height: 26, border: 0, padding: 0, background: 'none' }} />
              <input value={p.name} onChange={(e) => editP(p.id, { name: e.target.value })} aria-label="Project" style={{ flex: '1 1 120px', minWidth: 0 }} />
              <input value={p.client} onChange={(e) => editP(p.id, { client: e.target.value })} aria-label="Client" style={{ width: 100 }} />
              <input type="number" min={0} value={p.rate} onChange={(e) => editP(p.id, { rate: Math.max(0, Number(e.target.value) || 0) })} aria-label="Hourly rate" style={{ width: 64 }} />
              <span className="muted" style={{ fontSize: 12 }}>/h</span>
              <Btn kind="ghost" title="Delete project" onClick={() => !s.entries.some((e) => e.project === p.id) ? set({ projects: s.projects.filter((x) => x.id !== p.id) }) : confirm(`Delete “${p.name}” and its entries?`) && set({ projects: s.projects.filter((x) => x.id !== p.id), entries: s.entries.filter((e) => e.project !== p.id) })}>✕</Btn>
            </div>
          ))}
          <Row>
            <Txt label="Currency" value={s.currency} onChange={(currency) => set({ currency })} />
            <JsonButtons name="time-tracker.json" data={s} onLoad={(d) => d && Array.isArray(d.entries) && Array.isArray(d.projects) && set(d)} />
            <Btn kind="ghost" onClick={() => confirm('Replace everything with sample data?') && reset()}>Sample</Btn>
          </Row>
        </Panel>
      </div>

      <div>
        <Stats>
          <Stat label="Today" value={hhmm(todayMs)} tone="accent" />
          <Stat label="This week" value={hhmm(weekMs)} sub={`${(weekMs / 3600000 / 5).toFixed(1)} h / workday`} />
          <Stat label="Billable value" value={m(weekBill)} sub="selected week, unrounded" tone="good" />
        </Stats>
        <Panel title={`Week of ${new Date(wk).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`} actions={<><Btn kind="ghost" onClick={() => setWk(weekStart(addDaysMs(wk, -7)))}>‹</Btn><Btn kind="ghost" onClick={() => setWk(weekStart(Date.now()))}>This week</Btn><Btn kind="ghost" onClick={() => setWk(weekStart(addDaysMs(wk, 7)))}>›</Btn></>}>
          <BarChart height={210} fy={(v) => `${v.toFixed(1)}h`} stacks={s.projects.map((p) => ({ name: p.name, color: p.color }))} bars={days.map((d, i) => ({ label: `${DOW[i]} ${+d.slice(8)}`, value: s.projects.map((p) => (agg[d]?.[p.id] ?? 0) / 3600000) }))} />
          {weekMs > 0 && <Donut size={180} slices={perProject.filter((x) => x.ms > 0).map((x) => ({ label: x.p.name, value: x.ms / 3600000, color: x.p.color }))} fv={(v) => `${v.toFixed(1)} h`} center={<b>{hhmm(weekMs)}</b>} />}
        </Panel>
        <Panel title="Entries this week">
          <Table max={20} head={['Day', 'Project', 'Note', 'Time', '$', '']} rows={weekEntries.map((e) => {
            const p = pOf(e.project)
            return [
              <span key="d" style={{ whiteSpace: 'nowrap' }}>{new Date(e.start).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' })} {new Date(e.start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>,
              <span key="p" style={{ color: p?.color, fontWeight: 700 }}>{p?.name ?? '—'}</span>,
              <input key="n" value={e.note} onChange={(ev) => editE(e.id, { note: ev.target.value })} aria-label="Note" style={{ width: 140 }} />,
              <b key="t" style={{ color: e.end === null ? 'var(--accent)' : undefined }}>{e.end === null ? hms(durMs(e, now)) : hhmm(durMs(e, now))}</b>,
              <Check key="b" label="" value={e.billable} onChange={(billable) => editE(e.id, { billable })} />,
              <Btn key="x" kind="ghost" title="Delete" onClick={() => set({ entries: s.entries.filter((x) => x.id !== e.id) })}>✕</Btn>,
            ]
          })} />
          {!weekEntries.length && <Note>No time logged this week.</Note>}
        </Panel>
        <Panel title="Invoice export" actions={<CsvButton name={`timesheet-${client === 'all' ? 'all' : client.toLowerCase().replace(/\W+/g, '-')}-${from}-to-${to}.csv`} rows={() => [['Date', 'Client', 'Project', 'Description', 'Hours', 'Rate', 'Amount'], ...lines.map((l) => [l.date, l.client, l.project, l.note, l.hours, l.rate, l.amount]), ['', '', '', 'Total', +lines.reduce((a, l) => a + l.hours, 0).toFixed(2), '', +invTotal.toFixed(2)]]} />}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8 }}>
            <Select label="Client" value={client} onChange={setClient} options={[['all', 'All clients'], ...clients.map((c) => [c, c] as [string, string])]} />
            <Txt label="From" type="date" value={from} onChange={setFrom} />
            <Txt label="To" type="date" value={to} onChange={setTo} />
            <Num label="Round each entry up to" value={s.rounding} min={0} max={60} step={1} unit="min" onChange={(rounding) => set({ rounding: Math.max(0, Math.round(rounding)) })} />
          </div>
          <p style={{ margin: '6px 0' }}><b>{lines.length}</b> billable entries · <b>{lines.reduce((a, l) => a + l.hours, 0).toFixed(2)} h</b> · <b>{m(invTotal)}</b></p>
          <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>Common increments: 6 min (tenth of an hour) or 15 min. Untick “$” on an entry to keep it off invoices. All data stays in this browser.</p>
        </Panel>
      </div>
    </Split>
  )
}
