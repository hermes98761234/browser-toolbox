import { useEffect, useState } from 'react'
import { Btn, Check, CsvButton, JsonButtons, Note, num, Num, Panel, Row, Seg, Split, Stat, Stats, Table, today, uid, useToolState } from '../kit'
import { addDays, demoWeather, diffDays, PROFILES, SEASON, simulate, type Day, type Event } from './lib/watering-schedule'

interface Plant { id: string; name: string; profile: string; factor: number; last: string }
interface State {
  plants: Plant[]; season: string; lat: number; lon: number; place: string
  weather: Day[]; source: 'demo' | 'live'; fetched: string; rainCounts: number; hot: number; notify: boolean; notified: string
}

const T = today()
const month = new Date().getMonth()
const DEF: State = {
  plants: [
    { id: 'p1', name: 'Living-room monstera', profile: 'monstera', factor: 1, last: addDays(T, -5) },
    { id: 'p2', name: 'Kitchen herbs', profile: 'herbs', factor: 0.8, last: addDays(T, -2) },
    { id: 'p3', name: 'Balcony tomatoes', profile: 'tomato', factor: 1, last: addDays(T, -1) },
    { id: 'p4', name: 'Window cactus', profile: 'succ', factor: 1, last: addDays(T, -9) },
    { id: 'p5', name: 'Bathroom fern', profile: 'fern', factor: 1.3, last: addDays(T, -4) },
    { id: 'p6', name: 'Front roses', profile: 'roses', factor: 1, last: addDays(T, -6) },
  ],
  season: ['Winter', 'Winter', 'Spring', 'Spring', 'Spring', 'Summer', 'Summer', 'Summer', 'Autumn', 'Autumn', 'Autumn', 'Winter'][month],
  lat: 50.45, lon: 30.52, place: 'Kyiv',
  weather: [], source: 'demo', fetched: '', rainCounts: 5, hot: 30, notify: false, notified: '',
}

const FACTORS: [string, string][] = [['0.7', 'Small pot / full sun'], ['0.85', 'Sunny / windy'], ['1', 'Normal'], ['1.3', 'Large pot / shade'], ['1.6', 'Humid / cool spot']]
const HORIZON = 13
const prof = (id: string) => PROFILES.find((p) => p.id === id) ?? PROFILES[0]
const dayName = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })

