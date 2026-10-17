import { useState } from 'react'
import { BarChart, Btn, CsvButton, JsonButtons, LineChart, Note, Num, Panel, Row, Seg, Select, Split, Stat, Stats, Table, Txt, uid, useToolState } from '../kit'
import { minutesFrom, running, shiftIndex, shiftLabels, totals, urineRate, type Entry } from './lib/fluid-balance-log'

const ROUTES = {
  in: ['Oral', 'IV fluids', 'IV medication', 'Blood products', 'Enteral / tube feed', 'TPN', 'Flush'],
  out: ['Urine', 'Drain', 'Emesis', 'NG aspirate', 'Stool', 'Blood loss', 'Other'],
}
const pad = (n: number) => String(n).padStart(2, '0')
const localDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const localStamp = (d: Date) => `${localDate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`
const addDays = (day: string, n: number) => { const [y, m, d] = day.split('-').map(Number); return localDate(new Date(y, m - 1, d + n)) }
/** Clinical day containing timestamp t (a day starts at startHour). */
const dayOf = (t: string, startHour: number) => { const day = t.slice(0, 10); return minutesFrom(day, t) < startHour * 60 ? addDays(day, -1) : day }

function sampleEntries(): { day: string; entries: Entry[] } {
  const day = addDays(dayOf(localStamp(new Date()), 7), -1)
  const next = addDays(day, 1)
  const rows: [string, 'in' | 'out', string, number, string][] = [
    ['07:30', 'in', 'Oral', 200, 'Tea with breakfast'], ['08:00', 'in', 'IV fluids', 125, 'NaCl 0.9% @125 mL/h'], ['09:00', 'in', 'IV fluids', 125, ''],
    ['09:15', 'out', 'Urine', 280, ''], ['10:00', 'in', 'IV medication', 100, 'Antibiotic'], ['11:00', 'in', 'IV fluids', 250, ''],
    ['12:30', 'in', 'Oral', 350, 'Lunch'], ['13:00', 'out', 'Urine', 320, ''], ['14:00', 'out', 'Drain', 60, 'Serous'],
    ['15:00', 'in', 'IV fluids', 500, ''], ['16:30', 'out', 'Urine', 250, ''], ['18:00', 'in', 'Oral', 400, 'Dinner'],
    ['19:00', 'out', 'Emesis', 150, ''], ['20:00', 'in', 'IV medication', 100, ''], ['21:30', 'out', 'Urine', 300, ''],
    ['23:00', 'in', 'IV fluids', 500, ''], ['02:00', 'out', 'Urine', 180, ''], ['03:00', 'in', 'IV fluids', 375, ''], ['05:30', 'out', 'Urine', 150, 'Dark, concentrated'], ['06:00', 'out', 'Drain', 40, ''],
  ]
  return { day, entries: rows.map(([hm, kind, route, ml, note]) => ({ id: uid(), t: `${hm < '07:00' ? next : day}T${hm}`, kind, route, ml, note })) }
}
const SAMPLE = sampleEntries()
const DEF = { patient: 'Bed 12 — J. Doe', weight: 72, startHour: 7, shifts: 3 as 2 | 3, entries: SAMPLE.entries, day: SAMPLE.day, insensible: false }

