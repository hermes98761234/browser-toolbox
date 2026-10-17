import { useMemo, useState } from 'react'
import { Area, BarChart, Btn, CsvButton, FileDrop, JsonButtons, LineChart, Note, Num, Panel, Row, Seg, Select, Split, Stat, Stats, Table, useToolState } from '../kit'
import { accumulate, cToF, fToC, gdd, reachedAt, type Method } from './lib/growing-degree-days'

interface Day { date: string; tmin: number; tmax: number } // °C
interface Crop { name: string; base: number; upper: number; method: Method; stages: [string, number][] } // °C, °C·days

const F = (x: number) => x / 1.8 // °F·days → °C·days
const CROPS: Crop[] = [
  { name: 'Corn (maize)', base: 10, upper: 30, method: 'modified', stages: [['VE emergence', F(120)], ['V6', F(475)], ['V10', F(740)], ['VT tassel', F(1135)], ['R1 silking', F(1400)], ['R5 dent', F(2190)], ['R6 black layer', F(2700)]] },
  { name: 'Soybean', base: 10, upper: 30, method: 'modified', stages: [['VE emergence', 90], ['R1 flowering', 560], ['R3 pod set', 830], ['R5 seed fill', 1050], ['R7 maturity', 1450]] },
  { name: 'Spring wheat', base: 0, upper: 35, method: 'average', stages: [['Emergence', 125], ['Tillering', 350], ['Jointing', 550], ['Heading', 900], ['Anthesis', 1000], ['Maturity', 1500]] },
  { name: 'Alfalfa', base: 5, upper: 35, method: 'average', stages: [['Bud', 340], ['1st cut', 420], ['2nd cut', 840], ['3rd cut', 1260]] },
  { name: 'Codling moth (from biofix)', base: 10, upper: 31.1, method: 'sine', stages: [['1st egg hatch', F(250)], ['1st gen. peak hatch', F(500)], ['2nd gen. hatch', F(1250)]] },
  { name: 'Custom', base: 10, upper: 30, method: 'average', stages: [['Target', 1000]] },
]

function sampleSeason(): Day[] {
  const y = new Date().getMonth() >= 9 ? new Date().getFullYear() : new Date().getFullYear() - 1
  const out: Day[] = []
  for (let d = new Date(Date.UTC(y, 3, 1)); d <= new Date(Date.UTC(y, 8, 30)); d.setUTCDate(d.getUTCDate() + 1)) {
    const doy = (d.getTime() - Date.UTC(y, 0, 0)) / 864e5
    const n = Math.sin(doy * 12.9898) * 43758.5453
    const noise = (n - Math.floor(n) - 0.5) * 7
    const mean = 15 + 9 * Math.sin((2 * Math.PI * (doy - 110)) / 365) + noise
    const range = 10 + (Math.cos(doy * 3.1) + 1) * 2.5
    out.push({ date: d.toISOString().slice(0, 10), tmin: Math.round((mean - range / 2) * 10) / 10, tmax: Math.round((mean + range / 2) * 10) / 10 })
  }
  return out
}
const DAYS = sampleSeason()
const DEF = { unit: 'F' as 'C' | 'F', crop: 0, base: 10, upper: 30, method: 'modified' as Method, start: DAYS[34].date, days: DAYS, stages: CROPS[0].stages }

const addDay = (iso: string) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10) }

