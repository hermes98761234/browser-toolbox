import { useEffect, useMemo, useRef, useState } from 'react'
import { Btn, CopyButton, Note, Num, Panel, Row, Select, Split, Stat, Stats, Txt, shareLink, uid, useToolState } from '../kit'
import { band, bestSlots, fmtOffset, isWeekend, local, midnight, offset } from './lib/time-zone-planner'

interface City { id: string; label: string; zone: string; start: number; end: number }
interface State { date: string; start: number; len: number; cities: City[] }

/** Next weekday (today if it is one). */
function nextWeekday(): string {
  const d = new Date()
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const DEF: State = {
  date: nextWeekday(),
  start: 30,
  len: 2,
  cities: [
    { id: 'ny', label: 'New York', zone: 'America/New_York', start: 9, end: 17 },
    { id: 'ldn', label: 'London', zone: 'Europe/London', start: 9, end: 17 },
    { id: 'kyiv', label: 'Kyiv', zone: 'Europe/Kyiv', start: 9, end: 18 },
    { id: 'blr', label: 'Bengaluru', zone: 'Asia/Kolkata', start: 10, end: 19 },
    { id: 'tyo', label: 'Tokyo', zone: 'Asia/Tokyo', start: 9, end: 18 },
  ],
}

// Friendly names for zones whose IANA id doesn't name the city people search for.
const ALIAS: [string, string][] = [
  ['San Francisco', 'America/Los_Angeles'], ['Seattle', 'America/Los_Angeles'], ['Boston', 'America/New_York'], ['Washington DC', 'America/New_York'], ['Miami', 'America/New_York'],
  ['Austin', 'America/Chicago'], ['Dallas', 'America/Chicago'], ['Denver', 'America/Denver'], ['Bengaluru', 'Asia/Kolkata'], ['Mumbai', 'Asia/Kolkata'], ['Delhi', 'Asia/Kolkata'],
  ['Beijing', 'Asia/Shanghai'], ['Shenzhen', 'Asia/Shanghai'], ['Sydney', 'Australia/Sydney'], ['Auckland', 'Pacific/Auckland'], ['Dubai', 'Asia/Dubai'], ['Lviv', 'Europe/Kyiv'],
  ['Kyiv', 'Europe/Kyiv'], ['São Paulo', 'America/Sao_Paulo'], ['Toronto', 'America/Toronto'], ['Vancouver', 'America/Vancouver'], ['Berlin', 'Europe/Berlin'], ['Munich', 'Europe/Berlin'],
  ['Zurich', 'Europe/Zurich'], ['Tel Aviv', 'Asia/Jerusalem'], ['Ho Chi Minh City', 'Asia/Ho_Chi_Minh'], ['Manila', 'Asia/Manila'], ['Lagos', 'Africa/Lagos'], ['Nairobi', 'Africa/Nairobi'],
]
const ZONES: string[] = (() => {
  try {
    return (Intl as unknown as { supportedValuesOf(k: string): string[] }).supportedValuesOf('timeZone')
  } catch {
    return [...new Set(ALIAS.map((a) => a[1]))]
  }
})()
const nice = (z: string) => z.split('/').pop()!.replace(/_/g, ' ')
const BG = ['color-mix(in srgb, var(--muted) 22%, var(--panel))', 'color-mix(in srgb, var(--warn) 22%, var(--panel))', 'color-mix(in srgb, var(--ok) 35%, var(--panel))']
const hm = (h: number, m: number) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`

export default function TimeZonePlanner() {
  const [s, set, reset] = useToolState('time-zone-planner', DEF)
  const [q, setQ] = useState('')
  const [now, setNow] = useState(() => Date.now())
  const dragging = useRef(false)
  const area = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(iv)
  }, [])

  const home = s.cities[0]
  const t0 = home ? midnight(s.date, home.zone) : 0
  const slot = (i: number) => t0 + i * 30 * 60000
  const meetStart = slot(s.start)
  const meetEnd = slot(s.start + s.len)
  const best = useMemo(() => (home ? bestSlots(t0, 48, 30, s.len, s.cities) : []), [t0, s.len, s.cities, home])
  const allWork = best.filter((b) => b.allWork)
  const nowPos = (now - t0) / (48 * 30 * 60000)

  const matches = q.trim().length < 2 ? [] : [
    ...ALIAS.filter(([n]) => n.toLowerCase().includes(q.toLowerCase())).map(([n, z]) => [n, z] as [string, string]),
    ...ZONES.filter((z) => z.toLowerCase().replace(/_/g, ' ').includes(q.toLowerCase())).map((z) => [nice(z), z] as [string, string]),
  ].slice(0, 8)

  const fromX = (clientX: number) => {
    const r = area.current!.getBoundingClientRect()
    const i = Math.floor(((clientX - r.left) / r.width) * 48)
    set({ start: Math.max(0, Math.min(48 - s.len, i)) })
  }
  const move = (id: string, d: number) => {
    const i = s.cities.findIndex((c) => c.id === id)
    const j = i + d
    if (j < 0 || j >= s.cities.length) return
    const c = [...s.cities]
    ;[c[i], c[j]] = [c[j], c[i]]
    set({ cities: c })
  }
  const invite = () =>
    `Meeting (${s.len * 30} min)\n` +
    s.cities.map((c) => {
      const a = local(meetStart, c.zone), b = local(meetEnd, c.zone)
      return `${c.label}: ${a.wd} ${a.d}/${a.mo} ${hm(a.h, a.mi)}–${hm(b.h, b.mi)} (${fmtOffset(offset(meetStart, c.zone))})`
    }).join('\n')

  return (
    <Split wide="right">
      <div>
        <Panel title="Meeting" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Txt label={`Date (${home?.label ?? 'home'} time)`} type="date" value={s.date} onChange={(date) => date && set({ date })} />
          <Select label="Duration" value={s.len} onChange={(len) => set({ len, start: Math.min(s.start, 48 - len) })} options={[1, 2, 3, 4, 6, 8].map((n) => [n, n === 1 ? '30 min' : `${n / 2} h`] as [number, string])} />
          <label className="k-field">
            <span className="k-label">Start <b className="k-val">{home ? hm(local(meetStart, home.zone).h, local(meetStart, home.zone).mi) : ''}</b> {home?.label}</span>
            <input type="range" min={0} max={48 - s.len} value={s.start} onChange={(e) => set({ start: Number(e.target.value) })} />
          </label>
          <Row>
            <CopyButton text={invite} label="Copy times" />
            <CopyButton text={() => shareLink(s)} label="Share link" />
          </Row>
        </Panel>
        <Panel title="Best times">
          {allWork.length ? <Note tone="ok">{allWork.length} start time(s) fall inside everyone's working hours.</Note> : <Note tone="warn">No slot fits everyone's working hours — the best compromises are listed.</Note>}
          {best.slice(0, 6).map((b) => (
            <button key={b.i} className="k-btn" style={{ width: '100%', marginBottom: 4, display: 'flex', justifyContent: 'space-between' }} onClick={() => set({ start: b.i })}>
              <span>{home && (() => { const l = local(slot(b.i), home.zone); return `${hm(l.h, l.mi)} ${home.label}` })()}</span>
              <span>{'★'.repeat(Math.round((b.score / (2 * s.cities.length)) * 5))}<span className="muted">{'★'.repeat(5 - Math.round((b.score / (2 * s.cities.length)) * 5))}</span></span>
            </button>
          ))}
        </Panel>
        <Panel title="Add a city or time zone">
          <Txt label="Search" value={q} onChange={setQ} placeholder="e.g. Berlin, Sydney, Chicago" />
          {matches.map(([n, z]) => (
            <button key={n + z} className="k-btn ghost" style={{ width: '100%', justifyContent: 'space-between', display: 'flex' }} onClick={() => { set({ cities: [...s.cities, { id: uid(), label: n, zone: z, start: 9, end: 17 }] }); setQ('') }}>
              <span>+ {n}</span><span className="muted">{z} · {fmtOffset(offset(now, z))}</span>
            </button>
          ))}
        </Panel>
      </div>

      <div>
        <Stats>
          <Stat label="Cities" value={s.cities.length} />
          <Stat label="Time spread" value={s.cities.length ? `${(Math.max(...s.cities.map((c) => offset(meetStart, c.zone))) - Math.min(...s.cities.map((c) => offset(meetStart, c.zone)))) / 60} h` : '—'} />
          <Stat label="Overlap starts" value={allWork.length ? allWork.length : 'none'} tone={allWork.length ? 'good' : 'bad'} sub="in working hours" />
          <Stat label="Selected" value={home ? hm(local(meetStart, home.zone).h, local(meetStart, home.zone).mi) : '—'} sub={`${s.len * 30} min`} tone="accent" />
        </Stats>
        <Panel title="Day grid" actions={<span className="muted" style={{ fontSize: 13 }}>Drag on the grid to move the meeting</span>}>
          <div style={{ overflowX: 'auto' }}>
            <div style={{ minWidth: 640 }}>
              {s.cities.map((c, ci) => {
                const off = offset(meetStart, c.zone)
                const nl = local(now, c.zone)
                return (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'stretch', marginBottom: 4 }}>
                    <div style={{ width: 150, flex: 'none', paddingRight: 8, fontSize: 13 }}>
                      <b>{ci === 0 ? '🏠 ' : ''}{c.label}</b>
                      <div className="muted" style={{ fontSize: 11 }}>{fmtOffset(off)} · now {hm(nl.h, nl.mi)}</div>
                    </div>
                    <div
                      ref={ci === 0 ? area : undefined}
                      style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(24, minmax(0, 1fr))', gap: 1, position: 'relative', touchAction: 'none', cursor: 'pointer' }}
                      onPointerDown={(e) => { dragging.current = true; (e.target as HTMLElement).setPointerCapture?.(e.pointerId); fromX(e.clientX) }}
                      onPointerMove={(e) => dragging.current && fromX(e.clientX)}
                      onPointerUp={() => { dragging.current = false }}
                    >
                      {Array.from({ length: 24 }, (_, h) => {
                        const l = local(slot(h * 2), c.zone)
                        const bd = band(l.h + l.mi / 60, c.start, c.end, isWeekend(l.wd))
                        const newDay = l.h === 0
                        return (
                          <div key={h} title={`${l.wd} ${hm(l.h, l.mi)}`} style={{ background: BG[bd], fontSize: l.mi || newDay ? 9 : 11, overflow: 'hidden', textAlign: 'center', padding: '6px 0', borderRadius: 3, fontWeight: bd === 2 ? 700 : 400, borderLeft: newDay ? '2px solid var(--accent)' : undefined }}>
                            {newDay ? l.wd : l.mi ? `${l.h}½` : l.h}
                          </div>
                        )
                      })}
                      {ci === 0 && nowPos >= 0 && nowPos <= 1 && <div style={{ position: 'absolute', top: -2, bottom: -2, left: `${nowPos * 100}%`, width: 2, background: 'var(--err)' }} title="now" />}
                      <div style={{ position: 'absolute', top: -2, bottom: -2, left: `${(s.start / 48) * 100}%`, width: `${(s.len / 48) * 100}%`, border: '2px solid var(--accent)', borderRadius: 4, background: 'color-mix(in srgb, var(--accent) 15%, transparent)', pointerEvents: 'none' }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
          <Row>
            <span className="muted" style={{ fontSize: 12 }}>
              <i style={{ display: 'inline-block', width: 10, height: 10, background: BG[2] }} /> working hours <i style={{ display: 'inline-block', width: 10, height: 10, background: BG[1], marginLeft: 8 }} /> awake <i style={{ display: 'inline-block', width: 10, height: 10, background: BG[0], marginLeft: 8 }} /> night
            </span>
          </Row>
        </Panel>
        <Panel title="Selected meeting in each city">
          {s.cities.map((c, i) => {
            const a = local(meetStart, c.zone), b = local(meetEnd, c.zone)
            const w = Math.min(band(a.h + a.mi / 60, c.start, c.end, isWeekend(a.wd)), band(((b.h + b.mi / 60 - 0.01) + 24) % 24, c.start, c.end, isWeekend(b.wd)))
            return (
              <div key={c.id} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
                <span style={{ fontSize: 18 }}>{['🌙', '☕', '✅'][w]}</span>
                <b style={{ minWidth: 110 }}>{c.label}</b>
                <span style={{ flex: 1, minWidth: 140 }}>{a.wd} {hm(a.h, a.mi)} – {hm(b.h, b.mi)}</span>
                <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <span className="muted" style={{ fontSize: 12 }}>work</span>
                  <span style={{ width: 64 }}><Num label="" value={c.start} min={0} max={23} onChange={(v) => set({ cities: s.cities.map((x) => (x.id === c.id ? { ...x, start: v } : x)) })} /></span>
                  <span style={{ width: 64 }}><Num label="" value={c.end} min={1} max={24} onChange={(v) => set({ cities: s.cities.map((x) => (x.id === c.id ? { ...x, end: v } : x)) })} /></span>
                  <Btn kind="ghost" title="Move up (top = home)" onClick={() => move(c.id, -1)} disabled={i === 0}>↑</Btn>
                  <Btn kind="ghost" title="Remove" onClick={() => set({ cities: s.cities.filter((x) => x.id !== c.id) })}>✕</Btn>
                </span>
              </div>
            )
          })}
          {!s.cities.length && <Note>Add at least one city.</Note>}
        </Panel>
      </div>
    </Split>
  )
}
