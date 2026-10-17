import { useRef, useState } from 'react'
import { Btn, color, download, JsonButtons, Note, num, Num, Panel, Row, Seg, Split, Stat, Stats, Txt, uid, useToolState } from '../kit'
import { haversine, hhmm, ics, MODES, parseCoords, timeline, type Leg, type Mode, type Stop } from './lib/itinerary-planner'

interface Day { id: string; title: string; stops: Stop[] }
interface State { title: string; start: string; mode: Mode; dayStart: number; days: Day[] }

const S = (name: string, lat: number, lon: number, stay: number, note = ''): Stop => ({ id: uid(), name, lat, lon, stay, note })
const DEF: State = {
  title: 'Rome long weekend',
  start: '2026-05-14',
  mode: 'walk',
  dayStart: 540,
  days: [
    { id: 'd1', title: 'Ancient Rome', stops: [S('Colosseum', 41.8902, 12.4922, 120, 'Book the 9:00 slot'), S('Roman Forum & Palatine', 41.8925, 12.4853, 90), S('Pantheon', 41.8986, 12.4769, 45), S('Trevi Fountain', 41.9009, 12.4833, 30, 'Gelato nearby'), S('Spanish Steps', 41.906, 12.4828, 30)] },
    { id: 'd2', title: 'Vatican & Trastevere', stops: [S('Vatican Museums', 41.9065, 12.4536, 180, 'Sistine Chapel'), S("St. Peter's Basilica", 41.9022, 12.4539, 90), S("Castel Sant'Angelo", 41.9031, 12.4663, 60), S('Piazza Navona', 41.8992, 12.4731, 45), S('Dinner in Trastevere', 41.8897, 12.47, 90)] },
    { id: 'd3', title: 'Villas & markets', stops: [S('Galleria Borghese', 41.9142, 12.4923, 120, 'Timed tickets'), S('Piazza del Popolo', 41.9107, 12.4763, 30), S("Campo de' Fiori market", 41.8956, 12.4722, 60)] },
  ],
}

const IN = { border: '1px solid transparent', background: 'transparent', color: 'inherit', font: 'inherit', padding: '2px 4px', borderRadius: 6 } as const
const MODE_OPTS = (Object.keys(MODES) as Mode[]).map((m) => [m, MODES[m].label] as [Mode, string])
const dateOf = (start: string, i: number) => new Date(Date.parse(`${start}T00:00:00Z`) + i * 864e5).toISOString().slice(0, 10)
const nice = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })

function MapView({ days, legs, focus }: { days: Day[]; legs: Leg[][]; focus: number }) {
  const all = days.flatMap((d) => d.stops)
  if (!all.length) return <div className="k-chart empty">Add stops to see the map</div>
  const W = 640, H = 420, P = 34
  const lats = all.map((s) => s.lat), lons = all.map((s) => s.lon)
  const mid = ((Math.min(...lats) + Math.max(...lats)) / 2) * (Math.PI / 180)
  const kx = Math.cos(mid)
  const x0 = Math.min(...lons) * kx, x1 = Math.max(...lons) * kx, y0 = Math.min(...lats), y1 = Math.max(...lats)
  const sc = Math.min((W - 2 * P) / (x1 - x0 || 0.01), (H - 2 * P) / (y1 - y0 || 0.01))
  const ox = (W - (x1 - x0) * sc) / 2, oy = (H - (y1 - y0) * sc) / 2
  const px = (s: Stop) => ox + (s.lon * kx - x0) * sc
  const py = (s: Stop) => H - oy - (s.lat - y0) * sc
  const kmPerPx = 111.32 / sc
  const bar = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000].find((k) => k / kmPerPx > 70) ?? 1000
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block', background: 'color-mix(in srgb, var(--accent) 5%, var(--panel))', borderRadius: 10 }} role="img" aria-label="Itinerary map">
      {Array.from({ length: 9 }, (_, i) => <line key={`v${i}`} x1={(i * W) / 8} x2={(i * W) / 8} y1={0} y2={H} stroke="var(--line)" strokeWidth={0.6} />)}
      {Array.from({ length: 7 }, (_, i) => <line key={`h${i}`} y1={(i * H) / 6} y2={(i * H) / 6} x1={0} x2={W} stroke="var(--line)" strokeWidth={0.6} />)}
      {days.map((d, di) => (
        <g key={d.id} opacity={focus < 0 || focus === di ? 1 : 0.18}>
          <polyline points={d.stops.map((s) => `${px(s)},${py(s)}`).join(' ')} fill="none" stroke={color(di)} strokeWidth={3} strokeDasharray="7 5" strokeLinejoin="round" />
          {d.stops.map((s, i) => (
            <g key={s.id}>
              <circle cx={px(s)} cy={py(s)} r={11} fill={color(di)} stroke="#fff" strokeWidth={2} />
              <text x={px(s)} y={py(s) + 4} textAnchor="middle" fontSize={11} fontWeight={700} fill="#fff">{i + 1}</text>
              {(focus === di || (focus < 0 && all.length <= 16)) && <text x={px(s) + 14} y={py(s) + 4} fontSize={11} fill="var(--fg)" style={{ paintOrder: 'stroke', stroke: 'var(--panel)', strokeWidth: 3 }}>{s.name}</text>}
              <title>{`Day ${di + 1} · ${i + 1}. ${s.name} — arrive ${hhmm(legs[di][i].arrive)}`}</title>
            </g>
          ))}
        </g>
      ))}
      <g transform={`translate(${W - 20 - bar / kmPerPx},${H - 18})`}>
        <rect width={bar / kmPerPx} height={5} fill="var(--fg)" />
        <text y={-5} fontSize={11} fill="var(--fg)">{bar < 1 ? `${bar * 1000} m` : `${bar} km`}</text>
      </g>
      <text x={8} y={H - 8} fontSize={10} fill="var(--muted)">N ↑ · schematic, straight lines</text>
    </svg>
  )
}

