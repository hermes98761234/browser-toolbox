import { useState } from 'react'
import { BarChart, Btn, CsvButton, download, money, Note, Num, Panel, Row, Seg, Select, Split, Stat, Stats, Txt, useToolState } from '../kit'
import { dec, hm, parseClock, pay, roundTo, shiftMinutes, splitWeek, sum, type Rounding, type Rules } from './lib/timesheet-calculator'

interface Entry { start: string; end: string; brk: number; start2: string; end2: string; note: string }
const E = (start = '', end = '', brk = 0, start2 = '', end2 = '', note = ''): Entry => ({ start, end, brk, start2, end2, note })

function mondayOf(d: Date): string {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7))
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}
const isoOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const addDays = (iso: string, n: number) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d + n)
}
const PRESETS: Record<string, [string, Rules]> = {
  flsa: ['US federal (40 h/week)', { dailyOt: null, dailyDt: null, weeklyOt: 2400 }],
  ca: ['California (8 h/day, 12 h DT, 40 h/week)', { dailyOt: 480, dailyDt: 720, weeklyOt: 2400 }],
  daily8: ['8 h per day only', { dailyOt: 480, dailyDt: null, weeklyOt: null }],
  none: ['No overtime', { dailyOt: null, dailyDt: null, weeklyOt: null }],
}
const DEF = {
  employee: 'Alex Rivera', company: 'Harbor Lane Bakery', weekStart: mondayOf(new Date()), weeks: 1 as 1 | 2,
  rate: 22.5, currency: '$', otX: 1.5, dtX: 2, preset: 'ca', custom: { dailyOt: 8, dailyDt: 12, weeklyOt: 40 }, rounding: 0 as Rounding, fmt: 'hm' as 'hm' | 'dec',
  entries: [
    E('8:00', '16:30', 30), E('7:55', '17:10', 45), E('8:05', '12:00', 0, '13:00', '19:40', 'Inventory'), E('8:00', '16:30', 30), E('9:00', '18:15', 30),
    E('10:00', '14:20', 0, '', '', 'Weekend market'), E(),
    ...Array.from({ length: 7 }, () => E()),
  ] as Entry[],
}
const DAY = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export default function TimesheetCalculator() {
  const [s, set, reset] = useToolState('timesheet-calculator', DEF)
  const [conv, setConv] = useState('7:45')
  const nDays = s.weeks * 7
  const entries = Array.from({ length: nDays }, (_, i) => s.entries[i] ?? E())
  const rules: Rules = s.preset === 'custom'
    ? { dailyOt: s.custom.dailyOt > 0 ? s.custom.dailyOt * 60 : null, dailyDt: s.custom.dailyDt > 0 ? s.custom.dailyDt * 60 : null, weeklyOt: s.custom.weeklyOt > 0 ? s.custom.weeklyOt * 60 : null }
    : PRESETS[s.preset][1]
  const pt = (t: string) => (t.trim() ? roundTo(parseClock(t), s.rounding) : NaN)
  const bad = (t: string) => t.trim() !== '' && !Number.isFinite(parseClock(t))
  const worked = entries.map((e) => shiftMinutes(pt(e.start), pt(e.end), e.brk) + shiftMinutes(pt(e.start2), pt(e.end2), 0))
  const split = [...splitWeek(worked.slice(0, 7), rules), ...(s.weeks === 2 ? splitWeek(worked.slice(7, 14), rules) : [])]
  const tot = { worked: sum(split.map((d) => d.worked)), reg: sum(split.map((d) => d.reg)), ot: sum(split.map((d) => d.ot)), dt: sum(split.map((d) => d.dt)) }
  const p = pay(tot, s.rate, s.otX, s.dtX)
  const f = (m: number) => (s.fmt === 'hm' ? hm(m) : dec(m).toFixed(2))
  const m = (x: number) => money(x, s.currency)
  const edit = (i: number, patch: Partial<Entry>) => set({ entries: Array.from({ length: 14 }, (_, j) => (j === i ? { ...(s.entries[j] ?? E()), ...patch } : (s.entries[j] ?? E()))) })
  const date = (i: number) => addDays(s.weekStart, i)
  const dateStr = (i: number) => date(i).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const daysWorked = worked.filter((w) => w > 0).length
  const longShift = entries.findIndex((e, i) => worked[i] > 360 && e.brk === 0 && !e.start2.trim())

  const rows = () => [
    ['Date', 'Day', 'In', 'Out', 'Break (min)', 'In 2', 'Out 2', 'Worked (h)', 'Regular (h)', 'Overtime (h)', 'Double time (h)', 'Note'],
    ...entries.map((e, i) => [isoOf(date(i)), DAY[i % 7], e.start, e.end, e.brk, e.start2, e.end2, dec(split[i].worked), dec(split[i].reg), dec(split[i].ot), dec(split[i].dt), e.note]),
    ['Total', '', '', '', '', '', '', dec(tot.worked), dec(tot.reg), dec(tot.ot), dec(tot.dt), ''],
  ]

  const pdf = async () => {
    const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
    const doc = await PDFDocument.create()
    const page = doc.addPage([842, 595])
    const font = await doc.embedFont(StandardFonts.Helvetica), bold = await doc.embedFont(StandardFonts.HelveticaBold)
    const txt = (t: string, x: number, y: number, size = 9, b = false) => page.drawText(t.replace(/[^\x20-\x7E]/g, '?'), { x, y, size, font: b ? bold : font, color: rgb(0.1, 0.1, 0.15) })
    txt('TIMESHEET', 40, 550, 18, true)
    txt(`${s.employee}  ·  ${s.company}`, 40, 530, 11)
    txt(`Period: ${date(0).toDateString()} - ${date(nDays - 1).toDateString()}   Rate: ${s.currency}${s.rate}/h   Rules: ${s.preset === 'custom' ? 'custom' : PRESETS[s.preset][0]}`, 40, 514, 9)
    const cols = [40, 110, 150, 200, 250, 300, 350, 400, 460, 520, 580, 650]
    const data = rows()
    let y = 488
    data.forEach((r, k) => {
      if (k === 0 || k === data.length - 1) page.drawRectangle({ x: 36, y: y - 4, width: 770, height: 16, color: rgb(0.93, 0.94, 0.97) })
      r.forEach((c, j) => txt(String(c).slice(0, j === 11 ? 28 : 12), cols[j], y, k === 0 ? 7.5 : 9, k === 0 || k === data.length - 1))
      y -= 18
    })
    y -= 10
    txt(`Gross pay: ${s.currency}${p.total.toFixed(2)}  (regular ${p.reg.toFixed(2)} + overtime ${p.ot.toFixed(2)} + double time ${p.dt.toFixed(2)})`, 40, y, 10, true)
    y -= 50
    for (const [label, x] of [['Employee signature', 40], ['Supervisor signature', 330], ['Date', 620]] as const) {
      page.drawLine({ start: { x, y }, end: { x: x + 230 - (label === 'Date' ? 80 : 0), y }, thickness: 0.8, color: rgb(0.3, 0.3, 0.3) })
      txt(label, x, y - 12, 8)
    }
    download(`timesheet-${s.weekStart}.pdf`, new Blob([(await doc.save()).slice().buffer], { type: 'application/pdf' }), 'application/pdf')
  }

  const inp = (v: string, on: (x: string) => void, label: string) => (
    <input value={v} onChange={(e) => on(e.target.value)} aria-label={label} placeholder="–" style={{ width: 62, borderColor: bad(v) ? 'var(--err)' : undefined, color: bad(v) ? 'var(--err)' : undefined }} />
  )
  const convM = parseClock(conv)
  const convDec = Number(conv)

  return (
    <Split wide="right">
      <div>
        <Panel title="Employee & period">
          <Txt label="Employee" value={s.employee} onChange={(employee) => set({ employee })} />
          <Txt label="Company" value={s.company} onChange={(company) => set({ company })} />
          <Row>
            <Txt label="Week starting (Monday)" type="date" value={s.weekStart} onChange={(v) => v && set({ weekStart: mondayOf(addDays(v, 0)) })} />
            <Select label="Period" value={s.weeks} onChange={(weeks) => set({ weeks })} options={[[1, 'Weekly'], [2, 'Bi-weekly']]} />
          </Row>
          <Row>
            <Num label="Hourly rate" value={s.rate} onChange={(rate) => set({ rate })} unit={s.currency} min={0} />
            <Select label="Currency" value={s.currency} onChange={(currency) => set({ currency })} options={['$', '€', '£', 'A$', 'C$', '₴', 'zł']} />
          </Row>
        </Panel>
        <Panel title="Overtime rules">
          <Select label="Preset" value={s.preset} onChange={(preset) => set({ preset })} options={[...Object.entries(PRESETS).map(([k, [l]]) => [k, l] as const), ['custom', 'Custom…']]} />
          {s.preset === 'custom' && (
            <Row>
              <Num label="Daily OT after" value={s.custom.dailyOt} onChange={(v) => set({ custom: { ...s.custom, dailyOt: v } })} unit="h" min={0} />
              <Num label="Double time after" value={s.custom.dailyDt} onChange={(v) => set({ custom: { ...s.custom, dailyDt: v } })} unit="h" min={0} />
              <Num label="Weekly OT after" value={s.custom.weeklyOt} onChange={(v) => set({ custom: { ...s.custom, weeklyOt: v } })} unit="h" min={0} />
            </Row>
          )}
          <Row>
            <Num label="OT multiplier" value={s.otX} onChange={(otX) => set({ otX })} unit="×" min={1} step={0.25} />
            <Num label="DT multiplier" value={s.dtX} onChange={(dtX) => set({ dtX })} unit="×" min={1} step={0.25} />
          </Row>
          <Select label="Round punches to" value={s.rounding} onChange={(rounding) => set({ rounding })} options={[[0, 'Exact minutes'], [5, 'Nearest 5 min'], [6, 'Nearest 6 min (1/10 h)'], [10, 'Nearest 10 min'], [15, 'Nearest 15 min (7-minute rule)']]} />
          <Note>Daily rules are applied first, then regular hours beyond the weekly limit become overtime, so no hour is paid twice. A 0 in a custom field turns that rule off. Check your local labour law.</Note>
        </Panel>
        <Panel title="Hours ⇄ decimal converter">
          <Txt label="h:mm or decimal hours" value={conv} onChange={setConv} />
          <p style={{ margin: 0 }}>
            {conv.includes(':') && Number.isFinite(convM) ? <><b>{conv}</b> = <b>{dec(convM).toFixed(2)}</b> decimal hours = {convM} min</> : Number.isFinite(convDec) && conv.trim() ? <><b>{convDec}</b> h = <b>{hm(convDec * 60)}</b> = {Math.round(convDec * 60)} min</> : <span className="muted">Type 7:45 or 7.75</span>}
          </p>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Total worked" value={f(tot.worked)} sub={`${dec(tot.worked).toFixed(2)} h decimal · ${daysWorked} days`} />
          <Stat label="Regular" value={f(tot.reg)} />
          <Stat label="Overtime" value={f(tot.ot + tot.dt)} sub={tot.dt ? `${f(tot.ot)} at ${s.otX}× · ${f(tot.dt)} at ${s.dtX}×` : `at ${s.otX}×`} tone={tot.ot + tot.dt ? 'accent' : undefined} />
          <Stat label="Gross pay" value={m(p.total)} sub={`${m(p.reg)} + ${m(p.ot + p.dt)} OT`} tone="good" />
        </Stats>
        <Panel
          title="Time entries"
          actions={
            <>
              <Seg value={s.fmt} onChange={(fmt) => set({ fmt })} options={[['hm', 'h:mm'], ['dec', 'Decimal']]} />
              <CsvButton name={`timesheet-${s.weekStart}.csv`} rows={rows} />
              <Btn onClick={() => void pdf()}>⬇ PDF</Btn>
              <Btn kind="ghost" onClick={() => set({ entries: Array.from({ length: 14 }, () => E()) })}>Clear</Btn>
              <Btn kind="ghost" onClick={reset}>Sample</Btn>
            </>
          }
        >
          <div className="k-table-wrap">
            <table className="k-table">
              <thead><tr><th>Day</th><th>In</th><th>Out</th><th>Break</th><th>In 2</th><th>Out 2</th><th>Worked</th><th>Reg</th><th>OT</th><th>DT</th><th>Note</th></tr></thead>
              <tbody>
                {entries.map((e, i) => (
                  <tr key={i} style={{ borderTop: i === 7 ? '3px solid var(--line)' : undefined, opacity: worked[i] ? 1 : 0.75 }}>
                    <td style={{ whiteSpace: 'nowrap' }}><b>{DAY[i % 7]}</b> <span className="muted">{dateStr(i)}</span></td>
                    <td>{inp(e.start, (start) => edit(i, { start }), 'In')}</td>
                    <td>{inp(e.end, (end) => edit(i, { end }), 'Out')}</td>
                    <td><input type="number" min={0} step={5} value={e.brk} onChange={(ev) => edit(i, { brk: Math.max(0, Number(ev.target.value) || 0) })} aria-label="Break minutes" style={{ width: 58 }} /></td>
                    <td>{inp(e.start2, (start2) => edit(i, { start2 }), 'In 2')}</td>
                    <td>{inp(e.end2, (end2) => edit(i, { end2 }), 'Out 2')}</td>
                    <td><b>{worked[i] ? f(worked[i]) : '–'}</b></td>
                    <td>{split[i].reg ? f(split[i].reg) : ''}</td>
                    <td style={{ color: 'var(--warn)' }}>{split[i].ot ? f(split[i].ot) : ''}</td>
                    <td style={{ color: 'var(--err)' }}>{split[i].dt ? f(split[i].dt) : ''}</td>
                    <td><input value={e.note} onChange={(ev) => edit(i, { note: ev.target.value })} aria-label="Note" style={{ width: 110 }} /></td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><td>Total</td><td colSpan={5} /><td>{f(tot.worked)}</td><td>{f(tot.reg)}</td><td>{f(tot.ot)}</td><td>{f(tot.dt)}</td><td /></tr></tfoot>
            </table>
          </div>
          <p className="muted" style={{ fontSize: 13 }}>Type times like 9, 9:30, 0930, 5:45pm or 17:45. An Out time earlier than In counts as an overnight shift. Use In 2 / Out 2 for split shifts (the gap is unpaid).</p>
          {entries.some((e) => [e.start, e.end, e.start2, e.end2].some(bad)) && <Note tone="err">Some times couldn't be read (red). They count as empty.</Note>}
          {longShift >= 0 && <Note tone="warn">{DAY[longShift % 7]} has a shift over 6 hours with no break recorded. Many jurisdictions require a meal break.</Note>}
        </Panel>
        <Panel title="Hours per day">
          <BarChart bars={split.map((d, i) => ({ label: `${DAY[i % 7]} ${date(i).getDate()}`, value: [dec(d.reg), dec(d.ot), dec(d.dt)] }))} stacks={[{ name: 'Regular', color: '#6366f1' }, { name: 'Overtime', color: '#f59e0b' }, { name: 'Double time', color: '#ef4444' }]} fy={(v) => `${v}h`} height={220} />
        </Panel>
      </div>
    </Split>
  )
}
