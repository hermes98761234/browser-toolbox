import { useMemo, useState } from 'react'
import { Btn, CsvButton, Legend, LineChart, Note, num, Num, Panel, Row, Seg, Select, Split, Stat, Stats, Table, Txt, useToolState } from '../kit'
import { compass, hhmm, localMidnight, tzOffset } from './lib/golden-hour-planner'
import { addDaysIso, dayInfo, hm, sunPosition, type Day } from './lib/sunrise-sunset-planner'

const CITIES: [string, number, number, string][] = [
  ['Kyiv', 50.4501, 30.5234, 'Europe/Kyiv'], ['London', 51.5074, -0.1278, 'Europe/London'], ['Paris', 48.8566, 2.3522, 'Europe/Paris'], ['Berlin', 52.52, 13.405, 'Europe/Berlin'],
  ['Warsaw', 52.2297, 21.0122, 'Europe/Warsaw'], ['Reykjavík', 64.1466, -21.9426, 'Atlantic/Reykjavik'], ['Tromsø', 69.6492, 18.9553, 'Europe/Oslo'], ['New York', 40.7128, -74.006, 'America/New_York'],
  ['Chicago', 41.8781, -87.6298, 'America/Chicago'], ['Los Angeles', 34.0522, -118.2437, 'America/Los_Angeles'], ['Anchorage', 61.2181, -149.9003, 'America/Anchorage'], ['Honolulu', 21.3069, -157.8583, 'Pacific/Honolulu'],
  ['Mexico City', 19.4326, -99.1332, 'America/Mexico_City'], ['São Paulo', -23.5505, -46.6333, 'America/Sao_Paulo'], ['Cape Town', -33.9249, 18.4241, 'Africa/Johannesburg'], ['Dubai', 25.2048, 55.2708, 'Asia/Dubai'],
  ['Mumbai', 19.076, 72.8777, 'Asia/Kolkata'], ['Singapore', 1.3521, 103.8198, 'Asia/Singapore'], ['Tokyo', 35.6762, 139.6503, 'Asia/Tokyo'], ['Sydney', -33.8688, 151.2093, 'Australia/Sydney'],
]
const DEF = { place: 'Kyiv', lat: 50.4501, lon: 30.5234, zone: 'Europe/Kyiv', date: '', days: '14' as '7' | '14' | '30' | '90' }
const validZone = (z: string) => { try { new Intl.DateTimeFormat('en', { timeZone: z }); return true } catch { return false } }
const BANDS: [string, string, (e: number) => boolean][] = [
  ['Night', '#0b1026', (e) => e < -18], ['Astronomical twilight', '#1e2a5a', (e) => e < -12], ['Nautical twilight', '#2f4a8a', (e) => e < -6],
  ['Blue hour', '#3b82f6', (e) => e < -4], ['Civil twilight', '#93c5fd', (e) => e < -0.833], ['Golden hour', '#f59e0b', (e) => e < 6], ['Daylight', '#fde68a', () => true],
]
const band = (e: number) => BANDS.findIndex(([, , f]) => f(e))

