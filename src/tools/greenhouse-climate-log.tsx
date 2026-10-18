import { useEffect, useRef, useState } from 'react'
import { Area, Btn, Check, CsvButton, FileDrop, JsonButtons, niceTicks, Note, Num, num, Panel, pct, Row, Seg, Select, Slider, Split, Stat, Stats, Table, Txt, useToolState } from '../kit'
import { cToF, daily, dewPoint, excursions, fToC, merge, parseCsv, sampleReadings, vpd, vpdZone, VPD_ZONES, type Limits, type Reading } from './lib/greenhouse-climate-log'

const PRESETS: Record<string, Limits> = {
  'Tomatoes & peppers': { tMin: 13, tMax: 30, rhMin: 50, rhMax: 85, vpdMin: 0.4, vpdMax: 1.5 },
  'Seedlings & cuttings': { tMin: 18, tMax: 26, rhMin: 65, rhMax: 90, vpdMin: 0.4, vpdMax: 0.9 },
  Cucumbers: { tMin: 18, tMax: 30, rhMin: 60, rhMax: 90, vpdMin: 0.4, vpdMax: 1.2 },
  'Lettuce & greens': { tMin: 7, tMax: 24, rhMin: 50, rhMax: 80, vpdMin: 0.5, vpdMax: 1.2 },
  'Orchids & tropicals': { tMin: 16, tMax: 30, rhMin: 60, rhMax: 85, vpdMin: 0.4, vpdMax: 1.0 },
}

interface State { readings: Reading[]; limits: Limits; preset: string; unit: 'C' | 'F'; leaf: number; range: string; dayFirst: boolean }
const LOADED = Date.now()
const DEF: State = { readings: sampleReadings(LOADED), limits: PRESETS['Tomatoes & peppers'], preset: 'Tomatoes & peppers', unit: 'C', leaf: -1, range: '7', dayFirst: true }

const fmtT = (t: number) => new Date(t).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
const localInput = (t: number) => new Date(t - new Date(t).getTimezoneOffset() * 60000).toISOString().slice(0, 16)
const fmtDur = (ms: number) => (ms < 3600_000 ? `${Math.round(ms / 60000)} min` : `${num(ms / 3600_000, 1)} h`)

