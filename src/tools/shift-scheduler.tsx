import { useState } from 'react'
import { Bar, Btn, CsvButton, download, JsonButtons, money, Note, Num, num, Panel, Row, Select, Stat, Stats, Table, today, uid, useToolState } from '../kit'
import { addDays, autoFill, coverage, DAYS, empHours, hours, ics, issues, key, monday, type Cells, type Emp, type Tpl } from './lib/shift-scheduler'

interface State { weekStart: string; minRest: number; weeks: number; place: string; currency: string; emps: Emp[]; tpls: Tpl[]; cells: Cells }

const emp = (name: string, role: string, color: string, max: number, rate: number): Emp => ({ id: uid(), name, role, color, max, rate })
const TPLS: Tpl[] = [
  { id: 'open', name: 'Opening', start: '06:00', end: '14:00', brk: 30, color: '#f59e0b', need: [2, 2, 2, 2, 2, 3, 2] },
  { id: 'mid', name: 'Mid', start: '10:00', end: '18:00', brk: 30, color: '#10b981', need: [1, 1, 1, 1, 2, 2, 1] },
  { id: 'close', name: 'Closing', start: '14:00', end: '22:00', brk: 30, color: '#6366f1', need: [2, 2, 2, 2, 2, 2, 1] },
  { id: 'night', name: 'Night', start: '22:00', end: '06:00', brk: 0, color: '#334155', need: [1, 1, 1, 1, 1, 1, 1] },
]
const EMPS: Emp[] = [
  emp('Alex Rivera', 'Supervisor', '#ef4444', 40, 24), emp('Bea Novak', 'Barista', '#0ea5e9', 40, 17.5), emp('Chen Li', 'Barista', '#a855f7', 32, 17.5),
  emp('Dana Okafor', 'Cashier', '#14b8a6', 40, 16), emp('Eli Moreau', 'Cashier', '#f97316', 24, 16), emp('Farah Haddad', 'Cook', '#ec4899', 40, 19),
  emp('Gus Berg', 'Cook', '#84cc16', 40, 19), emp('Hana Sato', 'Security', '#64748b', 40, 18), emp('Ivan Petrenko', 'Security', '#eab308', 32, 18),
]
const DEF: State = { weekStart: monday(today()), minRest: 11, weeks: 1, place: '', currency: '$', emps: EMPS, tpls: TPLS, cells: autoFill(EMPS, TPLS, {}).cells }

const fmtDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

