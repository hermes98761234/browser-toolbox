import { useMemo, useState } from 'react'
import { Btn, CsvButton, fmt, LineChart, Note, Num, Panel, Row, Select, Slider, Split, Stat, Stats, Table, Txt, useToolState } from '../kit'
import { compass, dayEvents, hhmm, lightPhase, localMidnight, moonIllumination, moonPosition, phaseName, sunPosition, tzOffset } from './lib/golden-hour-planner'

const CITIES: [string, number, number, string][] = [
  ['Kyiv', 50.4501, 30.5234, 'Europe/Kyiv'],
  ['London', 51.5074, -0.1278, 'Europe/London'],
  ['Paris', 48.8566, 2.3522, 'Europe/Paris'],
  ['Reykjavík', 64.1466, -21.9426, 'Atlantic/Reykjavik'],
  ['New York', 40.7128, -74.006, 'America/New_York'],
  ['San Francisco', 37.7749, -122.4194, 'America/Los_Angeles'],
  ['Rio de Janeiro', -22.9068, -43.1729, 'America/Sao_Paulo'],
  ['Cape Town', -33.9249, 18.4241, 'Africa/Johannesburg'],
  ['Dubai', 25.2048, 55.2708, 'Asia/Dubai'],
  ['Tokyo', 35.6762, 139.6503, 'Asia/Tokyo'],
  ['Sydney', -33.8688, 151.2093, 'Australia/Sydney'],
  ['Singapore', 1.3521, 103.8198, 'Asia/Singapore'],
]
const PHASE_COLOR = { night: '#0b1026', twilight: '#26336b', blue: '#3366d6', golden: '#f5a524', day: '#9bd5ff' }

const localDate = (ms: number, zone: string) => new Date(ms + tzOffset(zone, ms) * 60000).toISOString().slice(0, 10)
const DEF = { place: 'Kyiv', lat: 50.4501, lng: 30.5234, zone: 'Europe/Kyiv', date: '' }

const validZone = (z: string) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: z })
    return true
  } catch {
    return false
  }
}
const span = (r: [number, number] | undefined, z: string) => (r ? `${hhmm(r[0], z)} – ${hhmm(r[1], z)}` : '—')
const mins = (r?: [number, number]) => (r ? `${Math.round((r[1] - r[0]) / 60000)} min` : 'does not occur')