export default function FluidBalanceLog() {
  const [s, set, reset] = useToolState('fluid-balance-log', DEF)
  const [form, setForm] = useState({ kind: 'in' as 'in' | 'out', route: 'Oral', ml: 200, t: '', note: '' })
  const dayEntries = s.entries.filter((e) => shiftIndex(s.day, e.t, s.startHour, s.shifts) >= 0).sort((a, b) => a.t.localeCompare(b.t))
  const labels = shiftLabels(s.startHour, s.shifts)
  const hours = 24 / s.shifts
  const perShift = labels.map((_, i) => totals(dayEntries.filter((e) => shiftIndex(s.day, e.t, s.startHour, s.shifts) === i)))
  const day = totals(dayEntries)
  const insens = s.insensible ? Math.round(s.weight * 10) : 0 // ≈10 mL/kg/day (skin + breath), rough adult estimate
  const balance = day.balance - insens
  const uo = urineRate(day.urine, s.weight, 24)
  const pts = running(s.day, dayEntries, s.startHour)
  const hh = (h: number) => `${pad((Math.floor(h) + s.startHour) % 24)}:${pad(Math.round((h % 1) * 60) % 60)}`

  const add = () => {
    if (!(form.ml > 0)) return
    const t = form.t || localStamp(new Date())
    set({ entries: [...s.entries, { id: uid(), t, kind: form.kind, route: form.route, ml: form.ml, note: form.note }], day: dayOf(t, s.startHour) })
    setForm({ ...form, note: '', t: '' })
  }
  const print = () => {
    const w = window.open('', '_blank')
    if (!w) return
    const row = (c: (string | number)[]) => `<tr>${c.map((x) => `<td>${String(x).replace(/</g, '&lt;')}</td>`).join('')}</tr>`
    w.document.write(`<!doctype html><title>Fluid balance ${s.day}</title><style>body{font:14px system-ui;margin:24px}table{border-collapse:collapse;width:100%;margin:12px 0}td,th{border:1px solid #999;padding:4px 8px;text-align:left}h1{font-size:20px}</style>
<h1>Fluid balance — ${s.patient.replace(/</g, '&lt;')}</h1><p>Clinical day ${s.day} ${pad(s.startHour)}:00 → ${addDays(s.day, 1)} ${pad(s.startHour)}:00 · weight ${s.weight} kg</p>
<table><tr><th>Shift</th><th>Intake mL</th><th>Output mL</th><th>Balance mL</th><th>Urine mL/kg/h</th></tr>${labels.map((l, i) => row([l, perShift[i].inMl, perShift[i].outMl, perShift[i].balance, urineRate(perShift[i].urine, s.weight, hours).toFixed(2)])).join('')}
${row(['24 h total', day.inMl, day.outMl, day.balance, uo.toFixed(2)])}</table>${insens ? `<p>Estimated insensible loss ${insens} mL → adjusted balance ${balance} mL</p>` : ''}
<table><tr><th>Time</th><th>Type</th><th>Route</th><th>mL</th><th>Note</th></tr>${dayEntries.map((e) => row([e.t.replace('T', ' '), e.kind === 'in' ? 'Intake' : 'Output', e.route, e.ml, e.note])).join('')}</table>
<p>Signature: ____________________</p><script>print()</script>`)
    w.document.close()
  }

  return (
    <div>
      <Stats>
        <Stat label="24 h intake" value={`${day.inMl.toLocaleString('en-US')} mL`} />
        <Stat label="24 h output" value={`${day.outMl.toLocaleString('en-US')} mL`} />
        <Stat label="Net balance" value={`${balance > 0 ? '+' : ''}${balance.toLocaleString('en-US')} mL`} tone={Math.abs(balance) > 1500 ? 'bad' : 'accent'} sub={insens ? `incl. −${insens} mL insensible` : 'measured only'} />
        <Stat label="Urine output" value={Number.isFinite(uo) ? `${uo.toFixed(2)} mL/kg/h` : '—'} tone={uo < 0.5 ? 'bad' : 'good'} sub={`${day.urine} mL / ${s.weight} kg / 24 h`} />
      </Stats>
      <Split>
        <div>
          <Panel title="Patient & shifts" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
            <Txt label="Patient / bed" value={s.patient} onChange={(patient) => set({ patient })} />
            <Row>
              <Num label="Weight" value={s.weight} unit="kg" min={0.5} onChange={(weight) => set({ weight })} />
              <Num label="Day starts at" value={s.startHour} unit="h" min={0} max={23} step={1} onChange={(v) => set({ startHour: Math.max(0, Math.min(23, Math.round(v))) })} />
            </Row>
            <Seg value={String(s.shifts) as '2' | '3'} onChange={(v) => set({ shifts: Number(v) as 2 | 3 })} options={[['3', '3 × 8 h shifts'], ['2', '2 × 12 h shifts']]} />
            <label className="k-check" style={{ marginTop: 8 }}><input type="checkbox" checked={s.insensible} onChange={(e) => set({ insensible: e.target.checked })} /> Subtract estimated insensible loss (≈10 mL/kg/day)</label>
          </Panel>
          <Panel title="Add entry">
            <Seg value={form.kind} onChange={(kind) => setForm({ ...form, kind, route: ROUTES[kind][0] })} options={[['in', '⬇ Intake'], ['out', '⬆ Output']]} />
            <Row>
              <Select label="Route" value={form.route} onChange={(route) => setForm({ ...form, route })} options={ROUTES[form.kind]} />
              <Num label="Volume" value={form.ml} unit="mL" min={1} onChange={(ml) => setForm({ ...form, ml })} />
            </Row>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
              {[50, 100, 150, 200, 250, 500, 1000].map((v) => <Btn key={v} kind={form.ml === v ? 'primary' : 'ghost'} onClick={() => setForm({ ...form, ml: v })}>{v}</Btn>)}
            </div>
            <Row>
              <label className="k-field"><span className="k-label">Time (blank = now)</span><input type="datetime-local" value={form.t} onChange={(e) => setForm({ ...form, t: e.target.value })} /></label>
              <Txt label="Note" value={form.note} onChange={(note) => setForm({ ...form, note })} placeholder="optional" />
            </Row>
            <Btn kind="primary" onClick={add} disabled={!(form.ml > 0)}>+ Record {form.kind === 'in' ? 'intake' : 'output'}</Btn>
          </Panel>
          <Panel title="By route (24 h)">
            <Table head={['Route', 'mL']} rows={Object.entries(day.byRoute).sort((a, b) => b[1] - a[1]).map(([k, v]) => [<span key="r"><b style={{ color: k.startsWith('in') ? 'var(--accent)' : '#f97316' }}>{k.startsWith('in') ? 'IN' : 'OUT'}</b> {k.slice(k.indexOf(':') + 1)}</span>, v.toLocaleString('en-US')])} />
          </Panel>
        </div>
        <div>
          <Panel title="Clinical day" actions={<>
            <Btn onClick={() => set({ day: addDays(s.day, -1) })}>◀</Btn>
            <input type="date" value={s.day} onChange={(e) => e.target.value && set({ day: e.target.value })} aria-label="Clinical day" />
            <Btn onClick={() => set({ day: addDays(s.day, 1) })}>▶</Btn>
            <Btn onClick={() => set({ day: dayOf(localStamp(new Date()), s.startHour) })}>Today</Btn>
          </>}>
            <Table head={['Shift', 'Intake', 'Output', 'Balance', 'Urine', 'mL/kg/h']}
              rows={labels.map((l, i) => {
                const t = perShift[i], r = urineRate(t.urine, s.weight, hours)
                return [l, t.inMl, t.outMl, <b key="b" style={{ color: t.balance < 0 ? '#f97316' : 'var(--accent)' }}>{t.balance > 0 ? '+' : ''}{t.balance}</b>, t.urine, <span key="u" style={{ color: r < 0.5 ? 'var(--err)' : undefined }}>{r.toFixed(2)}</span>]
              })}
              foot={['24 h', day.inMl, day.outMl, `${day.balance > 0 ? '+' : ''}${day.balance}`, day.urine, uo.toFixed(2)]} />
            {uo < 0.5 && <Note tone="warn">Urine output below 0.5 mL/kg/h over 24 h — consistent with oliguria criteria; review with the clinical team.</Note>}
            {perShift.some((t) => urineRate(t.urine, s.weight, hours) < 0.5) && uo >= 0.5 && <Note>One shift averaged below 0.5 mL/kg/h (highlighted).</Note>}
          </Panel>
          <Panel title="Running balance">
            <LineChart series={[{ name: 'Cumulative balance', points: pts, area: true }]} fx={hh} fy={(v) => `${Math.round(v)}`} yLabel="mL" xMin={0} xMax={24} height={230} markers={labels.slice(1).map((l, i) => ({ x: (i + 1) * hours, label: l.slice(0, 5) }))} />
          </Panel>
          <Panel title="Shift totals">
            <BarChart bars={labels.flatMap((l, i) => [{ label: `${l.slice(0, 5)} in`, value: perShift[i].inMl, color: '#6366f1' }, { label: `${l.slice(0, 5)} out`, value: perShift[i].outMl, color: '#f97316' }])} fy={(v) => `${Math.round(v)}`} height={200} />
          </Panel>
          <Panel title={`Entries (${dayEntries.length})`} actions={<>
            <Btn onClick={print}>🖨 Print summary</Btn>
            <CsvButton name={`fluid-balance-${s.day}.csv`} rows={() => [['time', 'type', 'route', 'ml', 'note'], ...dayEntries.map((e) => [e.t.replace('T', ' '), e.kind === 'in' ? 'intake' : 'output', e.route, e.ml, e.note])]} />
            <JsonButtons name="fluid-balance.json" data={s} onLoad={(d) => set(d)} />
          </>}>
            <Table head={['Time', '', 'Route', 'mL', 'Note', '']} rows={dayEntries.map((e) => [
              e.t.slice(11), <b key="k" style={{ color: e.kind === 'in' ? 'var(--accent)' : '#f97316' }}>{e.kind === 'in' ? 'IN' : 'OUT'}</b>, e.route, e.ml, <span key="n" className="muted">{e.note}</span>,
              <Btn key="x" kind="ghost" onClick={() => set({ entries: s.entries.filter((x) => x.id !== e.id) })} title="Delete">✕</Btn>,
            ])} />
            {dayEntries.length === 0 && <p className="muted">No entries in this clinical day.</p>}
          </Panel>
          <p className="muted" style={{ fontSize: 12 }}>Record-keeping aid only — follow your unit’s charting policy. Data stays in this browser (use Backup for safekeeping).</p>
        </div>
      </Split>
    </div>
  )
}
