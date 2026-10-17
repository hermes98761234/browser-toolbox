import { useMemo, useState } from 'react'
import { BarChart, Btn, Check, CsvButton, FileDrop, JsonButtons, LineChart, Note, Num, Panel, Row, Seg, Split, Stat, Stats, Table, Txt, color, num, today, uid, useToolState } from '../kit'
import { MM_PER_IN, MONTHS, cumulative, monthly, parseCsv, sample, seasonTotals, summary, toDate, years, type Reading } from './lib/rain-gauge-log'

interface State { station: string; unit: 'mm' | 'in'; southern: boolean; readings: Reading[]; year: number }
const DEF: State = { station: 'Back garden gauge', unit: 'mm', southern: false, readings: sample(today()), year: 0 }
const doyOf = (d: string) => Math.round((Date.parse(d + 'T00:00:00Z') - Date.UTC(+d.slice(0, 4), 0, 1)) / 864e5) + 1

export default function RainGaugeLog() {
  const [s, set, reset] = useToolState('rain-gauge-log', DEF)
  const [date, setDate] = useState(today())
  const [amount, setAmount] = useState(0)
  const [note, setNote] = useState('')
  const [msg, setMsg] = useState('')
  const k = s.unit === 'in' ? 1 / MM_PER_IN : 1
  const f = (mm: number, d = s.unit === 'in' ? 2 : 1) => `${num(mm * k, d)} ${s.unit}`
  const [nowStr] = useState(today)
  const ys = useMemo(() => years(s.readings), [s.readings])
  const year = ys.includes(s.year) ? s.year : ys[ys.length - 1] ?? +nowStr.slice(0, 4)
  const prevYear = year - 1
  const isCurrent = +nowStr.slice(0, 4) === year
  const cutDoy = isCurrent ? doyOf(nowStr) : 366
  const until = isCurrent ? nowStr : `${year}-12-31`
  const sum = useMemo(() => summary(s.readings, year, until), [s.readings, year, until])
  const ytd = toDate(s.readings, year, cutDoy)
  const ytdPrev = toDate(s.readings, prevYear, cutDoy)
  const months = useMemo(() => monthly(s.readings, year), [s.readings, year])
  const monthsPrev = useMemo(() => monthly(s.readings, prevYear), [s.readings, prevYear])
  const seasons = useMemo(() => seasonTotals(s.readings, s.southern), [s.readings, s.southern])
  const recent = useMemo(() => [...s.readings].sort((a, b) => b.date.localeCompare(a.date)), [s.readings])

  const add = () => {
    if (!(amount >= 0) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return setMsg('Enter a valid date and a non-negative amount.')
    set({ readings: [...s.readings, { id: uid(), date, mm: s.unit === 'in' ? amount * MM_PER_IN : amount, note: note.trim() || undefined }] })
    setMsg(`Logged ${num(amount, 2)} ${s.unit} on ${date}.`)
    setAmount(0)
    setNote('')
  }
  const importCsv = async (file: File) => {
    const { readings, skipped } = parseCsv(await file.text(), s.unit === 'in')
    set({ readings: [...s.readings, ...readings.map((r) => ({ ...r, id: uid() }))] })
    setMsg(`Imported ${readings.length} readings${skipped ? `, skipped ${skipped} lines` : ''}.`)
  }
  const diff = ytdPrev > 0 ? (ytd - ytdPrev) / ytdPrev : NaN

  return (
    <Split>
      <div>
        <Panel title="Log a reading">
          <Row>
            <Txt label="Date" type="date" value={date} onChange={setDate} />
            <Num label="Rainfall" value={amount} onChange={setAmount} unit={s.unit} min={0} step={s.unit === 'in' ? 0.01 : 0.1} />
          </Row>
          <Txt label="Note (optional)" value={note} onChange={setNote} placeholder="e.g. thunderstorm, gauge emptied 8 am" />
          <Btn kind="primary" onClick={add}>+ Add reading</Btn>
          {msg && <p className="muted" style={{ fontSize: 13 }}>{msg}</p>}
          <Row>
            <Txt label="Station" value={s.station} onChange={(station) => set({ station })} />
          </Row>
          <Row>
            <Seg value={s.unit} onChange={(unit) => set({ unit })} options={[['mm', 'Millimetres'], ['in', 'Inches']]} label="Unit" />
            <Check label="Southern hemisphere seasons" value={s.southern} onChange={(southern) => set({ southern })} />
          </Row>
        </Panel>
        <Panel title="Recent readings" actions={<span className="muted">{s.readings.length} total</span>}>
          <Table head={['Date', 'Rain', 'Note', '']} max={12} rows={recent.map((r) => [r.date, <b key="v">{f(r.mm)}</b>, r.note ?? '', <Btn key="x" kind="ghost" title="Delete" onClick={() => set({ readings: s.readings.filter((x) => x.id !== r.id) })}>✕</Btn>])} />
        </Panel>
        <Panel title="Import & backup">
          <FileDrop accept=".csv,.txt,text/csv" onFiles={(fs) => void importCsv(fs[0])} label={`Import CSV: date,amount(${s.unit})[,note] — ISO or DD/MM/YYYY dates`} />
          <Row>
            <CsvButton name="rainfall.csv" rows={() => [['date', `rain_${s.unit}`, 'note'], ...[...s.readings].sort((a, b) => a.date.localeCompare(b.date)).map((r) => [r.date, +(r.mm * k).toFixed(3), r.note ?? ''])]} />
            <JsonButtons name="rain-gauge-log.json" data={s} onLoad={(d) => set({ ...DEF, ...d })} />
            <Btn kind="ghost" onClick={() => set({ readings: [] })}>Clear all</Btn>
            <Btn kind="ghost" onClick={reset}>Sample data</Btn>
          </Row>
          <p className="muted" style={{ fontSize: 13 }}>Readings are stored in this browser only. Use Backup regularly, or export CSV for a spreadsheet.</p>
        </Panel>
      </div>
      <div>
        {ys.length > 1 && <Seg value={String(year)} onChange={(y) => set({ year: +y })} options={ys.map((y) => [String(y), String(y)] as [string, string])} label="Year" />}
        <Stats>
          <Stat label={isCurrent ? 'Year to date' : `${year} total`} value={f(ytd, 0)} tone="accent" sub={Number.isFinite(diff) ? `${diff >= 0 ? '+' : ''}${num(diff * 100, 0)}% vs ${prevYear} to the same date` : undefined} />
          <Stat label="Rain days (≥ 0.2 mm)" value={sum.rainDays} sub={`avg ${f(sum.mean)} per rain day`} />
          <Stat label="Wettest day" value={sum.wettest ? f(sum.wettest.mm) : '—'} sub={sum.wettest?.date} />
          <Stat label="Longest dry spell" value={`${sum.longestDry} days`} />
        </Stats>
        <Panel title={`Monthly totals ${year}${monthsPrev.some((v) => v > 0) ? ` vs ${prevYear}` : ''}`}>
          <BarChart bars={MONTHS.map((m, i) => ({ label: m, value: months[i] * k, color: color(1) }))} fy={(v) => num(v, s.unit === 'in' ? 1 : 0)} height={220} />
          {monthsPrev.some((v) => v > 0) && (
            <p className="muted" style={{ fontSize: 13, margin: '4px 0 0' }}>
              Wettest month: <b>{MONTHS[months.indexOf(Math.max(...months))]}</b> ({f(Math.max(...months), 0)}). Biggest change vs {prevYear}:{' '}
              {(() => { const d = months.map((v, i) => (isCurrent && i > +nowStr.slice(5, 7) - 1 ? 0 : v - monthsPrev[i])); const i = d.reduce((b, v, j) => (Math.abs(v) > Math.abs(d[b]) ? j : b), 0); return <b>{MONTHS[i]} {d[i] >= 0 ? '+' : '−'}{f(Math.abs(d[i]), 0)}</b> })()}
            </p>
          )}
        </Panel>
        <Panel title="Year-over-year: cumulative rainfall">
          <LineChart series={ys.slice(-4).map((y, i, arr) => ({ name: String(y), points: cumulative(s.readings, y, +nowStr.slice(0, 4) === y ? doyOf(nowStr) : 366).map(([d, v]) => [d, v * k] as [number, number]), color: color(i + 4 - arr.length), dashed: y !== year }))}
            xLabel="Day of year" fx={(v) => (v >= 1 && v <= 366 ? MONTHS[Math.min(11, Math.floor((v - 1) / 30.5))] : '')} fy={(v) => num(v, 0)} height={240} xMin={0} xMax={366} />
        </Panel>
        <Panel title="Seasons">
          <Table head={['Season year', ...(s.southern ? ['Summer', 'Autumn', 'Winter', 'Spring'] : ['Winter', 'Spring', 'Summer', 'Autumn']), 'Total']}
            rows={[...seasons].sort((a, b) => b[0] - a[0]).map(([y, r]) => {
              const order = s.southern ? (['Summer', 'Autumn', 'Winter', 'Spring'] as const) : (['Winter', 'Spring', 'Summer', 'Autumn'] as const)
              return [y, ...order.map((n) => f(r[n], 0)), <b key="t">{f(order.reduce((a, n) => a + r[n], 0), 0)}</b>]
            })} />
          <Note>Meteorological seasons: December counts toward the following year's {s.southern ? 'summer' : 'winter'} (Dec–Feb). The latest year may be incomplete.</Note>
        </Panel>
      </div>
    </Split>
  )
}