export default function GrowingDegreeDays() {
  const [s, set, reset] = useToolState('growing-degree-days', DEF)
  const [paste, setPaste] = useState('')
  const [msg, setMsg] = useState('')
  const isF = s.unit === 'F'
  const tShow = (c: number) => Math.round((isF ? cToF(c) : c) * 10) / 10
  const tIn = (v: number) => (isF ? fToC(v) : v)
  const dd = (c: number) => (isF ? c * 1.8 : c) // degree-days in display unit
  const u = `°${s.unit}`

  const sorted = useMemo(() => [...s.days].sort((a, b) => a.date.localeCompare(b.date)), [s.days])
  const season = sorted.filter((d) => d.date >= s.start)
  // compute in the display unit so the upper/lower thresholds behave exactly as published (e.g. 86/50 °F)
  const daily = season.map((d) => {
    const b = isF ? cToF(s.base) : s.base, up = isF ? cToF(s.upper) : s.upper
    return gdd(s.method, tShow(d.tmin), tShow(d.tmax), b, up)
  })
  const cum = accumulate(daily)
  const total = cum[cum.length - 1] ?? 0
  const recent = daily.slice(-14)
  const rate = recent.length ? recent.reduce((a, b) => a + b, 0) / recent.length : 0
  const stages = s.stages.map(([n, v]) => {
    const target = dd(v), i = reachedAt(cum, target)
    const eta = i < 0 && rate > 0 ? Math.ceil((target - total) / rate) : null
    let etaDate = season.length ? season[season.length - 1].date : s.start
    if (eta !== null) for (let k = 0; k < eta; k++) etaDate = addDay(etaDate)
    return { n, target, reached: i >= 0 ? season[i].date : null, eta, etaDate }
  })
  const next = stages.find((x) => !x.reached)
  const fmtDate = (i: number) => { const d = season[Math.round(i)]?.date; return d ? d.slice(5) : '' }

  const pickCrop = (i: number) => { const c = CROPS[i]; set({ crop: i, base: c.base, upper: c.upper, method: c.method, stages: c.stages }) }
  const importText = (text: string) => {
    const rows = text.split(/\r?\n/).map((l) => l.split(/[,;\t]/).map((x) => x.trim())).filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r[0]) && r.length >= 3)
    const add = rows.map((r) => ({ date: r[0], tmin: tIn(Number(r[1])), tmax: tIn(Number(r[2])) })).filter((d) => Number.isFinite(d.tmin) && Number.isFinite(d.tmax)).map((d) => (d.tmin > d.tmax ? { ...d, tmin: d.tmax, tmax: d.tmin } : d))
    if (!add.length) { setMsg('No rows found. Use lines like 2025-05-01, 48, 72 (date, min, max).'); return }
    const map = new Map(s.days.map((d) => [d.date, d]))
    add.forEach((d) => map.set(d.date, d))
    set({ days: [...map.values()] })
    setMsg(`Imported ${add.length} days (${u}).`)
    setPaste('')
  }
  const editDay = (date: string, p: Partial<Day>) => set({ days: s.days.map((d) => (d.date === date ? { ...d, ...p } : d)) })
  const last = sorted[sorted.length - 1]

  return (
    <div>
      <Stats>
        <Stat label={`GDD since ${s.start}`} value={`${Math.round(total).toLocaleString('en-US')}`} tone="accent" sub={`${u}·days, ${season.length} days`} />
        <Stat label="Recent rate" value={`${rate.toFixed(1)} /day`} sub="last 14 days" />
        <Stat label="Next stage" value={next ? next.n : 'All reached ✓'} tone={next ? undefined : 'good'} sub={next ? `${Math.round(next.target - total)} to go · ~${next.eta ?? '—'} days` : ''} />
        <Stat label="Forecast date" value={next?.eta != null ? next.etaDate : '—'} sub="at the recent rate" />
      </Stats>
      <Split wide="right">
        <div>
          <Panel title="Crop / pest model" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
            <Select label="Preset" value={s.crop} onChange={pickCrop} options={CROPS.map((c, i) => [i, c.name] as [number, string])} />
            <Seg value={s.unit} onChange={(unit) => set({ unit })} options={[['F', '°F'], ['C', '°C']]} />
            <Row>
              <Num label="Base temperature" value={tShow(s.base)} unit={u} onChange={(v) => set({ base: tIn(v) })} />
              <Num label="Upper cutoff" value={tShow(s.upper)} unit={u} onChange={(v) => set({ upper: tIn(v) })} />
            </Row>
            <Select label="Method" value={s.method} onChange={(method) => set({ method })} options={[['average', 'Simple average (max(0, mean − base))'], ['modified', 'Modified (cap Tmax, floor at base) — corn 86/50'], ['sine', 'Single sine with horizontal cutoff']]} />
            <label className="k-field"><span className="k-label">Start (planting / biofix)</span><input type="date" value={s.start} onChange={(e) => e.target.value && set({ start: e.target.value })} /></label>
            <Note>Stage targets are typical published values; varieties differ (check the seed company’s rating).</Note>
          </Panel>
          <Panel title="Stages">
            <Table head={['Stage', `Target ${u}·d`, 'Reached / forecast']} rows={stages.map((x, i) => [
              <input key="n" value={x.n} onChange={(e) => set({ stages: s.stages.map((st, j) => (j === i ? [e.target.value, st[1]] : st)) })} style={{ width: 120 }} aria-label="Stage" />,
              <input key="v" type="number" value={Math.round(x.target)} onChange={(e) => set({ stages: s.stages.map((st, j) => (j === i ? [st[0], (Number(e.target.value) || 0) / (isF ? 1.8 : 1)] : st)) })} style={{ width: 70 }} aria-label="Target" />,
              x.reached ? <b key="r" style={{ color: 'var(--ok)' }}>✓ {x.reached}</b> : <span key="r" className="muted">{x.eta != null ? `~${x.etaDate}` : '—'}</span>,
            ])} />
            <Row>
              <Btn onClick={() => set({ stages: [...s.stages, ['New stage', (s.stages[s.stages.length - 1]?.[1] ?? 0) + 200]] })}>+ Stage</Btn>
              {s.stages.length > 1 && <Btn kind="ghost" onClick={() => set({ stages: s.stages.slice(0, -1) })}>− Last</Btn>}
            </Row>
          </Panel>
          <Panel title="Add weather data">
            <Area label={`Paste CSV rows: date, min, max (${u})`} value={paste} onChange={setPaste} rows={4} mono placeholder={'2025-10-01, 45, 68\n2025-10-02, 47, 70'} />
            <Row>
              <Btn kind="primary" disabled={!paste.trim()} onClick={() => importText(paste)}>Import rows</Btn>
              <Btn onClick={() => last && set({ days: [...s.days, { date: addDay(last.date), tmin: last.tmin, tmax: last.tmax }] })}>+ Next day</Btn>
              <Btn kind="ghost" onClick={() => set({ days: [] })}>Clear data</Btn>
            </Row>
            <FileDrop accept=".csv,.txt,text/csv" onFiles={async ([f]) => importText(await f.text())} label="…or drop a CSV file (header rows are skipped)" />
            {msg && <Note tone={msg.startsWith('No') ? 'err' : 'ok'}>{msg}</Note>}
          </Panel>
        </div>
        <div>
          <Panel title="Accumulated heat units">
            {season.length ? <LineChart series={[{ name: 'Accumulated GDD', points: cum.map((v, i) => [i, v]), area: true, color: '#10b981' }]} fx={fmtDate} fy={(v) => String(Math.round(v))} yLabel={`${u}·days`} height={300}
              markers={stages.filter((x) => x.reached).map((x) => ({ x: season.findIndex((d) => d.date === x.reached), label: x.n.split(' ')[0] }))} /> : <Note>No data after the start date.</Note>}
          </Panel>
          <Panel title="Daily GDD">
            <BarChart bars={daily.map((v, i) => ({ label: season[i].date.slice(5), value: Math.round(v * 10) / 10, color: '#f59e0b' }))} fy={(v) => v.toFixed(0)} height={180} />
          </Panel>
          <Panel title={`Daily temperatures (${sorted.length} days)`} actions={<>
            <CsvButton name="gdd.csv" rows={() => [['date', `tmin_${s.unit}`, `tmax_${s.unit}`, 'gdd', 'accumulated'], ...sorted.map((d) => { const i = season.indexOf(d); return [d.date, tShow(d.tmin), tShow(d.tmax), i >= 0 ? daily[i].toFixed(2) : '', i >= 0 ? cum[i].toFixed(1) : ''] })]} />
            <JsonButtons name="gdd.json" data={s} onLoad={(d) => set(d)} />
          </>}>
            <Table max={21} head={['Date', `Min ${u}`, `Max ${u}`, 'GDD', 'Total']} rows={[...sorted].reverse().map((d) => {
              const i = season.indexOf(d)
              return [d.date,
                <input key="a" type="number" value={tShow(d.tmin)} onChange={(e) => editDay(d.date, { tmin: tIn(Number(e.target.value)) })} style={{ width: 64 }} aria-label="Min" />,
                <input key="b" type="number" value={tShow(d.tmax)} onChange={(e) => editDay(d.date, { tmax: tIn(Number(e.target.value)) })} style={{ width: 64 }} aria-label="Max" />,
                i >= 0 ? daily[i].toFixed(1) : <span key="c" className="muted">before start</span>, i >= 0 ? Math.round(cum[i]) : '']
            })} />
          </Panel>
        </div>
      </Split>
    </div>
  )
}
