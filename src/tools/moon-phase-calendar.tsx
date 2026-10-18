import { useMemo } from 'react'
import { Btn, CsvButton, download, LineChart, Note, Num, Panel, Row, Seg, Select, Split, Stat, Stats, Table, useToolState } from '../kit'
import { fullMoonName, isSuper, litPath, localMidnight, moonDay, PHASE_NAMES, phaseEvents, SYNODIC, tzOffset, type PhaseEvent } from './lib/moon-phase-calendar'

const CITIES: [string, number, number, string][] = [
  ['London', 51.5074, -0.1278, 'Europe/London'], ['Kyiv', 50.4501, 30.5234, 'Europe/Kyiv'], ['Berlin', 52.52, 13.405, 'Europe/Berlin'], ['Paris', 48.8566, 2.3522, 'Europe/Paris'],
  ['Madrid', 40.4168, -3.7038, 'Europe/Madrid'], ['Reykjavík', 64.1466, -21.9426, 'Atlantic/Reykjavik'], ['New York', 40.7128, -74.006, 'America/New_York'], ['Chicago', 41.8781, -87.6298, 'America/Chicago'],
  ['Denver', 39.7392, -104.9903, 'America/Denver'], ['Los Angeles', 34.0522, -118.2437, 'America/Los_Angeles'], ['Mexico City', 19.4326, -99.1332, 'America/Mexico_City'], ['São Paulo', -23.5505, -46.6333, 'America/Sao_Paulo'],
  ['Cape Town', -33.9249, 18.4241, 'Africa/Johannesburg'], ['Cairo', 30.0444, 31.2357, 'Africa/Cairo'], ['Dubai', 25.2048, 55.2708, 'Asia/Dubai'], ['Mumbai', 19.076, 72.8777, 'Asia/Kolkata'],
  ['Singapore', 1.3521, 103.8198, 'Asia/Singapore'], ['Tokyo', 35.6762, 139.6503, 'Asia/Tokyo'], ['Sydney', -33.8688, 151.2093, 'Australia/Sydney'], ['Auckland', -36.8485, 174.7633, 'Pacific/Auckland'],
]
const browserTz = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
})()
const home = CITIES.find((c) => c[3] === browserTz || (browserTz === 'Europe/Kiev' && c[0] === 'Kyiv')) ?? CITIES[0]
const now = new Date()
const DEF = { place: home[0], lat: home[1], lon: home[2], tz: home[3], year: now.getFullYear(), month: now.getMonth(), sel: now.getDate(), weekStart: 'mon' as 'mon' | 'sun', view: 'auto' as 'auto' | 'north' | 'south' }
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const ICON = ['🌑', '🌓', '🌕', '🌗']

function Moon({ ang, size, south }: { ang: number; size: number; south: boolean }) {
  const r = size / 2 - 1
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <defs>
        <radialGradient id={`mg${size}`} cx="45%" cy="40%" r="65%">
          <stop offset="0%" stopColor="#fefce8" />
          <stop offset="100%" stopColor="#e7e5e4" />
        </radialGradient>
      </defs>
      <circle cx={size / 2} cy={size / 2} r={r} fill="#334155" stroke="#475569" strokeWidth={0.6} />
      <path d={litPath(ang, r, size / 2, size / 2, south)} fill={`url(#mg${size})`} />
      {size > 60 && [[0.35, 0.38, 0.12], [0.6, 0.55, 0.09], [0.45, 0.68, 0.07], [0.62, 0.3, 0.06]].map(([x, y, rr], i) => (
        <circle key={i} cx={size * x} cy={size * y} r={size * rr} fill="#78716c" opacity={0.18} />
      ))}
    </svg>
  )
}