export default function WateringSchedule() {
  const [s, set, reset] = useToolState('watering-schedule', DEF)
  const [status, setStatus] = useState('')
  const t = today()
  const weather = s.weather.length ? s.weather : demoWeather(t)
  const opts = { season: s.season, rainCounts: s.rainCounts, hot: s.hot }
  const plans = s.plants.map((p) => ({ p, pr: prof(p.profile), ev: simulate({ ...prof(p.profile) }, p.factor, p.last, t, HORIZON, weather, opts) }))
  const days = Array.from({ length: HORIZON + 1 }, (_, i) => addDays(t, i))
  const dueToday = plans.filter((x) => x.ev.some((e) => e.date === t && e.kind === 'water'))
  const overdue = dueToday.filter((x) => x.ev.some((e) => e.date === t && e.note === 'overdue'))
  const week = plans.reduce((a, x) => a + x.ev.filter((e) => e.kind === 'water' && e.date < addDays(t, 7)).length * x.pr.litres, 0)
  const edit = (id: string, patch: Partial<Plant>) => set({ plants: s.plants.map((p) => (p.id === id ? { ...p, ...patch } : p)) })

  useEffect(() => {
    if (!s.notify || s.notified === t || !dueToday.length || typeof Notification === 'undefined' || Notification.permission !== 'granted') return
    new Notification('Plants to water today', { body: dueToday.map((x) => x.p.name).join(', ') })
    set({ notified: t })
  }, [s.notify, s.notified, t, dueToday, set])

  const fetchWeather = async () => {
    setStatus('Fetching forecast…')
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${s.lat}&longitude=${s.lon}&daily=precipitation_sum,temperature_2m_max&past_days=7&forecast_days=14&timezone=auto`
      const r = await fetch(url)
      if (!r.ok) throw new Error(String(r.status))
      const j = (await r.json()) as { daily: { time: string[]; precipitation_sum: (number | null)[]; temperature_2m_max: (number | null)[] } }
      const w = j.daily.time.map((date, i) => ({ date, rain: j.daily.precipitation_sum[i] ?? 0, tmax: j.daily.temperature_2m_max[i] ?? 20 }))
      set({ weather: w, source: 'live', fetched: new Date().toLocaleString() })
      setStatus('')
    } catch {
      setStatus('Could not reach Open-Meteo (offline?). Using demo weather.')
    }
  }
  const locate = () => {
    if (!navigator.geolocation) return setStatus('Geolocation is not available in this browser.')
    navigator.geolocation.getCurrentPosition(
      (p) => set({ lat: Number(p.coords.latitude.toFixed(3)), lon: Number(p.coords.longitude.toFixed(3)), place: 'My location', weather: [], source: 'demo' }),
      () => setStatus('Location permission denied — enter coordinates instead.'),
    )
  }
  const icon = (e?: Event) => (!e ? '' : e.kind === 'water' ? '💧' : e.kind === 'skip' ? '⏭' : '🌧')
  const wd = (d: string) => weather.find((w) => w.date === d)

  return (
    <Split wide="right">
      <div>
        <Panel title="Season & weather">
          <div className="k-field">
            <span className="k-label">Season</span>
            <Seg value={s.season} onChange={(season) => set({ season })} options={Object.keys(SEASON).map((k) => [k, k] as [string, string])} />
          </div>
          <Row>
            <Num label="Latitude" value={s.lat} onChange={(lat) => set({ lat })} min={-90} max={90} />
            <Num label="Longitude" value={s.lon} onChange={(lon) => set({ lon })} min={-180} max={180} />
          </Row>
          <Row>
            <Btn kind="primary" onClick={() => void fetchWeather()}>☁ Fetch forecast</Btn>
            <Btn onClick={locate}>📍 My location</Btn>
            {s.source === 'live' && <Btn kind="ghost" onClick={() => set({ weather: [], source: 'demo' })}>Use demo</Btn>}
          </Row>
          {status && <Note tone="warn">{status}</Note>}
          <p className="muted" style={{ fontSize: 13 }}>
            {s.source === 'live' ? `Live Open-Meteo data for ${s.lat}, ${s.lon} · ${s.fetched}` : 'Demo weather shown. Fetch the free Open-Meteo forecast (no key, only coordinates are sent).'}
          </p>
          <Row>
            <Num label="Rain that counts as watering" value={s.rainCounts} onChange={(rainCounts) => set({ rainCounts })} unit="mm" min={0} />
            <Num label="Hot day from" value={s.hot} onChange={(hot) => set({ hot })} unit="°C" />
          </Row>
          <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 90, marginTop: 8 }}>
            {weather.slice(0, 22).map((w) => (
              <div key={w.date} title={`${w.date}: ${w.rain} mm, ${w.tmax}°C`} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, opacity: w.date < t ? 0.55 : 1 }}>
                <span style={{ fontSize: 10, color: w.tmax >= s.hot ? 'var(--err)' : 'var(--muted)' }}>{Math.round(w.tmax)}°</span>
                <div style={{ width: '70%', height: Math.min(50, w.rain * 3), minHeight: 2, background: w.rain >= s.rainCounts ? '#0ea5e9' : 'var(--line)', borderRadius: 3 }} />
                <span style={{ fontSize: 9, fontWeight: w.date === t ? 800 : 400 }}>{w.date === t ? 'now' : w.date.slice(8)}</span>
              </div>
            ))}
          </div>
          <p className="muted" style={{ fontSize: 12 }}>Bars = daily rain (blue counts as watering for outdoor plants); faded = past days.</p>
        </Panel>
        <Panel title="Reminders">
          <Check
            label="Browser notification when plants are due (while this page is open)"
            value={s.notify}
            onChange={async (notify) => {
              if (notify && typeof Notification !== 'undefined' && Notification.permission === 'default') await Notification.requestPermission()
              set({ notify, notified: '' })
            }}
          />
          {typeof Notification === 'undefined' && <Note tone="warn">This browser does not support notifications.</Note>}
          <Row>
            <JsonButtons name="watering-schedule.json" data={s} onLoad={(d) => set(d)} />
            <Btn kind="ghost" onClick={reset}>Reset</Btn>
          </Row>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Due today" value={dueToday.length} sub={dueToday.map((x) => x.p.name).join(', ') || 'nothing — relax'} tone={dueToday.length ? 'accent' : 'good'} />
          <Stat label="Overdue" value={overdue.length} tone={overdue.length ? 'bad' : 'good'} />
          <Stat label="Water next 7 days" value={`${num(week, 1)} L`} sub={`${s.plants.length} plants`} />
        </Stats>
        <Panel title="Today">
          {dueToday.length === 0 && <Note tone="ok">No plant needs water today.</Note>}
          {dueToday.map(({ p, pr, ev }) => (
            <Row key={p.id}>
              <span style={{ flex: 1 }}>💧 <b>{p.name}</b> — {num(pr.litres, 2)} L{ev[0]?.note === 'overdue' && <b style={{ color: 'var(--err)' }}> · overdue</b>} <span className="muted">· {pr.tip}</span></span>
              <Btn kind="primary" onClick={() => edit(p.id, { last: t })}>Watered ✓</Btn>
            </Row>
          ))}
        </Panel>
        <Panel title="Two-week schedule" actions={<CsvButton name="watering-schedule.csv" rows={() => [['Date', 'Plant', 'Action', 'Litres', 'Note'], ...plans.flatMap((x) => x.ev.map((e) => [e.date, x.p.name, e.kind, e.kind === 'water' ? x.pr.litres : 0, e.note ?? '']))].sort((a, b) => String(a[0]).localeCompare(String(b[0])))} />}>
          <div className="k-table-wrap">
            <table className="k-table" style={{ textAlign: 'center' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Plant</th>
                  {days.map((d) => (
                    <th key={d} style={{ padding: '4px 2px', fontSize: 11, background: d === t ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : undefined }}>
                      {dayName(d)}<br />{d.slice(8)}{(wd(d)?.rain ?? 0) >= s.rainCounts ? <><br />🌧</> : null}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {plans.map(({ p, ev }) => (
                  <tr key={p.id}>
                    <td style={{ textAlign: 'left', whiteSpace: 'nowrap' }}>{p.name}</td>
                    {days.map((d) => {
                      const e = ev.find((x) => x.date === d)
                      return <td key={d} title={e ? `${e.kind}${e.note ? ` (${e.note})` : ''}` : ''} style={{ padding: '4px 2px', background: d === t ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : undefined }}>{icon(e)}</td>
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted" style={{ fontSize: 12 }}>💧 water · 🌧 rain does it for you · ⏭ skipped, rain on a due day. Hot days shorten outdoor intervals by 30 %.</p>
        </Panel>
        <Panel title="Plants" actions={<Btn onClick={() => set({ plants: [...s.plants, { id: uid(), name: 'New plant', profile: 'pothos', factor: 1, last: t }] })}>+ Plant</Btn>}>
          <Table
            head={['Name', 'Type', 'Spot', 'Last watered', 'Every', '']}
            rows={plans.map(({ p, pr }) => [
              <input key="n" value={p.name} onChange={(e) => edit(p.id, { name: e.target.value })} aria-label="Plant name" style={{ width: 140 }} />,
              <select key="t" value={p.profile} onChange={(e) => edit(p.id, { profile: e.target.value })} aria-label="Plant type">
                {PROFILES.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>,
              <select key="f" value={String(p.factor)} onChange={(e) => edit(p.id, { factor: Number(e.target.value) })} aria-label="Spot">
                {FACTORS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>,
              <div key="l">
                <input type="date" value={p.last} max={t} onChange={(e) => e.target.value && edit(p.id, { last: e.target.value })} aria-label="Last watered" />
                <div className="muted" style={{ fontSize: 12 }}>{diffDays(t, p.last)} days ago</div>
              </div>,
              <span key="e" className="muted" style={{ whiteSpace: 'nowrap' }}>~{Math.round(pr.days * p.factor * (SEASON[s.season] ?? 1))} d · {pr.where}</span>,
              <Btn key="x" kind="ghost" title="Remove" onClick={() => set({ plants: s.plants.filter((x) => x.id !== p.id) })}>✕</Btn>,
            ])}
          />
          <Note>Intervals are starting points. The finger test beats any schedule: water when the top 2–3 cm of soil are dry, and always until water drains from the pot.</Note>
        </Panel>
      </div>
    </Split>
  )
}
