import { useMemo, useState } from 'react'
import { Bar, Btn, CsvButton, Note, Num, Panel, Row, Select, Split, Stat, Stats, Table, Txt, useToolState } from '../kit'
import { altitudes, solunarDay, type SolunarDay } from './lib/solunar-fishing-planner'

const H = 3600000
const PLACES: [string, number, number, number][] = [
  ['Lake of the Woods, MN', 49.0, -94.9, -5],
  ['Florida Keys, FL', 24.7, -81.1, -4],
  ['Lake Geneva, CH', 46.45, 6.5, 2],
  ['River Tweed, UK', 55.65, -2.3, 1],
  ['Lake Balaton, HU', 46.85, 17.7, 2],
  ['Dnipro, Kyiv, UA', 50.45, 30.55, 3],
  ['Lake Taupō, NZ', -38.8, 175.9, 13],
  ['Sydney Harbour, AU', -33.85, 151.25, 11],
]
const isoDay = (d: Date) => d.toISOString().slice(0, 10)
const DEF = { place: PLACES[0][0], lat: PLACES[0][1], lon: PLACES[0][2], tz: PLACES[0][3], date: isoDay(new Date()), major: 2, minor: 1 }
const addDays = (iso: string, n: number) => isoDay(new Date(Date.parse(iso + 'T00:00:00Z') + n * 86400000))
const MOONS = ['🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘']
const moonIcon = (ang: number) => MOONS[Math.round(ang / 45) % 8]
const stars = (score: number) => '★★★★★'.slice(0, Math.max(1, Math.round(score / 20))).padEnd(5, '☆')