export default function SunriseSunsetPlanner() {
  const [s, set, reset] = useToolState('sunrise-sunset-planner', DEF)
  const [geoMsg, setGeoMsg] = useState('')
  const zone = validZone(s.zone) ? s.zone : 'UTC'
  const lat = Math.max(-89.99, Math.min(89.99, Number.isFinite(s.lat) ? s.lat : 0))
  const lon = Math.max(-180, Math.min(180, Number.isFinite(s.lon) ? s.lon : 0))
  const [nowMs] = useState(() => Date.now())
  const todayLocal = new Date(nowMs + tzOffset(zone, nowMs) * 60000).toISOString().slice(0, 10)
  const date = /^\d{4}-\d{2}-\d{2}$/.test(s.date) ? s.date : todayLocal
  const t = (ms: number | null) => (ms === null ? '—' : hhmm(ms, zone))
  const d = useMemo(() => dayInfo(date, lat, lon), [date, lat, lon])
  const prev = useMemo(() => dayInfo(addDaysIso(date, -1), lat, lon), [date, lat, lon])
  const start = localMidnight(date, zone)

  // 24-hour light bar sampled every 4 minutes
  const samples = useMemo(() => Array.from({ length: 361 }, (_, i) => ({ h: i / 15, e: sunPosition(start + i * 240000, lat, lon).elevation })), [start, lat, lon])
  const runs: { a: number; b: number; k: number }[] = []
  for (let i = 0; i < samples.length - 1; i++) {
    const k = band(samples[i].e)
    if (runs.length && runs[runs.length - 1].k === k) runs[runs.length - 1].b = samples[i + 1].h
    else runs.push({ a: samples[i].h, b: samples[i + 1].h, k })
  }
  const nowH = (nowMs - start) / 3600000
  const range = useMemo(() => Array.from({ length: +s.days }, (_, i) => { const iso = addDaysIso(date, i); return { iso, d: dayInfo(iso, lat, lon) } }), [date, lat, lon, s.days])
  const year = useMemo(() => {
    const y = date.slice(0, 4)
    return Array.from({ length: 366 }, (_, i) => addDaysIso(`${y}-01-01`, i)).filter((x) => x.startsWith(y)).map((iso, i) => [i + 1, dayInfo(iso, lat, lon).dayLength / 60] as [number, number])
  }, [date, lat, lon])
  const delta = d.dayLength - prev.dayLength
  const azRise = d.sunrise !== null ? sunPosition(d.sunrise, lat, lon).azimuth : null
  const azSet = d.sunset !== null ? sunPosition(d.sunset, lat, lon).azimuth : null
  const span = (a: number | null, b: number | null) => (a === null || b === null ? '—' : `${t(a)}–${t(b)}`)
  const row = (iso: string, x: Day): (string | number)[] => [iso, t(x.civilDawn), t(x.sunrise), t(x.goldenEnd), t(x.noon), t(x.goldenStart), t(x.sunset), t(x.civilDusk), x.kind === 'normal' ? hm(x.dayLength) : x.kind === 'polar-day' ? '24h (midnight sun)' : '0h (polar night)']

  return (
    <Split>
      <div>
        <Panel title="Location">
          <Select label="City preset" value={CITIES.some((c) => c[0] === s.place) ? s.place : ''} onChange={(p) => { const c = CITIES.find((x) => x[0] === p); if (c) set({ place: c[0], lat: c[1], lon: c[2], zone: c[3] }) }} options={[...(CITIES.some((c) => c[0] === s.place) ? [] : [['', s.place || 'Custom'] as [string, string]]), ...CITIES.map((c) => [c[0], c[0]] as [string, string])]} />
          <Row>
            <Num label="Latitude" value={s.lat} onChange={(v) => set({ lat: v, place: 'Custom' })} unit="°N" min={-90} max={90} hint="south is negative" />
            <Num label="Longitude" value={s.lon} onChange={(v) => set({ lon: v, place: 'Custom' })} unit="°E" min={-180} max={180} hint="west is negative" />
          </Row>
          <Txt label="Time zone (IANA)" value={s.zone} onChange={(z) => set({ zone: z })} hint={validZone(s.zone) ? `UTC${tzOffset(zone, d.noon) >= 0 ? '+' : '−'}${num(Math.abs(tzOffset(zone, d.noon)) / 60, 2)} on this date` : 'Unknown zone, using UTC'} />
          <Btn disabled={!navigator.geolocation} onClick={() => { setGeoMsg('Locating…'); navigator.geolocation.getCurrentPosition((p) => { set({ place: 'My location', lat: +p.coords.latitude.toFixed(4), lon: +p.coords.longitude.toFixed(4), zone: Intl.DateTimeFormat().resolvedOptions().timeZone }); setGeoMsg('') }, (e) => setGeoMsg(`Location unavailable: ${e.message}`)) }}>📍 Use my location</Btn>
          {geoMsg && <p className="muted">{geoMsg}</p>}
        </Panel>
        <Panel title="Date">
          <Txt label="Day" type="date" value={date} onChange={(v) => set({ date: v })} />
          <Row>
            <Btn onClick={() => set({ date: addDaysIso(date, -1) })}>← Prev</Btn>
            <Btn onClick={() => set({ date: '' })}>Today</Btn>
            <Btn onClick={() => set({ date: addDaysIso(date, 1) })}>Next →</Btn>
          </Row>
          <Row>
            {[['Mar equinox', '03-20'], ['Jun solstice', '06-21'], ['Sep equinox', '09-22'], ['Dec solstice', '12-21']].map(([l, md]) => <Btn key={l} kind="ghost" onClick={() => set({ date: `${date.slice(0, 4)}-${md}` })}>{l}</Btn>)}
          </Row>
        </Panel>
        <Panel title="Events">
          <Table head={['Event', 'Time', 'Sun']} rows={[
            ['Astronomical dawn', t(d.astroDawn), '−18°'], ['Nautical dawn', t(d.nauticalDawn), '−12°'], ['Civil dawn (first light)', t(d.civilDawn), '−6°'],
            ['Morning blue hour', span(d.civilDawn, d.blueMorningEnd), '−6…−4°'], ['Sunrise', t(d.sunrise), azRise === null ? '' : `${num(azRise, 0)}° ${compass(azRise)}`], ['Morning golden hour', span(d.sunrise, d.goldenEnd), '−0.8…6°'],
            ['Solar noon', t(d.noon), `${num(d.noonElevation, 1)}° high`], ['Evening golden hour', span(d.goldenStart, d.sunset), '6…−0.8°'], ['Sunset', t(d.sunset), azSet === null ? '' : `${num(azSet, 0)}° ${compass(azSet)}`],
            ['Evening blue hour', span(d.blueEveningStart, d.civilDusk), '−4…−6°'], ['Civil dusk (last light)', t(d.civilDusk), '−6°'], ['Nautical dusk', t(d.nauticalDusk), '−12°'], ['Astronomical dusk', t(d.astroDusk), '−18°'],
          ]} />
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Sunrise" value={t(d.sunrise)} sub={azRise === null ? (d.kind === 'polar-day' ? 'sun never sets' : 'sun never rises') : `bearing ${num(azRise, 0)}° ${compass(azRise)}`} tone="accent" />
          <Stat label="Sunset" value={t(d.sunset)} sub={azSet === null ? '' : `bearing ${num(azSet, 0)}° ${compass(azSet)}`} tone="accent" />
          <Stat label="Day length" value={d.kind === 'normal' ? hm(d.dayLength) : d.kind === 'polar-day' ? '24h' : '0h'} sub={`${delta >= 0 ? '+' : '−'}${num(Math.abs(delta), 1)} min vs yesterday`} tone={delta >= 0 ? 'good' : undefined} />
          <Stat label="Solar noon" value={t(d.noon)} sub={`max elevation ${num(d.noonElevation, 1)}°`} />
        </Stats>
        {d.kind !== 'normal' && <Note tone="warn">{d.kind === 'polar-day' ? 'Midnight sun: the sun stays above the horizon all day.' : 'Polar night: the sun does not rise today.'}</Note>}
        <Panel title={`Light through the day · ${s.place || 'Custom'} · ${date}`}>
          <svg viewBox="0 0 960 66" width="100%" style={{ display: 'block' }} role="img" aria-label="Daylight timeline">
            {runs.map((r, i) => <rect key={i} x={(r.a / 24) * 960} y={0} width={((r.b - r.a) / 24) * 960 + 0.5} height={40} fill={BANDS[r.k][1]}><title>{`${BANDS[r.k][0]}: ${hhmm(start + r.a * 3600000, zone)}–${hhmm(start + r.b * 3600000, zone)}`}</title></rect>)}
            {Array.from({ length: 25 }, (_, h) => <g key={h}><line x1={h * 40} x2={h * 40} y1={40} y2={46} stroke="var(--muted)" />{h % 3 === 0 && <text x={h * 40} y={60} textAnchor={h === 0 ? 'start' : h === 24 ? 'end' : 'middle'} fontSize={12} fill="var(--muted)">{String(h).padStart(2, '0')}:00</text>}</g>)}
            {date === todayLocal && nowH >= 0 && nowH <= 24 && <><line x1={(nowH / 24) * 960} x2={(nowH / 24) * 960} y1={-2} y2={42} stroke="#ef4444" strokeWidth={3} /><title>now</title></>}
          </svg>
          <Legend items={BANDS.map(([n, c]) => [n, c] as [string, string])} />
          <LineChart series={[{ name: 'Sun elevation', points: samples.map((p) => [p.h, p.e] as [number, number]), color: '#f59e0b', area: true }]} height={200} xMin={0} xMax={24} xLabel="Local time (h)" yLabel="Elevation °" fx={(v) => `${Math.round(v)}h`} fy={(v) => `${Math.round(v)}°`} />
        </Panel>
        <Panel title="Date range" actions={<CsvButton name={`sun-${(s.place || 'custom').toLowerCase().replace(/\W+/g, '-')}-${date}.csv`} rows={() => [['Date', 'First light', 'Sunrise', 'Golden hour ends', 'Solar noon', 'Golden hour starts', 'Sunset', 'Last light', 'Day length'], ...range.map(({ iso, d: x }) => row(iso, x))]} />}>
          <Seg value={s.days} onChange={(days) => set({ days })} options={[['7', '7 days'], ['14', '14 days'], ['30', '30 days'], ['90', '90 days']]} />
          <Table head={['Date', 'First light', 'Sunrise', 'Golden ends', 'Noon', 'Golden starts', 'Sunset', 'Last light', 'Day']} rows={range.map(({ iso, d: x }) => row(iso, x))} max={31} />
        </Panel>
        <Panel title={`Day length through ${date.slice(0, 4)}`}>
          <LineChart series={[{ name: 'Daylight', points: year, color: '#0ea5e9', area: true }]} height={200} yMin={0} yMax={24} xLabel="Day of year" fy={(v) => `${num(v, 1)} h`} fx={(v) => `${Math.round(v)}`} markers={[{ x: Math.round((Date.parse(date) - Date.parse(date.slice(0, 4) + '-01-01')) / 86400000) + 1, label: date.slice(5) }]} />
        </Panel>
        <Row><Btn kind="ghost" onClick={reset}>Reset</Btn></Row>
        <Note>Times use the NOAA solar position algorithm with standard refraction (sunrise/sunset when the sun’s centre is 0.833° below a flat horizon), accurate to about a minute for latitudes within ±72°. Mountains, buildings and weather shift what you actually see.</Note>
      </div>
    </Split>
  )
}
