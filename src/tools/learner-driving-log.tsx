import { useEffect, useState } from 'react'
import { BarChart, Btn, CsvButton, JsonButtons, Note, Num, Panel, Ring, Row, Select, Split, Stat, Stats, Table, Txt, uid, useToolState } from '../kit'
import { dayNight, hm, progress, REQUIREMENTS, type Session } from './lib/learner-driving-log'
import { dayInfo } from './lib/sunrise-sunset-planner'

interface Active { start: number; supervisor: string; road: string; weather: string }
interface State { learner: string; place: string; lat: number; lon: number; req: number; total: number; night: number; sessions: Session[]; active: Active | null; supervisors: string[] }

const ROADS = ['Residential', 'Suburban', 'City / CBD', 'Highway / freeway', 'Rural / country', 'Parking lot', 'Mixed']
const WEATHER = ['Dry', 'Wet / rain', 'Fog', 'Snow / ice', 'Windy']
const pad = (n: number) => String(n).padStart(2, '0')
const dkey = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
const tkey = (ms: number) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}` }
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

// A starting location from the browser's time zone, so sample drives classify sensibly anywhere.
const ZONES: Record<string, [string, number, number]> = {
  'America/New_York': ['New York', 40.71, -74.01], 'America/Chicago': ['Chicago', 41.88, -87.63], 'America/Denver': ['Denver', 39.74, -104.99],
  'America/Los_Angeles': ['Los Angeles', 34.05, -118.24], 'America/Toronto': ['Toronto', 43.65, -79.38], 'Europe/London': ['London', 51.51, -0.13],
  'Europe/Berlin': ['Berlin', 52.52, 13.4], 'Europe/Paris': ['Paris', 48.86, 2.35], 'Europe/Kyiv': ['Kyiv', 50.45, 30.52], 'Europe/Kiev': ['Kyiv', 50.45, 30.52],
  'Europe/Warsaw': ['Warsaw', 52.23, 21.01], 'Australia/Sydney': ['Sydney', -33.87, 151.21], 'Australia/Melbourne': ['Melbourne', -37.81, 144.96],
  'Australia/Brisbane': ['Brisbane', -27.47, 153.03], 'Asia/Kolkata': ['Delhi', 28.61, 77.21], 'Asia/Tokyo': ['Tokyo', 35.68, 139.69], 'Pacific/Auckland': ['Auckland', -36.85, 174.76],
}
function guessPlace(): [string, number, number] {
  let tz = ''
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone } catch { /* ignore */ }
  if (ZONES[tz]) return ZONES[tz]
  const std = new Date(new Date().getFullYear(), 0, 1).getTimezoneOffset()
  return [tz ? `${tz.split('/').pop()!.replace(/_/g, ' ')} (approx.)` : 'Approximate', 45, Math.max(-180, Math.min(180, -std / 4))]
}

function sample(): State {
  const [place, lat, lon] = guessPlace()
  const sessions: Session[] = []
  const base = new Date()
  base.setHours(0, 0, 0, 0)
  const plan: [number, number, number, number, string, string, string][] = [
    // days ago, hour, minute, length min, supervisor, road, weather
    [40, 10, 0, 45, 'Mom', 'Parking lot', 'Dry'], [37, 17, 30, 50, 'Dad', 'Residential', 'Dry'], [33, 9, 15, 60, 'Mom', 'Suburban', 'Dry'],
    [30, 18, 10, 70, 'Dad', 'Suburban', 'Wet / rain'], [26, 14, 0, 55, 'Mom', 'City / CBD', 'Dry'], [23, 19, 20, 65, 'Dad', 'Highway / freeway', 'Dry'],
    [19, 8, 40, 90, 'Mom', 'Rural / country', 'Fog'], [15, 20, 0, 60, 'Dad', 'Residential', 'Dry'], [12, 16, 30, 75, 'Mom', 'Highway / freeway', 'Dry'],
    [8, 18, 45, 80, 'Dad', 'Mixed', 'Wet / rain'], [5, 11, 0, 40, 'Mom', 'City / CBD', 'Dry'], [2, 19, 0, 55, 'Dad', 'Suburban', 'Dry'],
  ]
  for (const [ago, h, m, len, supervisor, road, weather] of plan) {
    const start = base.getTime() - ago * 86400000 + (h * 60 + m) * 60000
    const end = start + len * 60000
    sessions.push({ id: uid(), start, end, supervisor, road, weather, km: Math.round(len * (road.startsWith('High') ? 1.1 : 0.55)), notes: '', ...dayNight(start, end, lat, lon) })
  }
  return { learner: 'Alex Learner', place, lat, lon, req: 1, total: 50, night: 10, sessions, active: null, supervisors: ['Mom', 'Dad'] }
}
const DEF = sample()

export default function LearnerDrivingLog() {
  const [s, set, reset] = useToolState('learner-driving-log', DEF)
  const [now, setNow] = useState(() => Date.now())
  const [sup, setSup] = useState(s.supervisors[0] ?? '')
  const [road, setRoad] = useState(ROADS[0])
  const [weather, setWeather] = useState(WEATHER[0])
  const [mDate, setMDate] = useState(() => dkey(Date.now()))
  const [mFrom, setMFrom] = useState('18:00')
  const [mTo, setMTo] = useState('19:00')
  const [mKm, setMKm] = useState(0)
  const [geoMsg, setGeoMsg] = useState('')

  useEffect(() => {
    if (!s.active) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [s.active])

  const req = s.req > 0 ? REQUIREMENTS[s.req] : { name: 'Custom', total: s.total, night: s.night }
  const p = progress(s.sessions, req)
  const sorted = [...s.sessions].sort((a, b) => b.start - a.start)
  const add = (start: number, end: number, x: Partial<Session>) => {
    const sess: Session = { id: uid(), start, end, supervisor: sup, road, weather, km: 0, notes: '', ...x, ...dayNight(start, end, s.lat, s.lon) }
    set({ sessions: [...s.sessions, sess], supervisors: s.supervisors.includes(sess.supervisor) || !sess.supervisor ? s.supervisors : [...s.supervisors, sess.supervisor] })
  }
  const stop = () => {
    if (!s.active) return
    const a = s.active
    const end = Date.now()
    if (end - a.start >= 60000) add(a.start, end, { supervisor: a.supervisor, road: a.road, weather: a.weather })
    set((st) => ({ ...st, active: null }))
  }
  const mStart = new Date(`${mDate}T${mFrom}`).getTime()
  let mEnd = new Date(`${mDate}T${mTo}`).getTime()
  if (mEnd <= mStart) mEnd += 86400000 // past midnight
  const today = dayInfo(dkey(now), s.lat, s.lon)
  const live = s.active ? dayNight(s.active.start, now, s.lat, s.lon) : null

  // Hours per week for the last 8 weeks.
  const wk0 = (() => { const d = new Date(now); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime() })()
  const weeks = Array.from({ length: 8 }, (_, i) => wk0 - (7 - i) * 7 * 86400000)
  const weekBars = weeks.map((w) => {
    const ss = s.sessions.filter((x) => x.start >= w && x.start < w + 7 * 86400000)
    return { label: new Date(w).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), value: [ss.reduce((a, x) => a + x.day, 0) / 60, ss.reduce((a, x) => a + x.night, 0) / 60] }
  })

  const print = () => {
    const rows = [...s.sessions].sort((a, b) => a.start - b.start).map((x, i) => `<tr><td>${i + 1}</td><td>${dkey(x.start)}</td><td>${tkey(x.start)}–${tkey(x.end)}</td><td>${hm(x.day + x.night)}</td><td>${hm(x.day)}</td><td>${hm(x.night)}</td><td>${esc(x.road)}</td><td>${esc(x.weather)}</td><td>${x.km || ''}</td><td>${esc(x.supervisor)}</td><td class="sig"></td></tr>`).join('')
    const w = window.open('', '_blank')
    if (!w) return alert('Allow pop-ups to print the report.')
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Supervised driving log — ${esc(s.learner)}</title><style>
      body{font:12px system-ui,sans-serif;margin:22px;color:#111}h1{font-size:19px;margin:0}p{margin:4px 0}table{border-collapse:collapse;width:100%;margin-top:10px}
      th,td{border:1px solid #bbb;padding:4px 6px;text-align:left}th{background:#f0f0f0}td.sig{width:110px}.tot td{font-weight:700;background:#fafafa}.sign{margin-top:28px;display:flex;gap:40px}.sign div{flex:1;border-top:1px solid #333;padding-top:4px}</style></head><body>
      <h1>Supervised driving practice log</h1>
      <p><b>Learner:</b> ${esc(s.learner)} &nbsp; <b>Requirement:</b> ${esc(req.name === 'Custom' ? `${req.total} h incl. ${req.night} h night` : req.name)} &nbsp; <b>Location for day/night:</b> ${esc(s.place)} (${s.lat.toFixed(2)}, ${s.lon.toFixed(2)})</p>
      <p><b>Total:</b> ${hm(p.total)} &nbsp; <b>Day:</b> ${hm(p.day)} &nbsp; <b>Night (sunset–sunrise):</b> ${hm(p.night)} &nbsp; <b>Distance:</b> ${p.km} km &nbsp; <b>Sessions:</b> ${s.sessions.length}</p>
      <table><thead><tr><th>#</th><th>Date</th><th>Time</th><th>Duration</th><th>Day</th><th>Night</th><th>Road</th><th>Weather</th><th>km</th><th>Supervisor</th><th>Signature</th></tr></thead><tbody>${rows}
      <tr class="tot"><td colspan="3">Totals</td><td>${hm(p.total)}</td><td>${hm(p.day)}</td><td>${hm(p.night)}</td><td colspan="2"></td><td>${p.km}</td><td colspan="2"></td></tr></tbody></table>
      <p style="margin-top:12px">I certify that the learner completed the supervised driving practice recorded above.</p>
      <div class="sign"><div>Supervising driver signature</div><div>Printed name</div><div>Date</div></div>
      <script>onload=()=>print()</script></body></html>`)
    w.document.close()
  }

  return (
    <Split>
      <div>
        <Panel title="Drive now">
          {s.active ? (
            <>
              <div style={{ textAlign: 'center', fontSize: 42, fontWeight: 800, color: 'var(--accent)', fontVariantNumeric: 'tabular-nums' }}>{(() => { const sec = Math.floor((now - s.active.start) / 1000); return `${Math.floor(sec / 3600)}:${pad(Math.floor(sec / 60) % 60)}:${pad(sec % 60)}` })()}</div>
              <p style={{ textAlign: 'center', margin: 0 }}>{s.active.supervisor} · {s.active.road} · {s.active.weather}</p>
              {live && <p className="muted" style={{ textAlign: 'center' }}>☀️ {hm(live.day)} day · 🌙 {hm(live.night)} night so far</p>}
              <Row><Btn kind="danger" onClick={stop}>■ Stop & save</Btn><Btn kind="ghost" onClick={() => confirm('Discard this drive?') && set({ active: null })}>Discard</Btn></Row>
            </>
          ) : (
            <>
              <Row>
                <Txt label="Supervisor" value={sup} onChange={setSup} placeholder="Name" />
                <Select label="Road type" value={road} onChange={setRoad} options={ROADS} />
                <Select label="Weather" value={weather} onChange={setWeather} options={WEATHER} />
              </Row>
              {s.supervisors.length > 0 && <Row>{s.supervisors.map((x) => <Btn key={x} kind={x === sup ? 'primary' : 'ghost'} onClick={() => setSup(x)}>{x}</Btn>)}</Row>}
              <Btn kind="primary" disabled={!sup.trim()} onClick={() => { const t = Date.now(); setNow(t); set({ active: { start: t, supervisor: sup.trim(), road, weather } }) }}>▶ Start drive</Btn>
              <p className="muted" style={{ fontSize: 12.5, marginBottom: 0 }}>Today in {s.place}: sunrise {today.sunrise ? tkey(today.sunrise) : '—'}, sunset {today.sunset ? tkey(today.sunset) : '—'}. The timer survives a closed tab. Never handle the phone while driving — let the supervisor do it.</p>
            </>
          )}
        </Panel>
        <Panel title="Add a past drive">
          <Row>
            <Txt label="Date" type="date" value={mDate} onChange={setMDate} />
            <Txt label="From" type="time" value={mFrom} onChange={setMFrom} />
            <Txt label="To" type="time" value={mTo} onChange={setMTo} />
            <Num label="Distance" value={mKm} min={0} unit="km" onChange={setMKm} />
          </Row>
          <Btn disabled={!Number.isFinite(mStart) || !sup.trim() || mEnd - mStart > 12 * 3600000} onClick={() => add(mStart, mEnd, { km: mKm })}>+ Add drive ({Number.isFinite(mStart) ? hm((mEnd - mStart) / 60000) : '—'})</Btn>
          <p className="muted" style={{ fontSize: 12.5, marginBottom: 0 }}>Uses the supervisor, road and weather selected above. An end time earlier than the start counts as past midnight.</p>
        </Panel>
        <Panel title="Learner & rules">
          <Txt label="Learner name" value={s.learner} onChange={(learner) => set({ learner })} />
          <Select label="Hours requirement" value={s.req} onChange={(r) => set({ req: r })} options={REQUIREMENTS.map((r, i) => [i, r.name] as [number, string])} />
          {s.req === 0 && <Row><Num label="Total hours" value={s.total} min={1} onChange={(total) => set({ total })} /><Num label="Night hours" value={s.night} min={0} onChange={(night) => set({ night })} /></Row>}
          <Row>
            <Txt label="Place" value={s.place} onChange={(place) => set({ place })} />
            <Num label="Latitude" value={s.lat} min={-90} max={90} onChange={(lat) => set({ lat })} />
            <Num label="Longitude" value={s.lon} min={-180} max={180} onChange={(lon) => set({ lon })} />
          </Row>
          <Row>
            <Btn onClick={() => { if (!navigator.geolocation) return setGeoMsg('Geolocation is not available.'); setGeoMsg('Locating…'); navigator.geolocation.getCurrentPosition((g) => { set({ lat: +g.coords.latitude.toFixed(3), lon: +g.coords.longitude.toFixed(3), place: 'My location' }); setGeoMsg('') }, (e) => setGeoMsg(e.message)) }}>📍 Use my location</Btn>
            <Btn kind="ghost" onClick={() => set({ sessions: s.sessions.map((x) => ({ ...x, ...dayNight(x.start, x.end, s.lat, s.lon) })) })}>Reclassify all drives</Btn>
            {geoMsg && <span className="muted">{geoMsg}</span>}
          </Row>
          <p className="muted" style={{ fontSize: 12.5, marginBottom: 0 }}>Night = sun below the horizon (sunset to sunrise), from the NOAA solar position at this location. Some authorities define night differently — check your licensing agency’s rules and logbook format.</p>
        </Panel>
      </div>

      <div>
        <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
          <div style={{ textAlign: 'center' }}><Ring size={120} value={p.total / (req.total * 60)} label={<b>{(p.total / 60).toFixed(1)}h</b>} /><div className="muted">of {req.total} h total</div></div>
          <div style={{ textAlign: 'center' }}><Ring size={120} color="#6366f1" value={req.night ? p.night / (req.night * 60) : 1} label={<b>{(p.night / 60).toFixed(1)}h</b>} /><div className="muted">of {req.night} h night</div></div>
        </div>
        <Stats>
          <Stat label="Still needed" value={p.done ? 'Done 🎉' : hm(p.totalLeft)} sub={p.nightLeft ? `incl. ${hm(p.nightLeft)} night` : 'night hours complete'} tone={p.done ? 'good' : 'accent'} />
          <Stat label="Day / night" value={`${hm(p.day)} / ${hm(p.night)}`} />
          <Stat label="Drives" value={s.sessions.length} sub={`${p.km} km`} />
        </Stats>
        <Panel title="Hours per week">
          <BarChart height={180} bars={weekBars} stacks={[{ name: 'Day', color: '#f59e0b' }, { name: 'Night', color: '#6366f1' }]} fy={(v) => `${v.toFixed(1)}h`} />
        </Panel>
        <Panel title="Log" actions={<>
          <Btn kind="primary" onClick={print}>🖨 Print report</Btn>
          <CsvButton name="driving-log.csv" rows={() => [['Date', 'Start', 'End', 'Minutes', 'Day min', 'Night min', 'Road', 'Weather', 'km', 'Supervisor', 'Notes'], ...[...s.sessions].sort((a, b) => a.start - b.start).map((x) => [dkey(x.start), tkey(x.start), tkey(x.end), Math.round(x.day + x.night), Math.round(x.day), Math.round(x.night), x.road, x.weather, x.km, x.supervisor, x.notes])]} />
          <JsonButtons name="driving-log.json" data={s} onLoad={(d) => d && Array.isArray(d.sessions) && set(d)} />
          <Btn kind="ghost" onClick={() => confirm('Replace your log with the sample?') && reset()}>Sample</Btn>
        </>}>
          <Table max={15} head={['Date', 'Time', 'Day', 'Night', 'Road', 'Supervisor', '']} rows={sorted.map((x) => [
            dkey(x.start),
            `${tkey(x.start)}–${tkey(x.end)}`,
            hm(x.day),
            <b key="n" style={{ color: x.night ? '#6366f1' : 'var(--muted)' }}>{x.night ? `🌙 ${hm(x.night)}` : '—'}</b>,
            `${x.road}${x.weather !== 'Dry' ? ` · ${x.weather}` : ''}`,
            x.supervisor,
            <Btn key="x" kind="ghost" title="Delete" onClick={() => confirm('Delete this drive?') && set({ sessions: s.sessions.filter((y) => y.id !== x.id) })}>✕</Btn>,
          ])} />
          {!s.sessions.length && <Note>No drives logged yet.</Note>}
        </Panel>
      </div>
    </Split>
  )
}
