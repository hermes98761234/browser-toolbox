import { useState } from 'react'
import { BarChart, Btn, CsvButton, download, JsonButtons, Note, Num, Panel, Row, Select, Split, Stat, Stats, Table, Txt, uid, useToolState } from '../kit'
import { localKey } from './lib/habit-tracker'
import { addDays, daysBetween, lastDone, nextDue, status, type Task, toIcs, type Unit } from './lib/home-maintenance-scheduler'

const MON = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const every = (n: number, u: Unit) => (n === 1 ? u.slice(0, -1) : `${n} ${u}`)
const SEASON = (m: number) => (m === 0 ? 'Any time' : m <= 2 || m === 12 ? 'Winter' : m <= 5 ? 'Spring' : m <= 8 ? 'Summer' : 'Fall')

// name | area | every | unit | preferred month (0 = any)
const PRESETS: [string, string, number, Unit, number][] = [
  ['Replace HVAC air filter', 'Heating & cooling', 3, 'months', 0],
  ['Service furnace / boiler', 'Heating & cooling', 1, 'years', 9],
  ['Service air conditioner', 'Heating & cooling', 1, 'years', 4],
  ['Test smoke & CO alarms', 'Safety', 1, 'months', 0],
  ['Replace smoke alarm batteries', 'Safety', 1, 'years', 11],
  ['Check fire extinguisher gauge', 'Safety', 1, 'months', 0],
  ['Test garage door auto-reverse', 'Safety', 1, 'months', 0],
  ['Test GFCI outlets', 'Electrical', 1, 'months', 0],
  ['Flush water heater', 'Plumbing', 1, 'years', 3],
  ['Test sump pump', 'Plumbing', 3, 'months', 0],
  ['Shut off & drain outdoor faucets', 'Plumbing', 1, 'years', 10],
  ['Clean range hood filter', 'Kitchen', 3, 'months', 0],
  ['Clean dishwasher filter', 'Kitchen', 1, 'months', 0],
  ['Replace fridge water filter', 'Kitchen', 6, 'months', 0],
  ['Clean refrigerator coils', 'Appliances', 6, 'months', 0],
  ['Clean dryer vent duct', 'Appliances', 1, 'years', 6],
  ['Run washing machine cleaning cycle', 'Appliances', 1, 'months', 0],
  ['Clean gutters (spring)', 'Exterior', 1, 'years', 4],
  ['Clean gutters (fall)', 'Exterior', 1, 'years', 11],
  ['Inspect roof & flashing', 'Exterior', 1, 'years', 5],
  ['Pressure-wash deck & reseal', 'Exterior', 2, 'years', 6],
  ['Chimney sweep & inspection', 'Exterior', 1, 'years', 8],
  ['Blow out sprinkler lines', 'Garden', 1, 'years', 10],
  ['Re-caulk tub & shower', 'Bathroom', 1, 'years', 0],
  ['Deep-clean carpets', 'Interior', 1, 'years', 0],
]
const AREAS = [...new Set(PRESETS.map((p) => p[1]))]

function sample(): Task[] {
  const t = localKey()
  const mk = (i: number, back: number[], notes = ''): Task => {
    const [name, area, every, unit, month] = PRESETS[i]
    return { id: uid(), name, area, every, unit, month, history: back.map((d) => addDays(t, -d)), notes }
  }
  return [
    mk(0, [205, 112, 96], 'MERV 11, 16×25×1'),
    mk(3, [64, 33]),
    mk(1, [380], 'Ask for combustion test'),
    mk(8, [300]),
    mk(11, [80]),
    mk(14, [150]),
    mk(15, [260]),
    mk(18, [345]),
    mk(10, [365]),
    mk(7, [12]),
    mk(19, []),
  ]
}
const DEF = { tasks: sample(), soon: 14 }

const tone = { overdue: 'var(--err)', soon: 'var(--warn)', ok: 'var(--ok)' }