export default function GoldenHourPlanner() {
  const [s, set, reset] = useToolState('golden-hour-planner', DEF)
  const [geoMsg, setGeoMsg] = useState('')
  const [now] = useState(() => Date.now())
  const zone = validZone(s.zone) ? s.zone : 'UTC'
  const date = /^\d{4}-\d{2}-\d{2}$/.test(s.date) ? s.date : localDate(now, zone)
  const lat = Math.max(-89.9, Math.min(89.9, s.lat))
  const lng = s.lng
  const start = useMemo(() => localMidnight(date, zone), [date, zone])
  const ev = useMemo(() => dayEvents(start, lat, lng), [start, lat, lng])
  const [minute, setMinute] = useState<number | null>(null)
  const atMin = minute ?? (ev.eveningGolden ? Math.round((ev.eveningGolden[0] - start) / 60000) : 18 * 60)
  const at = start + atMin * 60000
  const sun = sunPosition(at, lat, lng)
  const moon = moonPosition(at, lat, lng)
  const illum = moonIllumination(at)

  const curve = useMemo(() => {
    const sunPts: [number, number][] = []
    const moonPts: [number, number][] = []
    const phases: { t: number; ph: keyof typeof PHASE_COLOR }[] = []
    for (let m = 0; m <= 1440; m += 5) {
      const t = start + m * 60000
      const a = sunPosition(t, lat, lng)
      sunPts.push([m / 60, a.alt])
      moonPts.push([m / 60, moonPosition(t, lat, lng).alt])
      phases.push({ t: m, ph: lightPhase(a.alt) })
    }
    return { sunPts, moonPts, phases }
  }, [start, lat, lng])

  const week = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => {
        const d = new Date(Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10) + i)).toISOString().slice(0, 10)
        return { d, e: dayEvents(localMidnight(d, zone), lat, lng) }
      }),
    [date, zone, lat, lng],
  )

  const shiftDay = (n: number) => {
    const d = new Date(Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10) + n))
    set({ date: d.toISOString().slice(0, 10) })
  }
  const locate = () => {
    if (!('geolocation' in navigator)) return setGeoMsg('Geolocation is not available in this browser.')
    setGeoMsg('Locating…')
    navigator.geolocation.getCurrentPosition(
      (p) => {
        set({ place: 'My location', lat: +p.coords.latitude.toFixed(4), lng: +p.coords.longitude.toFixed(4), zone: Intl.DateTimeFormat().resolvedOptions().timeZone })
        setGeoMsg('')
      },
      (e) => setGeoMsg(`Could not get your location: ${e.message}`),
      { timeout: 10000 },
    )
  }

  const polar = (az: number, alt: number, R: number) => {
    const r = (R * (90 - Math.max(0, alt))) / 90
    return [Math.sin(az * (Math.PI / 180)) * r, -Math.cos(az * (Math.PI / 180)) * r]
  }
  const ray = (t: number | undefined, color: string, text: string, dashed = false) => {
    if (t === undefined) return null
    const p = sunPosition(t, lat, lng)
    const [x, y] = polar(p.az, 0, 118)
    return (
      <g key={text}>
        <line x1={0} y1={0} x2={x} y2={y} stroke={color} strokeWidth={2.5} strokeDasharray={dashed ? '5 4' : undefined} />
        {!dashed && <text x={x * 1.13} y={y * 1.13 + 4} fontSize={10} textAnchor="middle" fill="currentColor">{text}</text>}
      </g>
    )
  }
  const path = curve.sunPts.filter((p) => p[1] > 0).map((p) => {
    const pos = sunPosition(start + p[0] * 3600000, lat, lng)
    return polar(pos.az, pos.alt, 118).map((v) => v.toFixed(1)).join(',')
  })
  const [sx, sy] = polar(sun.az, sun.alt, 118)
  const [mx, my] = polar(moon.az, 0, 118)

  return (
    <Split>
      <div>
        <Panel title="Location">
          <Select
            label="City"
            value={CITIES.some((c) => c[0] === s.place) ? s.place : ''}
            onChange={(place) => {
              const c = CITIES.find((x) => x[0] === place)
              if (c) set({ place, lat: c[1], lng: c[2], zone: c[3] })
            }}
            options={[['', s.place === 'My location' ? 'My location' : 'Custom…'], ...CITIES.map((c) => [c[0], c[0]] as [string, string])]}
          />
          <Row>
            <Num label="Latitude" value={s.lat} onChange={(v) => set({ lat: v, place: 'Custom' })} min={-90} max={90} unit="°" />
            <Num label="Longitude" value={s.lng} onChange={(v) => set({ lng: v, place: 'Custom' })} min={-180} max={180} unit="°" />
          </Row>
          <Txt label="Time zone (IANA)" value={s.zone} onChange={(z) => set({ zone: z })} hint={validZone(s.zone) ? `UTC${tzOffset(zone, at) >= 0 ? '+' : '−'}${fmt(Math.abs(tzOffset(zone, at)) / 60, 3)}` : 'Unknown zone, using UTC'} />
          <Row>
            <Btn kind="primary" onClick={locate}>📍 Use my location</Btn>
            <Btn kind="ghost" onClick={reset}>Reset</Btn>
          </Row>
          {geoMsg && <Note tone="warn">{geoMsg}</Note>}
        </Panel>
        <Panel title="Date & time">
          <Txt label="Date" type="date" value={date} onChange={(d) => set({ date: d })} />
          <Row>
            <Btn onClick={() => shiftDay(-1)}>◀ Day</Btn>
            <Btn onClick={() => set({ date: '' })}>Today</Btn>
            <Btn onClick={() => shiftDay(1)}>Day ▶</Btn>
          </Row>
          <Slider label="Time of day" value={atMin} onChange={setMinute} min={0} max={1439} step={1} show={() => hhmm(at, zone)} />
          <Note>
            At {hhmm(at, zone)} the sun is <b>{fmt(sun.alt, 3)}°</b> high at <b>{fmt(sun.az, 3)}° {compass(sun.az)}</b>: {lightPhase(sun.alt)} light. The moon is {fmt(moon.alt, 3)}° at {compass(moon.az)}, {phaseName(illum.phase).toLowerCase()} ({Math.round(illum.fraction * 100)}% lit).
          </Note>
        </Panel>
        <Panel title="Sun & moon directions">
          <svg viewBox="-150 -150 300 300" style={{ width: '100%', maxWidth: 340, display: 'block', margin: '0 auto' }} role="img" aria-label="Compass with sun and moon azimuths">
            {[118, 79, 39].map((r) => <circle key={r} r={r} fill="none" stroke="var(--line)" />)}
            <text x={0} y={-124} textAnchor="middle" fontSize={12} fontWeight={700} fill="currentColor">N</text>
            <text x={128} y={4} textAnchor="middle" fontSize={12} fill="currentColor">E</text>
            <text x={0} y={136} textAnchor="middle" fontSize={12} fill="currentColor">S</text>
            <text x={-128} y={4} textAnchor="middle" fontSize={12} fill="currentColor">W</text>
            {path.length > 1 && <polyline points={path.join(' ')} fill="none" stroke="#f5a524" strokeOpacity={0.5} strokeWidth={2} />}
            {ray(ev.sunrise, '#fb923c', 'sunrise')}
            {ray(ev.sunset, '#ef4444', 'sunset')}
            {ray(ev.eveningGolden?.[0], '#f5a524', 'golden', true)}
            <line x1={0} y1={0} x2={mx} y2={my} stroke="#94a3b8" strokeWidth={2} strokeDasharray="2 3" />
            <circle cx={mx} cy={my} r={7} fill={moon.alt > 0 ? '#e2e8f0' : 'none'} stroke="#94a3b8" />
            {sun.alt > -1 && <circle cx={sx} cy={sy} r={9} fill={PHASE_COLOR[lightPhase(sun.alt)] === PHASE_COLOR.day ? '#facc15' : '#f97316'} stroke="#fff" />}
          </svg>
          <p className="muted" style={{ fontSize: 13, margin: '6px 0 0' }}>
            Rings are 0°, 30° and 60° altitude; the arc is today's sun path. Solid lines: sunrise and sunset bearings, dashed: start of evening golden hour, dotted: moon bearing now.
          </p>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Morning golden hour" value={span(ev.morningGolden, zone)} sub={mins(ev.morningGolden)} tone="accent" />
          <Stat label="Evening golden hour" value={span(ev.eveningGolden, zone)} sub={mins(ev.eveningGolden)} tone="accent" />
          <Stat label="Blue hour" value={span(ev.eveningBlue, zone)} sub={`morning ${span(ev.morningBlue, zone)}`} />
          <Stat label="Sunrise / sunset" value={`${hhmm(ev.sunrise, zone)} / ${hhmm(ev.sunset, zone)}`} sub={`noon ${hhmm(ev.noon, zone)}, ${fmt(ev.noonAlt, 3)}° high`} />
        </Stats>
        {!ev.sunrise && (ev.noonAlt > 0 ? <Note tone="warn">Midnight sun: the sun does not set on this date.</Note> : <Note tone="warn">Polar night: the sun stays below the horizon.</Note>)}
        <Panel title={`Light through the day · ${date}`}>
          <svg viewBox="0 0 1440 70" preserveAspectRatio="none" style={{ width: '100%', height: 54, display: 'block', borderRadius: 8 }}>
            {curve.phases.map((p) => <rect key={p.t} x={p.t} y={0} width={5.5} height={70} fill={PHASE_COLOR[p.ph]} />)}
            <line x1={atMin} x2={atMin} y1={0} y2={70} stroke="#fff" strokeWidth={3} />
          </svg>
          <Row wrap={false}>
            {[0, 6, 12, 18, 24].map((h) => <span key={h} className="muted" style={{ flex: 1, fontSize: 12, textAlign: h === 24 ? 'right' : h ? 'center' : 'left' }}>{String(h).padStart(2, '0')}:00</span>)}
          </Row>
          <div className="k-legend">
            {(Object.keys(PHASE_COLOR) as (keyof typeof PHASE_COLOR)[]).map((k) => <span key={k}><i style={{ background: PHASE_COLOR[k] }} />{k === 'twilight' ? 'nautical/astro twilight' : k === 'blue' ? 'blue hour (−6° to −4°)' : k === 'golden' ? 'golden hour (−4° to 6°)' : k}</span>)}
          </div>
          <LineChart
            height={220}
            series={[
              { name: 'Sun altitude', points: curve.sunPts, color: '#f59e0b', area: true },
              { name: 'Moon altitude', points: curve.moonPts, color: '#94a3b8', dashed: true },
            ]}
            xMin={0}
            xMax={24}
            fx={(v) => `${String(Math.floor(v)).padStart(2, '0')}:${String(Math.round((v % 1) * 60)).padStart(2, '0')}`}
            fy={(v) => `${fmt(v, 3)}°`}
            markers={[{ x: atMin / 60, label: hhmm(at, zone) }]}
          />
        </Panel>
        <Panel title="Next 14 days" actions={<CsvButton name="golden-hours.csv" rows={() => [['Date', 'Morning blue', 'Morning golden', 'Sunrise', 'Sunset', 'Evening golden', 'Evening blue', 'Moonrise', 'Moonset'], ...week.map(({ d, e }) => [d, span(e.morningBlue, zone), span(e.morningGolden, zone), hhmm(e.sunrise, zone), hhmm(e.sunset, zone), span(e.eveningGolden, zone), span(e.eveningBlue, zone), hhmm(e.moonrise, zone), hhmm(e.moonset, zone)])]} />}>
          <Table
            head={['Date', 'Morning golden', 'Sunrise', 'Sunset', 'Evening golden', 'Blue hour', 'Moon']}
            rows={week.map(({ d, e }) => {
              const il = moonIllumination(localMidnight(d, zone) + 43200000)
              return [
                <b key="d">{new Date(d + 'T12:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })}</b>,
                span(e.morningGolden, zone),
                hhmm(e.sunrise, zone),
                hhmm(e.sunset, zone),
                span(e.eveningGolden, zone),
                span(e.eveningBlue, zone),
                `${Math.round(il.fraction * 100)}% · rise ${hhmm(e.moonrise, zone)}`,
              ]
            })}
          />
        </Panel>
        <Note>
          Times assume a flat horizon; hills and buildings end golden hour earlier. Scout the bearing on the compass, arrive 20 minutes before golden hour starts and stay
          through the blue hour for the deepest sky colours.
        </Note>
      </div>
    </Split>
  )
}
