import { useState } from 'react'
import { Area, Btn, Check, CsvButton, JsonButtons, LineChart, Note, Num, num, Panel, Row, Select, Seg, Split, Stat, Stats, Table, Txt, today, uid, useToolState } from '../kit'
import { parse, requestHours, timeline, usHolidays, workdays, type Method, type Policy, type Request } from './lib/pto-tracker'

const Y = new Date().getFullYear()
const METHODS: [Method, string][] = [['monthly', 'Monthly'], ['semimonthly', 'Semi-monthly (24)'], ['biweekly', 'Bi-weekly (26)'], ['hourly', 'Per hour worked'], ['lump', 'Lump sum at year start']]

const DEF = {
  employee: 'Alex Morgan',
  unit: 'days' as 'days' | 'hours',
  hpd: 8,
  yearStart: `${Y}-01-01`,
  policies: [
    { id: 'vac', name: 'Vacation', color: '#6366f1', annual: 160, method: 'semimonthly', carryCap: 40, maxCap: 240, start: 40 },
    { id: 'sick', name: 'Sick', color: '#ef4444', annual: 80, method: 'hourly', carryCap: 80, maxCap: 0, start: 16 },
    { id: 'pers', name: 'Personal', color: '#10b981', annual: 16, method: 'lump', carryCap: 0, maxCap: 0, start: 0 },
  ] as Policy[],
  requests: [
    { id: 'r1', type: 'vac', start: `${Y}-03-16`, end: `${Y}-03-20`, half: false, status: 'approved', note: 'Spring break' },
    { id: 'r2', type: 'sick', start: `${Y}-02-10`, end: `${Y}-02-11`, half: false, status: 'approved', note: 'Flu' },
    { id: 'r3', type: 'vac', start: `${Y}-07-06`, end: `${Y}-07-10`, half: false, status: 'approved', note: 'Summer trip' },
    { id: 'r4', type: 'pers', start: `${Y}-05-08`, end: `${Y}-05-08`, half: true, status: 'approved', note: 'Moving day' },
    { id: 'r5', type: 'vac', start: `${Y}-12-21`, end: `${Y}-12-31`, half: false, status: 'planned', note: 'Holidays' },
  ] as Request[],
  holidays: usHolidays(Y).join('\n'),
}
type S = typeof DEF

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export default function PtoTracker() {
  const [s, set, reset] = useToolState('pto-tracker', DEF)
  const [form, setForm] = useState({ type: s.policies[0]?.id ?? '', start: '', end: '', half: false, status: 'approved' as Request['status'], note: '' })
  const [err, setErr] = useState('')
  const holidays = new Set(s.holidays.split(/[\s,;]+/).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x)))
  const days = s.unit === 'days'
  const show = (h: number) => (Math.abs(h) < 0.005 ? '0' : days ? num(h / s.hpd, 2) : num(h, 1))
  const u = days ? 'd' : 'h'
  const toH = (v: number) => (days ? v * s.hpd : v)
  const y0 = parse(s.yearStart)
  const yStartYear = y0.getUTCFullYear()
  const yEnd = new Date(Date.UTC(yStartYear + 1, y0.getUTCMonth(), y0.getUTCDate()) - 86400000).toISOString().slice(0, 10)
  const now = today() < s.yearStart ? s.yearStart : today() > yEnd ? yEnd : today()

  const rows = s.policies.map((p) => {
    const mine = s.requests.filter((r) => r.type === p.id)
    const approved = mine.filter((r) => r.status === 'approved')
    const sofar = timeline(p, approved, s.yearStart, s.hpd, holidays, now)
    const full = timeline(p, mine, s.yearStart, s.hpd, holidays)
    const scheduled = approved.filter((r) => r.start > now).reduce((a, r) => a + requestHours(r, holidays, s.hpd), 0)
    const planned = mine.filter((r) => r.status === 'planned').reduce((a, r) => a + requestHours(r, holidays, s.hpd), 0)
    const minBal = Math.min(...full.points.map((x) => x.balance))
    return { p, sofar, full, scheduled, planned, minBal }
  })
  const editPol = (id: string, patch: Partial<Policy>) => set({ policies: s.policies.map((p) => (p.id === id ? { ...p, ...patch } : p)) })

  const addReq = () => {
    setErr('')
    if (!form.start) return setErr('Pick a start date.')
    const end = form.end || form.start
    if (end < form.start) return setErr('End date is before the start date.')
    const r: Request = { id: uid(), ...form, end }
    if (requestHours(r, holidays, s.hpd) === 0) return setErr('That range has no working days (weekends/holidays only).')
    set({ requests: [...s.requests, r].sort((a, b) => a.start.localeCompare(b.start)) })
    setForm({ ...form, start: '', end: '', note: '', half: false })
  }

  // calendar lookup: date → request
  const byDay = new Map<string, Request>()
  for (const r of s.requests) for (const d of workdays(r.start, r.end, holidays)) byDay.set(d, r)
  const pol = new Map(s.policies.map((p) => [p.id, p]))
  const clickDay = (d: string) => {
    if (!form.start || (form.start && form.end)) setForm({ ...form, start: d, end: '' })
    else if (d < form.start) setForm({ ...form, start: d, end: form.start })
    else setForm({ ...form, end: d })
  }
  const inSel = (d: string) => form.start && d >= form.start && d <= (form.end || form.start)

  return (
    <Split wide="right">
      <div>
        <Panel title="Employee & year" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Row>
            <Txt label="Employee" value={s.employee} onChange={(employee) => set({ employee })} />
            <Txt label="Plan year starts" type="date" value={s.yearStart} onChange={(yearStart) => yearStart && set({ yearStart })} />
          </Row>
          <Row>
            <Seg value={s.unit} onChange={(unit) => set({ unit })} options={[['days', 'Show days'], ['hours', 'Show hours']]} />
            <Num label="Hours per day" value={s.hpd} onChange={(hpd) => set({ hpd: Math.max(1, hpd) })} min={1} max={24} />
          </Row>
        </Panel>
        <Panel title="Accrual rules">
          {s.policies.map((p) => (
            <div key={p.id} style={{ borderLeft: `4px solid ${p.color}`, paddingLeft: 10, marginBottom: 14 }}>
              <Row>
                <Txt label="Leave type" value={p.name} onChange={(name) => editPol(p.id, { name })} />
                <Select label="Accrual" value={p.method} onChange={(method) => editPol(p.id, { method })} options={METHODS} />
              </Row>
              <Row>
                <Num label="Per year" value={+show(p.annual).replace(/,/g, '')} onChange={(v) => editPol(p.id, { annual: toH(v) })} unit={u} min={0} />
                <Num label="Starting balance" value={+show(p.start).replace(/,/g, '')} onChange={(v) => editPol(p.id, { start: toH(v) })} unit={u} />
              </Row>
              <Row>
                {p.carryCap >= 0 ? (
                  <Num label="Carry-over cap" value={+show(p.carryCap).replace(/,/g, '')} onChange={(v) => editPol(p.id, { carryCap: Math.max(0, toH(v)) })} unit={u} min={0} hint="0 = use it or lose it" />
                ) : (
                  <span className="muted" style={{ alignSelf: 'center' }}>Unlimited carry-over</span>
                )}
                <Num label="Max balance" value={+show(p.maxCap).replace(/,/g, '')} onChange={(v) => editPol(p.id, { maxCap: Math.max(0, toH(v)) })} unit={u} min={0} hint="accrual pauses here; 0 = none" />
              </Row>
              <Row>
                <Check label="Unlimited carry-over" value={p.carryCap < 0} onChange={(v) => editPol(p.id, { carryCap: v ? -1 : 40 })} />
                <input type="color" value={p.color} onChange={(e) => editPol(p.id, { color: e.target.value })} aria-label="Colour" style={{ width: 44, height: 30 }} />
                {s.policies.length > 1 && <Btn kind="ghost" onClick={() => set({ policies: s.policies.filter((x) => x.id !== p.id), requests: s.requests.filter((r) => r.type !== p.id) })}>Remove type</Btn>}
              </Row>
            </div>
          ))}
          <Btn onClick={() => set({ policies: [...s.policies, { id: uid(), name: 'New leave', color: '#f59e0b', annual: 8 * 3, method: 'lump', carryCap: -1, maxCap: 0, start: 0 }] })}>+ Leave type</Btn>
        </Panel>
        <Panel title="Company holidays" actions={<Btn onClick={() => set({ holidays: usHolidays(yStartYear).join('\n') })}>US {yStartYear}</Btn>}>
          <Area value={s.holidays} onChange={(holidays) => set({ holidays })} rows={5} mono />
          <p className="muted" style={{ fontSize: 12 }}>One date per line (YYYY-MM-DD). Holidays and weekends never consume PTO.</p>
        </Panel>
      </div>
      <div>
        <Stats>
          {rows.map(({ p, sofar, full }) => (
            <Stat key={p.id} label={`${p.name} balance today`} value={`${show(sofar.endBalance)} ${u}`} tone={sofar.endBalance < 0 ? 'bad' : 'accent'} sub={`year-end ${show(full.endBalance)} ${u}${full.forfeited > 0.01 ? ` · ${show(full.forfeited)} ${u} lost` : ''}`} />
          ))}
        </Stats>
        {rows.filter((r) => r.minBal < -0.01).map((r) => (
          <Note key={r.p.id} tone="err">{r.p.name} goes negative ({show(r.minBal)} {u}) — some requests exceed what will have accrued by then.</Note>
        ))}
        {rows.filter((r) => r.full.forfeited > 0.01).map((r) => (
          <Note key={r.p.id + 'f'} tone="warn">Use it or lose it: {show(r.full.forfeited)} {u} of {r.p.name} above the {show(r.p.carryCap)} {u} carry-over cap will be forfeited at year end ({yEnd}).</Note>
        ))}
        <Panel title={`Balances as of ${now}`}>
          <Table
            head={['Type', 'Start', 'Accrued YTD', 'Used', 'Booked ahead', 'Planned', 'Available now', 'Year-end']}
            rows={rows.map(({ p, sofar, full, scheduled, planned }) => [
              <b key="n" style={{ color: p.color }}>{p.name}</b>,
              show(p.start), show(sofar.accrued), show(sofar.used), show(scheduled), show(planned),
              <b key="a">{show(sofar.endBalance)}</b>,
              show(full.endBalance),
            ])}
          />
        </Panel>
        <Panel title="Balance through the year">
          <LineChart
            series={rows.map(({ p, full }) => ({ name: p.name, color: p.color, points: full.points.map((x) => [(parse(x.date).getTime() - y0.getTime()) / 86400000, days ? x.balance / s.hpd : x.balance] as [number, number]) }))}
            height={220}
            fx={(v) => { const d = new Date(y0.getTime() + v * 86400000); return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}` }}
            fy={(v) => num(v, 1)}
            yLabel={days ? 'days' : 'hours'}
            markers={[{ x: (parse(now).getTime() - y0.getTime()) / 86400000, label: 'today' }]}
          />
        </Panel>
        <Panel title="Calendar">
          <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>Click two days to fill the request form below. Faded = planned, ring = holiday.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(168px, 1fr))', gap: 12 }}>
            {Array.from({ length: 12 }, (_, m) => {
              const first = new Date(Date.UTC(yStartYear, y0.getUTCMonth() + m, 1))
              const dim = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate()
              const lead = (first.getUTCDay() + 6) % 7
              return (
                <div key={m}>
                  <b style={{ fontSize: 13 }}>{MONTHS[first.getUTCMonth()]} {first.getUTCFullYear()}</b>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, fontSize: 10.5, marginTop: 4 }}>
                    {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <span key={i} className="muted" style={{ textAlign: 'center' }}>{d}</span>)}
                    {Array.from({ length: lead }, (_, i) => <span key={'x' + i} />)}
                    {Array.from({ length: dim }, (_, i) => {
                      const d = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), i + 1))
                      const ds = d.toISOString().slice(0, 10)
                      const r = byDay.get(ds)
                      const c = r ? pol.get(r.type)?.color : undefined
                      const we = d.getUTCDay() === 0 || d.getUTCDay() === 6
                      return (
                        <button
                          key={ds}
                          type="button"
                          title={r ? `${pol.get(r.type)?.name}: ${r.note || ''} (${r.status})` : holidays.has(ds) ? 'Holiday' : ds}
                          onClick={() => clickDay(ds)}
                          style={{
                            padding: 0, height: 20, border: holidays.has(ds) ? '1.5px solid var(--warn)' : ds === now ? '1.5px solid var(--fg)' : '1px solid transparent', borderRadius: 4, cursor: 'pointer', fontSize: 10.5,
                            background: inSel(ds) ? 'var(--accent2)' : c ?? (we ? 'var(--panel2)' : 'transparent'),
                            opacity: r?.status === 'planned' ? 0.5 : 1,
                            color: c || inSel(ds) ? '#fff' : we ? 'var(--muted)' : 'var(--fg)',
                          }}
                        >
                          {i + 1}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </Panel>
        <Panel title="Requests" actions={<><CsvButton name="pto-requests.csv" rows={() => [['Employee', 'Type', 'Start', 'End', 'Workdays', days ? 'Days' : 'Hours', 'Status', 'Note'], ...s.requests.map((r) => [s.employee, pol.get(r.type)?.name ?? r.type, r.start, r.end, workdays(r.start, r.end, holidays).length, +show(requestHours(r, holidays, s.hpd)).replace(/,/g, ''), r.status, r.note])]} /><JsonButtons name="pto-tracker.json" data={s} onLoad={(d: S) => d && Array.isArray(d.policies) && set({ ...DEF, ...d })} /></>}>
          <Row>
            <Select label="Type" value={form.type} onChange={(type) => setForm({ ...form, type })} options={s.policies.map((p) => [p.id, p.name] as [string, string])} />
            <Txt label="Start" type="date" value={form.start} onChange={(start) => setForm({ ...form, start })} />
            <Txt label="End" type="date" value={form.end} onChange={(end) => setForm({ ...form, end })} />
          </Row>
          <Row>
            <Select label="Status" value={form.status} onChange={(status) => setForm({ ...form, status })} options={[['approved', 'Approved'], ['planned', 'Planned / pending']]} />
            <Txt label="Note" value={form.note} onChange={(note) => setForm({ ...form, note })} />
          </Row>
          <Row>
            <Check label="Last day is a half day" value={form.half} onChange={(half) => setForm({ ...form, half })} />
            {form.start && <span className="muted">{workdays(form.start, form.end || form.start, holidays).length} workdays · {show(requestHours({ id: '', ...form, end: form.end || form.start }, holidays, s.hpd))} {u}</span>}
            <Btn kind="primary" onClick={addReq}>+ Add request</Btn>
          </Row>
          {err && <Note tone="err">{err}</Note>}
          <Table
            head={['Type', 'Dates', 'Workdays', days ? 'Days' : 'Hours', 'Status', 'Note', '']}
            rows={s.requests.map((r) => [
              <b key="t" style={{ color: pol.get(r.type)?.color }}>{pol.get(r.type)?.name ?? '?'}</b>,
              r.start === r.end ? r.start : `${r.start} → ${r.end}`,
              workdays(r.start, r.end, holidays).length,
              show(requestHours(r, holidays, s.hpd)),
              <select key="s" value={r.status} onChange={(e) => set({ requests: s.requests.map((x) => (x.id === r.id ? { ...x, status: e.target.value as Request['status'] } : x)) })} aria-label="Status">
                <option value="approved">Approved</option>
                <option value="planned">Planned</option>
              </select>,
              r.note,
              <Btn key="x" kind="ghost" title="Remove" onClick={() => set({ requests: s.requests.filter((x) => x.id !== r.id) })}>✕</Btn>,
            ])}
          />
        </Panel>
      </div>
    </Split>
  )
}