export default function HomeMaintenanceScheduler() {
  const [s, set, reset] = useToolState('home-maintenance-scheduler', DEF)
  const [today] = useState(() => localKey())
  const [filter, setFilter] = useState('all')
  const [preset, setPreset] = useState(0)
  const [doneDate, setDoneDate] = useState(today)
  const [open, setOpen] = useState<string | null>(null)
  const edit = (id: string, p: Partial<Task>) => set({ tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...p } : t)) })

  const rows = s.tasks
    .map((t) => ({ t, due: nextDue(t, today) }))
    .map((r) => ({ ...r, st: status(r.due, today, s.soon), days: daysBetween(today, r.due) }))
    .filter((r) => filter === 'all' || (filter === 'attention' ? r.st !== 'ok' : r.t.area === filter))
    .sort((a, b) => a.due.localeCompare(b.due))
  const all = s.tasks.map((t) => status(nextDue(t, today), today, s.soon))
  const overdue = all.filter((x) => x === 'overdue').length
  const soon = all.filter((x) => x === 'soon').length
  const history = s.tasks.flatMap((t) => t.history.map((d) => ({ d, t }))).sort((a, b) => b.d.localeCompare(a.d))

  // Load for the next 12 months: occurrences per month (recurrences included).
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(+today.slice(0, 4), +today.slice(5, 7) - 1 + i, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const load = months.map((m) => {
    let n = 0
    for (const t of s.tasks) {
      let due = nextDue(t, today)
      for (let k = 0; k < 400 && due.slice(0, 7) <= m; k++) {
        if (due.slice(0, 7) === m) n++
        due = nextDue({ ...t, history: [due] }, due)
      }
    }
    return n
  })

  return (
    <Split wide="right">
      <div>
        <Stats>
          <Stat label="Overdue" value={overdue} tone={overdue ? 'bad' : 'good'} />
          <Stat label={`Due in ${s.soon} days`} value={soon} tone={soon ? 'accent' : undefined} />
          <Stat label="Tasks tracked" value={s.tasks.length} sub={`${history.length} completions logged`} />
        </Stats>
        <Panel title="Add a task">
          <Select label="Preset (seasonal checklist)" value={preset} onChange={setPreset} options={PRESETS.map((p, i) => [i, `${p[0]} — every ${every(p[2], p[3])}${p[4] ? ` · ${MON[p[4]]}` : ''}`] as [number, string])} />
          <Row>
            <Btn kind="primary" onClick={() => { const [name, area, every, unit, month] = PRESETS[preset]; set({ tasks: [...s.tasks, { id: uid(), name, area, every, unit, month, history: [], notes: '' }] }) }}>+ Add preset</Btn>
            <Btn onClick={() => set({ tasks: [...s.tasks, { id: uid(), name: 'New task', area: 'Interior', every: 6, unit: 'months', month: 0, history: [], notes: '' }] })}>+ Custom task</Btn>
          </Row>
          <p className="muted" style={{ fontSize: 12.5, marginBottom: 0 }}>Yearly tasks with a preferred month (gutters in fall, AC in spring) snap to the 1st of that month; others repeat from the last time you did them.</p>
        </Panel>
        <Panel title="Next 12 months">
          <BarChart height={180} bars={months.map((m, i) => ({ label: MON[+m.slice(5)], value: load[i] }))} fy={(v) => String(Math.round(v))} />
        </Panel>
        <Panel title="Settings & export" actions={<Btn kind="ghost" onClick={() => confirm('Replace your tasks with the sample list?') && reset()}>Sample</Btn>}>
          <Num label="“Due soon” window" value={s.soon} min={1} max={90} unit="days" onChange={(soon) => set({ soon })} />
          <Row>
            <Btn onClick={() => download('home-maintenance.ics', toIcs(s.tasks, today, new Date()), 'text/calendar')}>📅 Export .ics</Btn>
            <CsvButton name="maintenance-history.csv" rows={() => [['Date', 'Task', 'Area', 'Notes'], ...history.map((h) => [h.d, h.t.name, h.t.area, h.t.notes])]} />
            <JsonButtons name="home-maintenance.json" data={s} onLoad={(d) => d && Array.isArray(d.tasks) && set(d)} />
          </Row>
          <p className="muted" style={{ fontSize: 12.5, marginBottom: 0 }}>The calendar file adds each task as a recurring all-day event (with a reminder the evening before) to Google, Apple or Outlook calendars. Data stays in this browser; use Backup to move it.</p>
        </Panel>
      </div>

      <div>
        <Panel title="Schedule" actions={<Select label="" value={filter} onChange={setFilter} options={[['all', 'All tasks'], ['attention', 'Needs attention'], ...AREAS.map((a) => [a, a] as [string, string])]} />}>
          <Row>
            <Txt label="Completion date" type="date" value={doneDate} onChange={(d) => d && setDoneDate(d)} />
          </Row>
          {rows.map(({ t, due, st, days }) => {
            const last = lastDone(t)
            return (
              <div key={t.id} style={{ borderLeft: `4px solid ${tone[st]}`, background: 'var(--panel2)', borderRadius: 8, padding: '8px 10px', marginBottom: 8 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <b style={{ flex: 1, minWidth: 160 }}>{t.name}</b>
                  <span style={{ color: tone[st], fontWeight: 700, fontSize: 13 }}>{days < 0 ? `${-days} d overdue` : days === 0 ? 'due today' : `in ${days} d`} · {due}</span>
                  <Btn kind="primary" onClick={() => !t.history.includes(doneDate) && edit(t.id, { history: [...t.history, doneDate] })}>✓ Done</Btn>
                  <Btn kind="ghost" onClick={() => setOpen(open === t.id ? null : t.id)}>{open === t.id ? 'Close' : 'Edit'}</Btn>
                </div>
                <div className="muted" style={{ fontSize: 12.5 }}>{t.area} · every {every(t.every, t.unit)}{t.month ? ` · ${SEASON(t.month)} (${MON[t.month]})` : ''} · last {last ?? 'never'}{t.notes ? ` · ${t.notes}` : ''}</div>
                {open === t.id && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8 }}>
                      <Txt label="Name" value={t.name} onChange={(name) => edit(t.id, { name })} />
                      <Select label="Area" value={AREAS.includes(t.area) ? t.area : AREAS[0]} onChange={(area) => edit(t.id, { area })} options={AREAS} />
                      <Num label="Every" value={t.every} min={1} max={120} onChange={(every) => edit(t.id, { every: Math.max(1, Math.round(every)) })} />
                      <Select label="Unit" value={t.unit} onChange={(unit) => edit(t.id, { unit })} options={['days', 'weeks', 'months', 'years'] as Unit[]} />
                      <Select label="Preferred month" value={t.month} onChange={(month) => edit(t.id, { month })} options={MON.map((m, i) => [i, i ? m : 'Any'] as [number, string])} />
                    </div>
                    <Txt label="Notes (part numbers, contractor…)" value={t.notes} onChange={(notes) => edit(t.id, { notes })} />
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, margin: '6px 0' }}>
                      {[...t.history].sort().reverse().map((d) => (
                        <span key={d} className="k-btn" style={{ fontSize: 12, padding: '2px 8px' }}>{d} <button type="button" aria-label={`Remove ${d}`} onClick={() => edit(t.id, { history: t.history.filter((x) => x !== d) })} style={{ border: 0, background: 'none', color: 'var(--err)', cursor: 'pointer' }}>✕</button></span>
                      ))}
                      {!t.history.length && <span className="muted" style={{ fontSize: 12.5 }}>No completions yet.</span>}
                    </div>
                    <Btn kind="danger" onClick={() => confirm(`Delete “${t.name}”?`) && set({ tasks: s.tasks.filter((x) => x.id !== t.id) })}>Delete task</Btn>
                  </div>
                )}
              </div>
            )
          })}
          {!rows.length && <Note tone="ok">Nothing here — everything in this filter is up to date.</Note>}
        </Panel>
        <Panel title="Completion history">
          <Table max={12} head={['Date', 'Task', 'Area']} rows={history.map((h) => [h.d, h.t.name, h.t.area])} />
          {!history.length && <Note>Mark a task done to start the log.</Note>}
        </Panel>
      </div>
    </Split>
  )
}