export default function MoonPhaseCalendar() {
  const [s, set, reset] = useToolState('moon-phase-calendar', DEF)
  const south = s.view === 'south' || (s.view === 'auto' && s.lat < 0)
  const fmtT = (t: number | null) => (t === null ? '—' : new Intl.DateTimeFormat('en-GB', { timeZone: s.tz, hour: '2-digit', minute: '2-digit' }).format(t))
  const fmtD = (t: number) => new Intl.DateTimeFormat('en-GB', { timeZone: s.tz, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(t)
  const localDate = (t: number) => {
    const d = new Date(t + tzOffset(t, s.tz) * 60000)
    return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate() }
  }

  const nDays = new Date(Date.UTC(s.year, s.month + 1, 0)).getUTCDate()
  const days = useMemo(() => Array.from({ length: nDays }, (_, i) => {
    const start = localMidnight(s.year, s.month, i + 1, s.tz)
    return { d: i + 1, start, ...moonDay(start, s.lat, s.lon) }
  }), [s.year, s.month, s.tz, s.lat, s.lon, nDays])
  const monthStart = days[0].start
  const monthEnd = localMidnight(s.year, s.month + 1, 1, s.tz)
  const events = useMemo(() => phaseEvents(monthStart, monthEnd), [monthStart, monthEnd])
  const yearEvents = useMemo(() => phaseEvents(localMidnight(s.year, 0, 1, s.tz), localMidnight(s.year + 1, 0, 1, s.tz)), [s.year, s.tz])
  const evByDay = new Map<number, PhaseEvent>()
  for (const e of events) evByDay.set(localDate(e.t).d, e)

  const sel = days[Math.min(s.sel, nDays) - 1]
  const lead = (new Date(Date.UTC(s.year, s.month, 1)).getUTCDay() + (s.weekStart === 'mon' ? 6 : 0)) % 7
  const heads = s.weekStart === 'mon' ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const todayL = localDate(now.getTime())
  const go = (dm: number) => {
    const m = s.month + dm
    set({ year: s.year + Math.floor(m / 12), month: ((m % 12) + 12) % 12, sel: 1 })
  }

  // full moon names, blue moons and supermoons for the year table
  const fullCount = new Map<string, number>()
  const yearRows = yearEvents.map((e) => {
    const ld = localDate(e.t)
    let note = ''
    if (e.q === 2) {
      const key = `${ld.y}-${ld.m}`
      const n = (fullCount.get(key) ?? 0) + 1
      fullCount.set(key, n)
      const dist = moonDay(localMidnight(ld.y, ld.m, ld.d, s.tz), s.lat, s.lon, false).distKm
      note = [n === 2 ? 'Blue Moon' : fullMoonName(ld.m), isSuper(dist) ? 'supermoon' : ''].filter(Boolean).join(' · ')
    }
    return { e, note }
  })
  const nextFull = yearEvents.concat(phaseEvents(localMidnight(s.year + 1, 0, 1, s.tz), localMidnight(s.year + 1, 1, 15, s.tz))).find((e) => e.q === 2 && e.t > sel.start)

  const ics = () => {
    const stamp = (t: number) => new Date(t).toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')
    const body = yearRows.map(({ e, note }) => `BEGIN:VEVENT\r\nUID:moon-${e.t}@browser-toolbox\r\nDTSTAMP:${stamp(Date.now())}\r\nDTSTART:${stamp(e.t)}\r\nDTEND:${stamp(e.t + 3600000)}\r\nSUMMARY:${ICON[e.q]} ${PHASE_NAMES[e.q]}${note ? ` (${note})` : ''}\r\nEND:VEVENT`).join('\r\n')
    download(`moon-phases-${s.year}.ics`, `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Browser Toolbox//Moon Phase Calendar//EN\r\n${body}\r\nEND:VCALENDAR\r\n`, 'text/calendar')
  }

  return (
    <Split wide="right">
      <div>
        <Panel title="Location" actions={<Btn kind="ghost" onClick={reset}>Today</Btn>}>
          <Select label="City" value={s.place} onChange={(place) => { const c = CITIES.find((x) => x[0] === place); if (c) set({ place, lat: c[1], lon: c[2], tz: c[3] }) }} options={[...CITIES.map((c) => c[0]), ...(CITIES.some((c) => c[0] === s.place) ? [] : [s.place])]} />
          <Row>
            <Num label="Latitude" value={s.lat} onChange={(lat) => set({ lat, place: 'Custom' })} min={-90} max={90} unit="°" />
            <Num label="Longitude" value={s.lon} onChange={(lon) => set({ lon, place: 'Custom' })} min={-180} max={180} unit="°E" />
          </Row>
          <Row>
            <Select label="Time zone" value={s.tz} onChange={(tz) => set({ tz })} options={[...new Set([s.tz, browserTz, 'UTC', ...CITIES.map((c) => c[3])])]} />
            <Btn onClick={() => navigator.geolocation?.getCurrentPosition((p) => set({ lat: Math.round(p.coords.latitude * 1e4) / 1e4, lon: Math.round(p.coords.longitude * 1e4) / 1e4, tz: browserTz, place: 'My location' }))}>📍 Use my location</Btn>
          </Row>
          <div className="k-field"><span className="k-label">Moon drawn as seen from the</span>
            <Seg value={s.view} onChange={(view) => set({ view })} options={[['auto', 'Auto'], ['north', 'Northern hemisphere'], ['south', 'Southern']]} />
          </div>
        </Panel>
        <Panel title={fmtD(sel.start + 12 * 3600000)}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <Moon ang={sel.ang} size={150} south={south} />
            <div>
              <b style={{ fontSize: 20 }}>{sel.name}</b>
              <div className="muted">{(sel.frac * 100).toFixed(1)}% illuminated · {sel.waxing ? 'waxing' : 'waning'}</div>
              <div className="muted">Age {sel.age.toFixed(1)} days of {SYNODIC.toFixed(2)}</div>
              <div className="muted">{Math.round(sel.distKm).toLocaleString('en-US')} km away</div>
            </div>
          </div>
          <Stats>
            <Stat label="Moonrise" value={fmtT(sel.rise)} />
            <Stat label="Moonset" value={fmtT(sel.set)} />
            <Stat label="Sunrise / sunset" value={`${fmtT(sel.sunrise)} / ${fmtT(sel.sunset)}`} />
            <Stat label="Moonless dark sky" value={`${sel.darkNoMoon.toFixed(1)} h`} sub="tonight, Sun below −18°" tone={sel.darkNoMoon > 4 ? 'good' : undefined} />
          </Stats>
          {nextFull && <p className="k-hint">Next full moon: {fmtD(nextFull.t)} {fmtT(nextFull.t)} ({((nextFull.t - sel.start) / 86400000).toFixed(1)} days).</p>}
        </Panel>
      </div>
      <div>
        <Panel title={`${MONTHS[s.month]} ${s.year}`} actions={<>
          <Btn onClick={() => go(-1)}>‹</Btn>
          <Btn kind="ghost" onClick={() => set({ year: now.getFullYear(), month: now.getMonth(), sel: now.getDate() })}>Today</Btn>
          <Btn onClick={() => go(1)}>›</Btn>
        </>}>
          <Row>
            <Seg value={s.weekStart} onChange={(weekStart) => set({ weekStart })} options={[['mon', 'Mon first'], ['sun', 'Sun first']]} />
            <span className="muted">{events.map((e) => `${ICON[e.q]} ${localDate(e.t).d}`).join('  ')}</span>
          </Row>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 4, marginTop: 8 }}>
            {heads.map((h) => <div key={h} className="muted" style={{ textAlign: 'center', fontSize: 12, fontWeight: 600 }}>{h}</div>)}
            {Array.from({ length: lead }, (_, i) => <div key={`e${i}`} />)}
            {days.map((d) => {
              const ev = evByDay.get(d.d)
              const isToday = todayL.y === s.year && todayL.m === s.month && todayL.d === d.d
              const on = d.d === sel.d
              return (
                <button key={d.d} type="button" onClick={() => set({ sel: d.d })} title={`${d.name} · ${(d.frac * 100).toFixed(0)}%`}
                  style={{ border: `1.5px solid ${on ? 'var(--accent)' : isToday ? 'var(--muted)' : 'var(--line)'}`, background: on ? 'color-mix(in srgb, var(--accent) 12%, var(--panel))' : 'var(--panel)', color: 'inherit', borderRadius: 10, padding: '4px 2px 6px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minWidth: 0 }}>
                  <span style={{ alignSelf: 'flex-start', fontSize: 12, fontWeight: isToday ? 800 : 600, paddingLeft: 4 }}>{d.d}</span>
                  <Moon ang={d.ang} size={34} south={south} />
                  <span style={{ fontSize: 11 }} className="muted">{Math.round(d.frac * 100)}%</span>
                  {ev && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', whiteSpace: 'nowrap', overflow: 'hidden', maxWidth: '100%' }}>{ICON[ev.q]} {fmtT(ev.t)}</span>}
                </button>
              )
            })}
          </div>
        </Panel>
        <Panel title="Illumination this month">
          <LineChart series={[{ name: 'Illuminated %', points: days.map((d) => [d.d, Math.round(d.frac * 1000) / 10]), area: true, color: '#eab308' }]} height={180} yMin={0} yMax={100} fx={(v) => String(v)} fy={(v) => `${v}%`} xLabel="Day of month" />
        </Panel>
        <Panel title={`Principal phases ${s.year}`} actions={<>
          <Btn onClick={() => set({ year: s.year - 1 })}>‹</Btn><Btn onClick={() => set({ year: s.year + 1 })}>›</Btn>
          <Btn onClick={ics}>📅 .ics</Btn>
          <CsvButton name={`moon-phases-${s.year}.csv`} rows={() => [['Phase', 'UTC', `Local (${s.tz})`, 'Note'], ...yearRows.map(({ e, note }) => [PHASE_NAMES[e.q], new Date(e.t).toISOString().slice(0, 16).replace('T', ' '), `${fmtD(e.t)} ${fmtT(e.t)}`, note])]} />
        </>}>
          <Table max={60} head={['', 'Phase', 'Date', 'Time', 'Note']} rows={yearRows.filter(({ e }) => e.q === 0 || e.q === 2).map(({ e, note }) => [ICON[e.q], PHASE_NAMES[e.q], fmtD(e.t), fmtT(e.t), note])} />
          <Note>Times use a compact lunar theory (main terms of Meeus ch. 47) and are typically within a few minutes of published almanac values. Rise and set refer to the Moon's upper limb with standard refraction; full-moon names are traditional North American folklore names. The CSV and calendar file include the quarters too.</Note>
        </Panel>
      </div>
    </Split>
  )
}