function Timeline({ d, s, fmt }: { d: SolunarDay; s: typeof DEF; fmt: (t: number) => string }) {
  const alt = useMemo(() => altitudes(d.t0, s.lat, s.lon), [d.t0, s.lat, s.lon])
  const W = 720, Hh = 210, L = 8, R = 8, top = 34, bandH = 120
  const x = (t: number) => L + ((t - d.t0) / (24 * H)) * (W - L - R)
  const yA = (a: number) => top + bandH / 2 - (a / 70) * (bandH / 2)
  const sky = (e: number) => (e > 0 ? '#bae6fd' : e > -6 ? '#7c8fbf' : e > -12 ? '#3b4a7a' : '#1e2747')
  const moonPath = alt.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${yA(Math.max(-8, p.moon)).toFixed(1)}`).join('')
  const evts: [number | null, string, string][] = [[d.sunrise, '☀ rise', '#f59e0b'], [d.sunset, '☀ set', '#f97316'], [d.moonrise, '☾ rise', '#cbd5e1'], [d.moonset, '☾ set', '#94a3b8']]
  return (
    <svg viewBox={`0 0 ${W} ${Hh}`} width="100%" role="img" aria-label="Day timeline" style={{ display: 'block' }}>
      {alt.slice(0, -1).map((p, i) => <rect key={i} x={x(p.t)} y={top} width={x(alt[i + 1].t) - x(p.t) + 0.5} height={bandH} fill={sky(p.sun)} />)}
      <line x1={L} x2={W - R} y1={yA(0)} y2={yA(0)} stroke="#fff" strokeOpacity={0.5} strokeDasharray="3 3" />
      {d.periods.map((p) => (
        <g key={p.label}>
          <rect x={x(Math.max(d.t0, p.start))} y={top} width={Math.max(0, x(Math.min(d.t1, p.end)) - x(Math.max(d.t0, p.start)))} height={bandH} fill={p.kind === 'major' ? '#10b981' : '#a3e635'} opacity={p.kind === 'major' ? 0.45 : 0.35} />
          <text x={x(p.center)} y={top + bandH - 6} textAnchor="middle" fontSize={11} fontWeight={700} fill="#064e3b">{p.kind === 'major' ? 'MAJOR' : 'minor'}</text>
        </g>
      ))}
      <path d={moonPath} fill="none" stroke="#f8fafc" strokeWidth={2.2} />
      <text x={W - R - 4} y={top + 14} textAnchor="end" fontSize={11} fill="#f8fafc">— moon altitude</text>
      {evts.map(([t, l, c], i) => t !== null && (
        <g key={l}>
          <line x1={x(t)} x2={x(t)} y1={top - 4} y2={top + bandH} stroke={c} strokeWidth={1.5} />
          <text x={x(t)} y={top - 8 - (i % 2) * 13} textAnchor="middle" fontSize={11} fill="var(--fg)">{l} {fmt(t)}</text>
        </g>
      ))}
      {Array.from({ length: 9 }, (_, i) => (
        <text key={i} x={x(d.t0 + i * 3 * H)} y={top + bandH + 16} textAnchor={i === 0 ? 'start' : i === 8 ? 'end' : 'middle'} fontSize={11} fill="var(--muted)">{String(i * 3).padStart(2, '0')}:00</text>
      ))}
    </svg>
  )
}

export default function SolunarFishingPlanner() {
  const [s, set, reset] = useToolState('solunar-fishing-planner', DEF)
  const [geoMsg, setGeoMsg] = useState('')
  const ok = Math.abs(s.lat) <= 89 && Math.abs(s.lon) <= 180 && Math.abs(s.tz) <= 14
  const fmt = (t: number | null) => (t === null ? '—' : new Date(t + s.tz * H).toISOString().slice(11, 16))
  const day = useMemo(() => (ok ? solunarDay(s.date, s.lat, s.lon, s.tz, s.major, s.minor) : null), [ok, s.date, s.lat, s.lon, s.tz, s.major, s.minor])
  const outlook = useMemo(() => (ok ? Array.from({ length: 14 }, (_, i) => { const dt = addDays(s.date, i); return [dt, solunarDay(dt, s.lat, s.lon, s.tz, s.major, s.minor)] as const }) : []), [ok, s.date, s.lat, s.lon, s.tz, s.major, s.minor])
  const best = day?.periods.filter((p) => p.kind === 'major').sort((a, b) => {
    const tw = (p: typeof a) => Math.min(...[day.sunrise, day.sunset].filter((x): x is number => x !== null).map((t) => Math.abs(p.center - t)), 1e12)
    return tw(a) - tw(b)
  })[0]
  const twilightNote = (c: number) => [day?.sunrise, day?.sunset].some((t) => t != null && Math.abs(c - t) < 1.5 * H) ? '⭐ near sunrise/sunset' : ''

  const locate = () => {
    if (!navigator.geolocation) return setGeoMsg('Geolocation is not available in this browser.')
    setGeoMsg('Locating…')
    navigator.geolocation.getCurrentPosition(
      (p) => { set({ lat: +p.coords.latitude.toFixed(4), lon: +p.coords.longitude.toFixed(4), place: 'My location', tz: -new Date().getTimezoneOffset() / 60 }); setGeoMsg('') },
      (e) => setGeoMsg(`Could not get your location (${e.message}). Enter coordinates instead.`),
      { timeout: 10000 },
    )
  }

  return (
    <Split>
      <div>
        <Panel title="Where & when" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Select label="Fishing spot" value={PLACES.some((p) => p[0] === s.place) ? s.place : ''} onChange={(place) => { const p = PLACES.find((x) => x[0] === place); if (p) set({ place, lat: p[1], lon: p[2], tz: p[3] }) }} options={[['', s.place === 'My location' ? 'My location' : 'Custom'], ...PLACES.map((p) => [p[0], p[0]] as [string, string])]} />
          <Btn onClick={locate}>📍 Use my location</Btn>
          {geoMsg && <Note tone="warn">{geoMsg}</Note>}
          <Row>
            <Num label="Latitude" value={s.lat} onChange={(lat) => set({ lat, place: 'Custom' })} unit="°N" min={-89} max={89} />
            <Num label="Longitude" value={s.lon} onChange={(lon) => set({ lon, place: 'Custom' })} unit="°E" min={-180} max={180} />
          </Row>
          <Num label="Time zone (UTC offset, incl. daylight saving)" value={s.tz} onChange={(tz) => set({ tz })} unit="h" min={-12} max={14} step={0.5} />
          <Row>
            <Btn onClick={() => set({ date: addDays(s.date, -1) })}>‹</Btn>
            <Txt label="Date" type="date" value={s.date} onChange={(date) => date && set({ date })} />
            <Btn onClick={() => set({ date: addDays(s.date, 1) })}>›</Btn>
          </Row>
          <Btn onClick={() => set({ date: isoDay(new Date()) })}>Today</Btn>
        </Panel>
        <Panel title="Period lengths">
          <Row>
            <Num label="Major" value={s.major} onChange={(major) => set({ major: Math.max(0.5, Math.min(4, major)) })} unit="h" min={0.5} max={4} step={0.5} />
            <Num label="Minor" value={s.minor} onChange={(minor) => set({ minor: Math.max(0.5, Math.min(3, minor)) })} unit="h" min={0.5} max={3} step={0.5} />
          </Row>
          <p className="muted" style={{ fontSize: 13 }}>Majors are centred on the Moon passing overhead and underfoot; minors on moonrise and moonset.</p>
        </Panel>
        <Note tone="warn"><b>Folklore, not science.</b> Solunar theory (1920s) claims fish and game feed more around these lunar events. Studies show mixed results at best; weather, water temperature, light and tides usually matter more. The Sun and Moon times themselves are real astronomy (±2 min).</Note>
      </div>
      <div>
        {!ok && <Note tone="err">Check latitude (−89…89), longitude (−180…180) and time zone (−12…14).</Note>}
        {day && (
          <>
            <Stats>
              <Stat label="Solunar rating" value={<span>{day.rating}</span>} sub={`${stars(day.score)} · ${day.score}/100`} tone={day.score >= 60 ? 'good' : day.score < 25 ? 'bad' : 'accent'} />
              <Stat label="Moon" value={`${moonIcon(day.phase.ang)} ${Math.round(day.phase.frac * 100)}%`} sub={day.phase.name} />
              <Stat label="Best window" value={best ? `${fmt(best.start)}–${fmt(best.end)}` : '—'} sub={best ? best.label : 'no major period today'} />
              <Stat label="Sun" value={`${fmt(day.sunrise)} / ${fmt(day.sunset)}`} sub="sunrise / sunset" />
            </Stats>
            <Panel title={`Day timeline · ${s.date} (UTC${s.tz >= 0 ? '+' : ''}${s.tz})`}>
              <Timeline d={day} s={s} fmt={(t) => fmt(t)} />
              <div className="k-legend">
                <span><i style={{ background: '#10b981' }} />Major period</span>
                <span><i style={{ background: '#a3e635' }} />Minor period</span>
                <span><i style={{ background: '#bae6fd' }} />Day</span>
                <span><i style={{ background: '#3b4a7a' }} />Twilight / night</span>
              </div>
            </Panel>
            <Panel title="Periods">
              {day.periods.length ? (
                <Table head={['Type', 'Event', 'Centre', 'Window', '']} rows={day.periods.map((p) => [<b key="k" style={{ color: p.kind === 'major' ? 'var(--ok)' : undefined }}>{p.kind === 'major' ? 'Major' : 'Minor'}</b>, p.label, fmt(p.center), `${fmt(p.start)}–${fmt(p.end)}`, twilightNote(p.center)])} />
              ) : (
                <p className="muted">No lunar events on this day (possible at high latitudes).</p>
              )}
              <p className="muted" style={{ fontSize: 12.5 }}>Lunar events drift about 50 minutes later each day, so some days have only three periods.</p>
            </Panel>
          </>
        )}
        {outlook.length > 0 && (
          <Panel title="14-day outlook" actions={<CsvButton name="solunar-outlook.csv" rows={() => [['Date', 'Moon', 'Illumination %', 'Score', 'Rating', 'Major 1', 'Major 2', 'Minor 1', 'Minor 2'], ...outlook.map(([dt, d]) => { const mj = d.periods.filter((p) => p.kind === 'major'); const mn = d.periods.filter((p) => p.kind === 'minor'); return [dt, d.phase.name, Math.round(d.phase.frac * 100), d.score, d.rating, mj[0] ? `${fmt(mj[0].start)}-${fmt(mj[0].end)}` : '', mj[1] ? `${fmt(mj[1].start)}-${fmt(mj[1].end)}` : '', mn[0] ? fmt(mn[0].center) : '', mn[1] ? fmt(mn[1].center) : ''] })]} />}>
            <Table
              head={['Date', 'Moon', 'Rating', 'Majors', 'Minors']}
              rows={outlook.map(([dt, d]) => [
                <a key="d" href="#" onClick={(e) => { e.preventDefault(); set({ date: dt }) }} style={{ fontWeight: dt === s.date ? 800 : 500 }}>{new Date(dt + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })}</a>,
                `${moonIcon(d.phase.ang)} ${Math.round(d.phase.frac * 100)}%`,
                <div key="r" style={{ minWidth: 110 }}><span style={{ fontSize: 12.5 }}>{d.rating} · {d.score}</span><Bar value={d.score} max={100} color={d.score >= 60 ? 'var(--ok)' : d.score < 25 ? 'var(--muted)' : 'var(--accent)'} /></div>,
                d.periods.filter((p) => p.kind === 'major').map((p) => fmt(p.center)).join(', ') || '—',
                d.periods.filter((p) => p.kind === 'minor').map((p) => fmt(p.center)).join(', ') || '—',
              ])}
            />
          </Panel>
        )}
      </div>
    </Split>
  )
}