export default function ItineraryPlanner() {
  const [s, set, reset] = useToolState('itinerary-planner', DEF)
  const [focus, setFocus] = useState(-1)
  const [draft, setDraft] = useState({ name: '', where: '', stay: 60 })
  const drag = useRef<{ d: number; i: number } | null>(null)
  const mapRef = useRef<HTMLDivElement>(null)
  const legs = s.days.map((d) => timeline(d.stops, s.dayStart, s.mode))
  const totalKm = legs.flat().reduce((a, l) => a + l.km, 0)
  const totalTravel = legs.flat().reduce((a, l) => a + l.travel, 0)
  const nStops = legs.flat().length
  const target = focus >= 0 && focus < s.days.length ? focus : s.days.length - 1
  const coords = parseCoords(draft.where)

  const setDays = (days: Day[]) => set({ days })
  const editStop = (d: number, id: string, p: Partial<Stop>) => setDays(s.days.map((x, i) => (i === d ? { ...x, stops: x.stops.map((st) => (st.id === id ? { ...st, ...p } : st)) } : x)))
  const move = (from: { d: number; i: number }, to: { d: number; i: number }) => {
    const days = s.days.map((x) => ({ ...x, stops: [...x.stops] }))
    const [st] = days[from.d].stops.splice(from.i, 1)
    if (!st) return
    days[to.d].stops.splice(Math.min(to.i, days[to.d].stops.length), 0, st)
    setDays(days)
  }
  const addStop = () => {
    if (!coords || !draft.name.trim() || target < 0) return
    setDays(s.days.map((x, i) => (i === target ? { ...x, stops: [...x.stops, { id: uid(), name: draft.name.trim(), ...coords, stay: Math.max(0, draft.stay), note: '' }] } : x)))
    setDraft({ name: '', where: '', stay: 60 })
  }
  const print = () => {
    const w = window.open('', '_blank')
    if (!w) return
    const body = s.days.map((d, di) => `<h2>Day ${di + 1} · ${nice(dateOf(s.start, di))} — ${d.title}</h2><table>${legs[di].map((l, i) => `<tr><td>${hhmm(l.arrive)}–${hhmm(l.depart)}</td><td><b>${i + 1}. ${l.stop.name}</b>${l.stop.note ? `<br><i>${l.stop.note}</i>` : ''}</td><td>${i ? `${l.travel} min · ${l.km.toFixed(1)} km` : 'start'}</td></tr>`).join('')}</table>`).join('')
    w.document.write(`<!doctype html><title>${s.title}</title><style>body{font:14px system-ui;margin:24px;color:#111}table{border-collapse:collapse;width:100%}td{border-bottom:1px solid #ccc;padding:6px;vertical-align:top}svg{max-width:640px;width:100%}</style><h1>${s.title}</h1>${mapRef.current?.innerHTML ?? ''}${body}`)
    w.document.close()
    w.focus()
    w.print()
  }

  return (
    <Split wide="right">
      <div>
        <Panel title="Trip">
          <Txt label="Trip name" value={s.title} onChange={(title) => set({ title })} />
          <Row>
            <Txt label="First day" type="date" value={s.start} onChange={(start) => start && set({ start })} />
            <Txt label="Day starts at" type="time" value={hhmm(s.dayStart)} onChange={(v) => { const [h, m] = v.split(':').map(Number); if (Number.isFinite(h)) set({ dayStart: h * 60 + (m || 0) }) }} />
          </Row>
          <div className="k-field">
            <span className="k-label">Getting around</span>
            <Seg value={s.mode} onChange={(mode) => set({ mode })} options={MODE_OPTS} />
          </div>
        </Panel>
        <Panel title={`Add a stop to day ${target + 1}`}>
          <Txt label="Place" value={draft.name} onChange={(name) => setDraft({ ...draft, name })} placeholder="e.g. Museum of Modern Art" />
          <Txt label="Coordinates or map link" value={draft.where} onChange={(where) => setDraft({ ...draft, where })} placeholder="41.8902, 12.4922 or a Google/OSM map URL" hint={draft.where ? (coords ? `✓ ${coords.lat}, ${coords.lon}` : '✗ could not read coordinates') : 'Right-click a spot in Google Maps / OSM to copy its coordinates'} />
          <Num label="Time there" value={draft.stay} onChange={(stay) => setDraft({ ...draft, stay })} unit="min" min={0} step={15} />
          <Btn kind="primary" disabled={!coords || !draft.name.trim()} onClick={addStop}>+ Add stop</Btn>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Days" value={s.days.length} sub={`${nice(s.start)} → ${nice(dateOf(s.start, Math.max(0, s.days.length - 1)))}`} />
          <Stat label="Stops" value={nStops} />
          <Stat label="Distance" value={`${num(totalKm, 1)} km`} sub="straight-line" />
          <Stat label="Travel time" value={`${Math.floor(totalTravel / 60)}h ${totalTravel % 60}m`} sub={MODES[s.mode].label.toLowerCase()} tone="accent" />
        </Stats>
        <Panel title="Map" actions={<Seg value={String(focus)} onChange={(v) => setFocus(Number(v))} options={[['-1', 'All'], ...s.days.map((_, i) => [String(i), `D${i + 1}`] as [string, string])]} />}>
          <div ref={mapRef}><MapView days={s.days} legs={legs} focus={focus} /></div>
        </Panel>
        <Panel
          title="Day by day"
          actions={
            <>
              <Btn onClick={() => setDays([...s.days, { id: uid(), title: 'New day', stops: [] }])}>+ Day</Btn>
              <Btn onClick={() => download(`${s.title || 'trip'}.ics`, ics(s.title, s.start, legs), 'text/calendar')}>📅 ICS</Btn>
              <Btn onClick={print}>🖨 Print</Btn>
              <JsonButtons name="itinerary.json" data={s} onLoad={(d) => set(d)} />
              <Btn kind="ghost" onClick={reset}>Reset</Btn>
            </>
          }
        >
          {s.days.map((d, di) => {
            const L = legs[di]
            const end = L.length ? L[L.length - 1].depart : s.dayStart
            return (
              <div key={d.id} style={{ borderLeft: `4px solid ${color(di)}`, paddingLeft: 12, marginBottom: 18 }} onDragOver={(e) => e.preventDefault()} onDrop={() => { if (drag.current) move(drag.current, { d: di, i: d.stops.length }); drag.current = null }}>
                <Row wrap={false}>
                  <b style={{ whiteSpace: 'nowrap', cursor: 'pointer' }} onClick={() => setFocus(di)}>Day {di + 1} · {nice(dateOf(s.start, di))}</b>
                  <input value={d.title} onChange={(e) => setDays(s.days.map((x, i) => (i === di ? { ...x, title: e.target.value } : x)))} aria-label="Day title" style={{ ...IN, flex: 1, minWidth: 0, borderColor: 'var(--line)' }} />
                  <span className="muted" style={{ whiteSpace: 'nowrap', fontSize: 13 }}>{hhmm(s.dayStart)}–{hhmm(end)}</span>
                  <Btn kind="ghost" title="Remove day" onClick={() => { setDays(s.days.filter((_, i) => i !== di)); setFocus(-1) }}>✕</Btn>
                </Row>
                {end > 22 * 60 && <Note tone="warn">This day runs past 22:00 — move a stop to another day.</Note>}
                {d.stops.length === 0 && <p className="muted">Drop stops here or add one on the left.</p>}
                {L.map((l, i) => (
                  <div key={l.stop.id}>
                    {i > 0 && <div className="muted" style={{ fontSize: 12, padding: '2px 0 2px 26px' }}>↓ {l.travel} min · {l.km.toFixed(1)} km</div>}
                    <div
                      draggable
                      onDragStart={() => (drag.current = { d: di, i })}
                      onDrop={(e) => { e.stopPropagation(); if (drag.current) move(drag.current, { d: di, i }); drag.current = null }}
                      onDragOver={(e) => e.preventDefault()}
                      style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 8px', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--panel)', cursor: 'grab', flexWrap: 'wrap' }}
                    >
                      <span style={{ width: 22, height: 22, borderRadius: 11, background: color(di), color: '#fff', fontSize: 12, fontWeight: 700, display: 'grid', placeItems: 'center', flex: 'none' }}>{i + 1}</span>
                      <b style={{ fontVariantNumeric: 'tabular-nums', fontSize: 13, whiteSpace: 'nowrap' }}>{hhmm(l.arrive)}–{hhmm(l.depart)}</b>
                      <span style={{ flex: 1, minWidth: 140 }}>
                        <input value={l.stop.name} onChange={(e) => editStop(di, l.stop.id, { name: e.target.value })} aria-label="Stop name" style={{ ...IN, width: '100%', fontWeight: 600 }} />
                        <input value={l.stop.note ?? ''} placeholder="note…" onChange={(e) => editStop(di, l.stop.id, { note: e.target.value })} aria-label="Note" style={{ ...IN, width: '100%', fontSize: 12 }} />
                      </span>
                      <span style={{ whiteSpace: 'nowrap', fontSize: 13 }}>
                        <input type="number" min={0} step={15} value={l.stop.stay} onChange={(e) => editStop(di, l.stop.id, { stay: Math.max(0, Number(e.target.value) || 0) })} style={{ ...IN, width: 58, borderColor: 'var(--line)' }} aria-label="Minutes" /> min
                      </span>
                      <a href={`https://www.openstreetmap.org/?mlat=${l.stop.lat}&mlon=${l.stop.lon}#map=17/${l.stop.lat}/${l.stop.lon}`} target="_blank" rel="noreferrer" title="Open in OpenStreetMap">🗺</a>
                      <Btn kind="ghost" title="Move up" disabled={i === 0} onClick={() => move({ d: di, i }, { d: di, i: i - 1 })}>↑</Btn>
                      <Btn kind="ghost" title="Move down" disabled={i === L.length - 1} onClick={() => move({ d: di, i }, { d: di, i: i + 1 })}>↓</Btn>
                      <Btn kind="ghost" title="Remove" onClick={() => setDays(s.days.map((x, k) => (k === di ? { ...x, stops: x.stops.filter((st) => st.id !== l.stop.id) } : x)))}>✕</Btn>
                    </div>
                  </div>
                ))}
              </div>
            )
          })}
          <p className="muted" style={{ fontSize: 13 }}>
            Drag stops to reorder or move them between days. Travel times use straight-line distance × {MODES[s.mode].detour} detour at {MODES[s.mode].kmh} km/h
            {MODES[s.mode].overhead ? ` + ${MODES[s.mode].overhead} min waiting/parking` : ''}, rounded up to 5 min. Longest hop: {num(Math.max(0, ...legs.flat().map((l) => l.km)), 1)} km
            {s.days.length > 1 ? `; days ${s.days.map((_, i) => i + 1).join('/')} span ${s.days.map((d) => num(d.stops.reduce((a, st, i) => a + (i ? haversine(d.stops[i - 1], st) : 0), 0), 1)).join('/')} km` : ''}.
          </p>
        </Panel>
      </div>
    </Split>
  )
}