export default function ShiftScheduler() {
  const [s, set, reset] = useToolState('shift-scheduler', DEF)
  const [brush, setBrush] = useState<string>('')
  const [over, setOver] = useState('')
  const [msg, setMsg] = useState('')
  const T = (id: string | undefined) => s.tpls.find((t) => t.id === id)
  const iss = issues(s.emps, s.cells, s.tpls, s.minRest)
  const bad = new Set(iss.filter((i) => i.kind === 'rest').map((i) => key(i.emp, i.day)))
  const totalH = s.emps.reduce((a, e) => a + empHours(e.id, s.cells, s.tpls), 0)
  const cost = s.emps.reduce((a, e) => a + empHours(e.id, s.cells, s.tpls) * e.rate, 0)
  const gaps = s.tpls.flatMap((t) => DAYS.map((_, d) => Math.max(0, (t.need[d] ?? 0) - coverage(s.cells, s.emps, t.id, d)))).reduce((a, b) => a + b, 0)
  const setCell = (k: string, v: string | null) => set((st) => {
    const cells = { ...st.cells }
    if (v) cells[k] = v
    else delete cells[k]
    return { ...st, cells }
  })
  const editEmp = (id: string, p: Partial<Emp>) => set({ emps: s.emps.map((e) => (e.id === id ? { ...e, ...p } : e)) })
  const editTpl = (id: string, p: Partial<Tpl>) => set({ tpls: s.tpls.map((t) => (t.id === id ? { ...t, ...p } : t)) })

  const onDrop = (e: React.DragEvent, k: string) => {
    e.preventDefault()
    setOver('')
    try {
      const d = JSON.parse(e.dataTransfer.getData('text/plain')) as { tpl: string; from?: string }
      set((st) => {
        const cells = { ...st.cells, [k]: d.tpl }
        if (d.from && d.from !== k && !(e.ctrlKey || e.altKey || e.metaKey)) delete cells[d.from]
        return { ...st, cells }
      })
    } catch { /* not ours */ }
  }
  const chip = (t: Tpl, small = false) => (
    <span style={{ display: 'inline-block', background: t.color, color: '#fff', borderRadius: 6, padding: small ? '2px 6px' : '4px 8px', fontSize: small ? 11.5 : 13, fontWeight: 700, lineHeight: 1.25, textShadow: '0 1px 1px rgba(0,0,0,.25)' }}>
      {t.name}<br /><span style={{ fontWeight: 500, opacity: 0.95 }}>{t.start}–{t.end}</span>
    </span>
  )
  const printIt = () => {
    const w = window.open('', '_blank')
    if (!w) return
    const head = DAYS.map((d, i) => `<th>${d}<br><small>${fmtDate(addDays(s.weekStart, i))}</small></th>`).join('')
    const rows = s.emps.map((e) => `<tr><td><b>${e.name}</b><br><small>${e.role}</small></td>${DAYS.map((_, d) => { const t = T(s.cells[key(e.id, d)]); return `<td style="background:${t ? t.color + '33' : ''}">${t ? `<b>${t.name}</b><br>${t.start}–${t.end}` : '—'}</td>` }).join('')}<td>${num(empHours(e.id, s.cells, s.tpls), 1)} h</td></tr>`).join('')
    w.document.write(`<!doctype html><title>Shift schedule</title><style>body{font:13px system-ui;margin:24px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #999;padding:6px;text-align:center}td:first-child{text-align:left}</style><h2>Shift schedule · week of ${fmtDate(s.weekStart)}</h2><table><tr><th>Employee</th>${head}<th>Hours</th></tr>${rows}</table><p>Total ${num(totalH, 1)} h · labour cost ${money(cost, s.currency)}</p><script>print()</script>`)
    w.document.close()
  }

  return (
    <div>
      <Stats>
        <Stat label="Scheduled hours" value={`${num(totalH, 1)} h`} sub={`${Object.keys(s.cells).length} shifts`} />
        <Stat label="Labour cost" value={money(cost, s.currency, 0)} sub={totalH ? `${money(cost / totalH, s.currency)} avg / h` : ''} />
        <Stat label="Open positions" value={gaps} tone={gaps ? 'bad' : 'good'} sub={gaps ? 'below required staffing' : 'all needs covered'} />
        <Stat label="Rule warnings" value={iss.length} tone={iss.length ? 'bad' : 'good'} sub={`min. rest ${s.minRest} h`} />
      </Stats>
      <Panel title={`Week of ${fmtDate(s.weekStart)} – ${fmtDate(addDays(s.weekStart, 6))}`} actions={<>
        <Btn kind="ghost" onClick={() => set({ weekStart: addDays(s.weekStart, -7) })}>◀</Btn>
        <input type="date" className="k-text" value={s.weekStart} onChange={(e) => e.target.value && set({ weekStart: monday(e.target.value) })} aria-label="Week" style={{ width: 150 }} />
        <Btn kind="ghost" onClick={() => set({ weekStart: addDays(s.weekStart, 7) })}>▶</Btn>
        <Btn kind="primary" onClick={() => { const r = autoFill(s.emps, s.tpls, s.cells, s.minRest); set({ cells: r.cells }); setMsg(r.short.length ? `Could not fill ${r.short.reduce((a, x) => a + x.missing, 0)} position(s): ${r.short.slice(0, 4).map((x) => `${DAYS[x.day]} ${T(x.tpl)?.name} (−${x.missing})`).join(', ')}` : 'All staffing needs filled.') }}>✨ Auto-fill</Btn>
        <Btn kind="ghost" onClick={() => { set({ cells: {} }); setMsg('') }}>Clear</Btn>
      </>}>
        <Row>
          <span className="muted" style={{ fontSize: 13 }}>Drag a shift onto the grid (hold Ctrl/Alt to copy a placed shift) — or tap a shift below to pick it as a brush and tap cells:</span>
        </Row>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '6px 0 10px' }}>
          {s.tpls.map((t) => (
            <span key={t.id} draggable onDragStart={(e) => e.dataTransfer.setData('text/plain', JSON.stringify({ tpl: t.id }))} onClick={() => setBrush(brush === t.id ? '' : t.id)}
              style={{ cursor: 'grab', outline: brush === t.id ? '3px solid var(--accent)' : undefined, borderRadius: 8 }}>{chip(t)}</span>
          ))}
          <button type="button" className="k-btn" onClick={() => setBrush(brush === 'erase' ? '' : 'erase')} style={{ outline: brush === 'erase' ? '3px solid var(--accent)' : undefined }}>⌫ Eraser</button>
        </div>
        {msg && <Note tone={msg.startsWith('All') ? 'ok' : 'warn'}>{msg}</Note>}
        <div className="k-table-wrap">
          <table className="k-table" style={{ minWidth: 860 }}>
            <thead>
              <tr>
                <th>Employee</th>
                {DAYS.map((d, i) => <th key={d} style={{ textAlign: 'center' }}>{d}<br /><small className="muted">{fmtDate(addDays(s.weekStart, i))}</small></th>)}
                <th>Hours</th>
              </tr>
            </thead>
            <tbody>
              {s.emps.map((e) => {
                const h = empHours(e.id, s.cells, s.tpls)
                return (
                  <tr key={e.id}>
                    <td style={{ whiteSpace: 'nowrap' }}><i style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 5, background: e.color, marginRight: 6 }} /><b>{e.name}</b><br /><small className="muted">{e.role}</small></td>
                    {DAYS.map((_, d) => {
                      const k = key(e.id, d), t = T(s.cells[k])
                      return (
                        <td key={d} onDragOver={(ev) => { ev.preventDefault(); setOver(k) }} onDragLeave={() => setOver('')} onDrop={(ev) => onDrop(ev, k)}
                          onClick={() => brush && setCell(k, brush === 'erase' ? null : brush)}
                          style={{ textAlign: 'center', minWidth: 92, padding: 4, cursor: brush ? 'copy' : undefined, background: over === k ? 'color-mix(in srgb, var(--accent) 18%, transparent)' : undefined, boxShadow: bad.has(k) ? 'inset 0 0 0 2px var(--err)' : undefined }}>
                          {t ? (
                            <span draggable onDragStart={(ev) => ev.dataTransfer.setData('text/plain', JSON.stringify({ tpl: t.id, from: k }))} style={{ position: 'relative', cursor: 'grab', display: 'inline-block' }} title={`${hours(t)} paid h`}>
                              {chip(t, true)}
                              {!brush && <button type="button" onClick={(ev) => { ev.stopPropagation(); setCell(k, null) }} aria-label="Remove shift" style={{ position: 'absolute', top: -6, right: -6, width: 16, height: 16, borderRadius: 8, border: 0, background: 'var(--panel)', color: 'var(--muted)', fontSize: 10, lineHeight: '16px', padding: 0, cursor: 'pointer' }}>✕</button>}
                            </span>
                          ) : <span className="muted" style={{ fontSize: 12 }}>off</span>}
                        </td>
                      )
                    })}
                    <td style={{ minWidth: 90 }}>
                      <b style={{ color: e.max && h > e.max ? 'var(--err)' : undefined }}>{num(h, 1)}</b><span className="muted"> / {e.max || '∞'} h</span>
                      <Bar value={h} max={e.max || 40} color={e.max && h > e.max ? 'var(--err)' : e.color} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              {s.tpls.map((t) => (
                <tr key={t.id}>
                  <td><small><b>{t.name}</b> covered / needed</small></td>
                  {DAYS.map((_, d) => {
                    const c = coverage(s.cells, s.emps, t.id, d), n = t.need[d] ?? 0
                    return <td key={d} style={{ textAlign: 'center', color: c < n ? 'var(--err)' : c > n ? 'var(--warn)' : 'var(--ok)', fontWeight: 700 }}>{c}/{n}</td>
                  })}
                  <td />
                </tr>
              ))}
            </tfoot>
          </table>
        </div>
        <Row>
          <Btn onClick={printIt}>🖨 Print</Btn>
          <Btn onClick={() => download(`shifts-${s.weekStart}.ics`, ics(s.weekStart, s.emps, s.cells, s.tpls, { weeks: s.weeks, place: s.place }), 'text/calendar')}>📅 ICS (everyone)</Btn>
          <select className="k-select" style={{ maxWidth: 220 }} value="" onChange={(e) => e.target.value && download(`shifts-${s.emps.find((x) => x.id === e.target.value)?.name.replace(/\W+/g, '-')}-${s.weekStart}.ics`, ics(s.weekStart, s.emps, s.cells, s.tpls, { only: e.target.value, weeks: s.weeks, place: s.place }), 'text/calendar')} aria-label="ICS for one employee">
            <option value="">📅 ICS for one person…</option>
            {s.emps.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          <CsvButton name={`shifts-${s.weekStart}.csv`} rows={() => [['Employee', 'Role', ...DAYS.map((d, i) => `${d} ${addDays(s.weekStart, i)}`), 'Hours', 'Cost'], ...s.emps.map((e) => { const h = empHours(e.id, s.cells, s.tpls); return [e.name, e.role, ...DAYS.map((_, d) => { const t = T(s.cells[key(e.id, d)]); return t ? `${t.name} ${t.start}-${t.end}` : '' }), +h.toFixed(2), +(h * e.rate).toFixed(2)] })]} />
          <JsonButtons name="shift-schedule.json" data={s} onLoad={(d) => d && Array.isArray(d.emps) && set({ ...DEF, ...d })} />
          <Btn kind="ghost" onClick={reset}>Reset</Btn>
        </Row>
      </Panel>
      {iss.length > 0 && <Note tone="warn"><b>Check these:</b><ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{iss.slice(0, 10).map((i) => <li key={i.text}>{i.text}</li>)}</ul></Note>}
      <div className="k-split">
        <Panel title="Employees" actions={<Btn onClick={() => set({ emps: [...s.emps, emp('New person', '', '#0ea5e9', 40, 15)] })}>+ Employee</Btn>}>
          <Table
            head={['Name', 'Role', 'Colour', 'Max h', `Rate ${s.currency}/h`, '']}
            rows={s.emps.map((e) => [
              <input key="n" value={e.name} onChange={(ev) => editEmp(e.id, { name: ev.target.value })} aria-label="Name" style={{ width: 120 }} />,
              <input key="r" value={e.role} onChange={(ev) => editEmp(e.id, { role: ev.target.value })} aria-label="Role" style={{ width: 90 }} />,
              <input key="c" type="color" value={e.color} onChange={(ev) => editEmp(e.id, { color: ev.target.value })} aria-label="Colour" />,
              <input key="m" type="number" min={0} value={e.max} onChange={(ev) => editEmp(e.id, { max: Math.max(0, Number(ev.target.value) || 0) })} style={{ width: 60 }} aria-label="Max hours" />,
              <input key="w" type="number" min={0} step={0.5} value={e.rate} onChange={(ev) => editEmp(e.id, { rate: Math.max(0, Number(ev.target.value) || 0) })} style={{ width: 66 }} aria-label="Rate" />,
              <Btn key="x" kind="ghost" onClick={() => set((st) => ({ ...st, emps: st.emps.filter((x) => x.id !== e.id), cells: Object.fromEntries(Object.entries(st.cells).filter(([k]) => !k.startsWith(e.id + ':'))) }))}>✕</Btn>,
            ])}
          />
        </Panel>
        <div>
          <Panel title="Shift types & staffing needs" actions={<Btn onClick={() => set({ tpls: [...s.tpls, { id: uid(), name: 'Custom', start: '12:00', end: '20:00', brk: 30, color: '#ec4899', need: [0, 0, 0, 0, 0, 0, 0] }] })}>+ Shift</Btn>}>
            <Table
              head={['Shift', 'Start', 'End', 'Break', 'Paid', ...DAYS.map((d) => `${d[0]}${d[1]}`), '']}
              rows={s.tpls.map((t) => [
                <span key="n" style={{ display: 'flex', gap: 4 }}><input type="color" value={t.color} onChange={(ev) => editTpl(t.id, { color: ev.target.value })} aria-label="Colour" style={{ width: 28 }} /><input value={t.name} onChange={(ev) => editTpl(t.id, { name: ev.target.value })} style={{ width: 80 }} aria-label="Shift name" /></span>,
                <input key="s" type="time" value={t.start} onChange={(ev) => editTpl(t.id, { start: ev.target.value })} aria-label="Start" />,
                <input key="e" type="time" value={t.end} onChange={(ev) => editTpl(t.id, { end: ev.target.value })} aria-label="End" />,
                <input key="b" type="number" min={0} step={5} value={t.brk} onChange={(ev) => editTpl(t.id, { brk: Math.max(0, Number(ev.target.value) || 0) })} style={{ width: 52 }} aria-label="Break minutes" />,
                `${num(hours(t), 2)} h`,
                ...DAYS.map((_, d) => <input key={d} type="number" min={0} value={t.need[d] ?? 0} onChange={(ev) => editTpl(t.id, { need: DAYS.map((__, j) => (j === d ? Math.max(0, Math.round(Number(ev.target.value) || 0)) : t.need[j] ?? 0)) })} style={{ width: 40 }} aria-label={`Need ${DAYS[d]}`} />),
                <Btn key="x" kind="ghost" onClick={() => set((st) => ({ ...st, tpls: st.tpls.filter((x) => x.id !== t.id), cells: Object.fromEntries(Object.entries(st.cells).filter(([, v]) => v !== t.id)) }))}>✕</Btn>,
              ])}
            />
            <p className="muted" style={{ fontSize: 13 }}>End before start = overnight shift. Break minutes are unpaid. The day columns are how many people each shift needs.</p>
          </Panel>
          <Panel title="Rules & export">
            <Row>
              <Num label="Minimum rest between shifts" value={s.minRest} onChange={(minRest) => set({ minRest: Math.max(0, minRest) })} unit="h" min={0} max={24} hint="EU Working Time Directive: 11 h" />
              <Num label="Repeat in calendar" value={s.weeks} onChange={(weeks) => set({ weeks: Math.max(1, Math.round(weeks)) })} unit="weeks" min={1} max={52} />
            </Row>
            <Row>
              <label className="k-field"><span className="k-label">Location (for ICS)</span><input className="k-text" value={s.place} onChange={(e) => set({ place: e.target.value })} placeholder="e.g. Main St store" /></label>
              <Select label="Currency" value={s.currency} onChange={(currency) => set({ currency })} options={['$', '€', '£', '₴', 'zł', '¥']} />
            </Row>
          </Panel>
        </div>
      </div>
    </div>
  )
}