function useWidth() {
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(720)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(320, Math.round(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

function ClimateChart({ rs, L, unit, leaf, t0, t1 }: { rs: Reading[]; L: Limits; unit: 'C' | 'F'; leaf: number; t0: number; t1: number }) {
  const [ref, W] = useWidth()
  const [hover, setHover] = useState<number | null>(null)
  const H = 280, V = 90, PL = 46, PR = 46, PT = 10, PB = 24
  const cv = (c: number) => (unit === 'F' ? cToF(c) : c)
  const temps = rs.map((r) => cv(r[1]))
  let lo = Math.min(cv(L.tMin), ...temps) - 2, hi = Math.max(cv(L.tMax), ...temps) + 2
  if (!(hi > lo)) { lo = 0; hi = 40 }
  const sx = (t: number) => PL + ((t - t0) / (t1 - t0 || 1)) * (W - PL - PR)
  const sT = (v: number) => PT + (1 - (v - lo) / (hi - lo)) * (H - PT - PB)
  const sH = (v: number) => PT + (1 - v / 100) * (H - PT - PB)
  const vMax = Math.max(2, ...rs.map((r) => vpd(r[1], r[2], leaf)))
  const sV = (v: number) => H + 8 + (1 - v / vMax) * V
  const path = (f: (r: Reading) => number) => rs.map((r, i) => `${i ? 'L' : 'M'}${sx(r[0]).toFixed(1)},${f(r).toFixed(1)}`).join('')
  const days: number[] = []
  for (let d = new Date(t0).setHours(0, 0, 0, 0) + 86400_000; d < t1; d += 86400_000) days.push(d)
  const near = hover === null || !rs.length ? null : rs.reduce((a, b) => (Math.abs(sx(b[0]) - hover) < Math.abs(sx(a[0]) - hover) ? b : a))
  return (
    <div ref={ref} className="k-chart" style={{ position: 'relative' }}>
      <svg width={W} height={H + V + 30} onMouseMove={(e) => setHover(e.nativeEvent.offsetX)} onMouseLeave={() => setHover(null)} role="img" aria-label="Temperature and humidity chart">
        <rect x={PL} width={W - PL - PR} y={sT(cv(L.tMax))} height={Math.max(0, sT(cv(L.tMin)) - sT(cv(L.tMax)))} fill="#ef4444" opacity={0.07} />
        {niceTicks(lo, hi, 6).filter((v) => v >= lo && v <= hi).map((v) => (
          <g key={v}><line className="grid" x1={PL} x2={W - PR} y1={sT(v)} y2={sT(v)} /><text x={PL - 6} y={sT(v) + 4} textAnchor="end" fill="#ef4444">{num(v, 0)}°</text></g>
        ))}
        {[0, 25, 50, 75, 100].map((v) => <text key={v} x={W - PR + 6} y={sH(v) + 4} fill="#0ea5e9">{v}%</text>)}
        {days.map((d) => <g key={d}><line x1={sx(d)} x2={sx(d)} y1={PT} y2={H + V + 8} stroke="var(--grid-strong)" strokeDasharray="2 4" /><text x={sx(d) + 3} y={H - 8} className="lbl">{new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' })}</text></g>)}
        {[L.rhMin, L.rhMax].map((v) => <line key={v} x1={PL} x2={W - PR} y1={sH(v)} y2={sH(v)} stroke="#0ea5e9" strokeDasharray="6 4" opacity={0.6} />)}
        <path d={path((r) => sH(r[2]))} fill="none" stroke="#0ea5e9" strokeWidth={1.8} />
        <path d={path((r) => sT(cv(r[1])))} fill="none" stroke="#ef4444" strokeWidth={2.2} />
        {VPD_ZONES.map((z, i) => {
          const a = i ? VPD_ZONES[i - 1].max : 0, b = Math.min(z.max, vMax)
          return a < vMax ? <rect key={z.name} x={PL} width={W - PL - PR} y={sV(b)} height={sV(a) - sV(b)} fill={z.color} opacity={0.14} /> : null
        })}
        <path d={path((r) => sV(vpd(r[1], r[2], leaf)))} fill="none" stroke="var(--fg)" strokeWidth={1.5} />
        <text x={PL - 6} y={H + 16} textAnchor="end" className="lbl">VPD</text>
        {[0, 1, 2].filter((v) => v <= vMax).map((v) => <text key={v} x={PL - 6} y={sV(v) + 4} textAnchor="end">{v}</text>)}
        <text x={W - PR + 6} y={H + 16} className="lbl">kPa</text>
        {near && <g><line x1={sx(near[0])} x2={sx(near[0])} y1={PT} y2={H + V + 8} stroke="var(--muted)" /><circle cx={sx(near[0])} cy={sT(cv(near[1]))} r={4} fill="#ef4444" /><circle cx={sx(near[0])} cy={sH(near[2])} r={4} fill="#0ea5e9" /></g>}
      </svg>
      {near && (
        <div className="k-tip" style={{ left: Math.min(sx(near[0]) + 12, W - 200), top: 10 }}>
          <b>{fmtT(near[0])}</b>
          <div><i style={{ background: '#ef4444' }} /> {num(cv(near[1]), 1)}°{unit}</div>
          <div><i style={{ background: '#0ea5e9' }} /> {num(near[2], 1)}% RH</div>
          <div>VPD {num(vpd(near[1], near[2], leaf), 2)} kPa · dew {num(cv(dewPoint(near[1], near[2])), 1)}°</div>
        </div>
      )}
      <div className="k-legend"><span><i style={{ background: '#ef4444' }} />Temperature (left)</span><span><i style={{ background: '#0ea5e9' }} />Humidity (right)</span><span><i style={{ background: 'var(--fg)' }} />VPD with zones</span></div>
    </div>
  )
}

export default function GreenhouseClimateLog() {
  const [s, set, reset] = useToolState('greenhouse-climate-log', DEF)
  const [form, setForm] = useState(() => ({ at: localInput(Date.now()), t: 22, rh: 65 }))
  const [csv, setCsv] = useState('')
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)
  const [forceF, setForceF] = useState(false)
  const u = s.unit
  const cv = (c: number) => (u === 'F' ? cToF(c) : c)
  const L = s.limits
  const last = s.readings[s.readings.length - 1]
  const t1 = last ? last[0] : LOADED
  const t0 = s.range === 'all' ? (s.readings[0]?.[0] ?? t1 - 86400_000) : t1 - Number(s.range) * 86400_000
  const rs = s.readings.filter((r) => r[0] >= t0)
  const ex = excursions(rs, L, s.leaf)
  const days = daily(rs, L, s.leaf)
  const inRange = days.length ? days.reduce((a, d) => a + d.inRange * d.n, 0) / days.reduce((a, d) => a + d.n, 0) : 0
  const lv = last ? vpd(last[1], last[2], s.leaf) : 0
  const zone = vpdZone(lv)
  const setLim = (p: Partial<Limits>) => set({ limits: { ...L, ...p }, preset: 'Custom' })
  const limT = (k: 'tMin' | 'tMax') => <Num label={k === 'tMin' ? 'Min temp' : 'Max temp'} unit={`°${u}`} value={Math.round(cv(L[k]) * 10) / 10} onChange={(v) => setLim({ [k]: u === 'F' ? fToC(v) : v })} />

  const importText = (text: string) => {
    const r = parseCsv(text, { dayFirst: s.dayFirst, forceF: forceF || undefined })
    if (!r.readings.length) { setMsg({ tone: 'err', text: `No valid rows found${r.skipped ? ` (${r.skipped} skipped)` : ''}. Expected columns: time, temperature, humidity.` }); return }
    set({ readings: merge(s.readings, r.readings).slice(-60000), range: 'all' })
    setMsg({ tone: 'ok', text: `Imported ${r.readings.length} readings using “${r.used.join('”, “')}”${r.fahrenheit ? ' (°F converted)' : ''}${r.skipped ? `; ${r.skipped} rows skipped` : ''}.` })
    setCsv('')
  }

  return (
    <Split wide="right">
      <div>
        <Panel title="Add a reading">
          <Txt label="Time" type="datetime-local" value={form.at} onChange={(at) => setForm({ ...form, at })} />
          <Row>
            <Num label="Temperature" unit={`°${u}`} value={form.t} onChange={(t) => setForm({ ...form, t })} />
            <Num label="Humidity" unit="%" min={0} max={100} value={form.rh} onChange={(rh) => setForm({ ...form, rh })} />
          </Row>
          <Btn kind="primary" disabled={form.rh < 0 || form.rh > 100 || !form.at} onClick={() => { const t = new Date(form.at).getTime(); set({ readings: merge(s.readings, [[t, u === 'F' ? fToC(form.t) : form.t, form.rh]]) }); setMsg({ tone: 'ok', text: 'Reading saved.' }) }}>+ Save reading</Btn>
        </Panel>
        <Panel title="Import sensor CSV">
          <FileDrop accept=".csv,.txt,text/csv" onFiles={async (f) => importText(await f[0].text())} label="Drop a logger CSV export" />
          <Area value={csv} onChange={setCsv} rows={3} mono placeholder={'Time,Temperature,Humidity\n2026-05-03 10:00,21.5,68'} />
          <Row>
            <Btn onClick={() => importText(csv)} disabled={!csv.trim()}>Import pasted</Btn>
            <Check label="Dates are day-first (31/05)" value={s.dayFirst} onChange={(dayFirst) => set({ dayFirst })} />
            <Check label="Values are °F" value={forceF} onChange={setForceF} />
          </Row>
          <p className="muted" style={{ fontSize: 13 }}>Columns are found by header name (time/date, temp, hum/RH); comma, semicolon or tab separated; ISO, day/month or epoch timestamps.</p>
          {msg && <Note tone={msg.tone}>{msg.text}</Note>}
        </Panel>
        <Panel title="Thresholds">
          <Select label="Crop preset" value={s.preset} onChange={(p) => p !== 'Custom' && set({ preset: p, limits: PRESETS[p] })} options={[...Object.keys(PRESETS), 'Custom']} />
          <Row>{limT('tMin')}{limT('tMax')}</Row>
          <Row>
            <Num label="Min RH" unit="%" value={L.rhMin} onChange={(rhMin) => setLim({ rhMin })} />
            <Num label="Max RH" unit="%" value={L.rhMax} onChange={(rhMax) => setLim({ rhMax })} />
          </Row>
          <Row>
            <Num label="Min VPD" unit="kPa" step={0.1} value={L.vpdMin} onChange={(vpdMin) => setLim({ vpdMin })} />
            <Num label="Max VPD" unit="kPa" step={0.1} value={L.vpdMax} onChange={(vpdMax) => setLim({ vpdMax })} />
          </Row>
          <Slider label="Leaf temperature offset" value={s.leaf} min={-4} max={2} step={0.5} unit=" °C" onChange={(leaf) => set({ leaf })} />
          <p className="muted" style={{ fontSize: 13 }}>Leaves usually run 1–2 °C cooler than the air when transpiring. VPD uses Tetens’ saturation pressure at leaf temperature.</p>
        </Panel>
      </div>

      <div>
        <Row>
          <Seg value={s.range} onChange={(range) => set({ range })} options={[['1', '24 h'], ['3', '3 days'], ['7', '7 days'], ['30', '30 days'], ['all', 'All']]} />
          <Seg value={u} onChange={(unit) => set({ unit })} options={[['C', '°C'], ['F', '°F']]} />
        </Row>
        <Stats>
          <Stat label="Latest temperature" value={last ? `${num(cv(last[1]), 1)}°${u}` : '—'} sub={last ? fmtT(last[0]) : 'no data'} tone={last && (last[1] < L.tMin || last[1] > L.tMax) ? 'bad' : undefined} />
          <Stat label="Latest humidity" value={last ? `${num(last[2], 0)}%` : '—'} sub={last ? `dew point ${num(cv(dewPoint(last[1], last[2])), 1)}°` : undefined} tone={last && (last[2] < L.rhMin || last[2] > L.rhMax) ? 'bad' : undefined} />
          <Stat label="VPD" value={last ? `${num(lv, 2)} kPa` : '—'} sub={<span style={{ color: zone.color, fontWeight: 700 }}>{zone.name}</span>} />
          <Stat label="Time in range" value={pct(inRange, 0)} sub={`${rs.length} readings`} tone={inRange > 0.8 ? 'good' : inRange < 0.5 ? 'bad' : 'accent'} />
        </Stats>
        <Panel title="Climate">
          {rs.length ? <ClimateChart rs={rs} L={L} unit={u} leaf={s.leaf} t0={t0} t1={t1} /> : <Note>No readings in this range.</Note>}
          {last && <p className="muted" style={{ fontSize: 13 }}>{zone.tip}</p>}
        </Panel>
        <Panel title={`Alerts (${ex.length})`}>
          {ex.length ? (
            <Table
              max={12}
              head={['Metric', 'When', 'Duration', 'Worst']}
              rows={ex.map((e) => [
                <b key="m" style={{ color: e.kind === 'high' ? 'var(--err)' : '#0ea5e9' }}>{e.kind === 'high' ? '▲' : '▼'} {e.metric} {e.kind}</b>,
                fmtT(e.start),
                e.count > 1 ? fmtDur(e.end - e.start) : 'single reading',
                e.metric === 'Temperature' ? `${num(cv(e.peak), 1)}°${u}` : e.metric === 'Humidity' ? `${num(e.peak, 0)}%` : `${num(e.peak, 2)} kPa`,
              ])}
            />
          ) : <Note tone="ok">Everything stayed within your thresholds in this period.</Note>}
        </Panel>
        <Panel
          title="Daily summary"
          actions={
            <>
              <CsvButton name="greenhouse-readings.csv" rows={() => [['time', `temp_${u}`, 'rh_pct', 'vpd_kpa', `dew_${u}`], ...rs.map((r) => [localInput(r[0]).replace('T', ' '), num(cv(r[1]), 2), r[2], num(vpd(r[1], r[2], s.leaf), 3), num(cv(dewPoint(r[1], r[2])), 2)])]} />
              <JsonButtons name="greenhouse-log.json" data={s} onLoad={(d) => Array.isArray(d.readings) && set(d)} />
              <Btn kind="ghost" onClick={() => confirm('Delete all readings?') && set({ readings: [] })}>Clear</Btn>
              <Btn kind="ghost" onClick={reset}>Sample</Btn>
            </>
          }
        >
          <Table
            head={['Day', `Temp min / max °${u}`, 'RH min / max', 'Avg VPD', `Min dew °${u}`, 'In range']}
            rows={days.map((d) => [
              d.day,
              `${num(cv(d.tMin), 1)} / ${num(cv(d.tMax), 1)}`,
              `${num(d.rhMin, 0)} / ${num(d.rhMax, 0)}%`,
              <span key="v" style={{ color: vpdZone(d.vpdAvg).color, fontWeight: 700 }}>{num(d.vpdAvg, 2)}</span>,
              num(cv(d.dewMin), 1),
              <span key="r" style={{ color: d.inRange > 0.8 ? 'var(--ok)' : d.inRange < 0.5 ? 'var(--err)' : undefined }}>{pct(d.inRange, 0)}</span>,
            ])}
          />
        </Panel>
      </div>
    </Split>
  )
}
