import { useEffect, useRef, useState } from 'react'
import { BarChart, Btn, Check, CsvButton, JsonButtons, money, Note, num, Num, Panel, pct, Row, Seg, Select, Split, Stat, Stats, Table, today, Txt, uid, useToolState } from '../kit'
import type { Fix, LL } from './lib/dog-walk-tracker'
import { claim, odometerIssues, RATE_SETS, type Cat, type Trip } from './lib/mileage-log'
import { demoDrive, groupBy, toUnit, trackDistance } from './lib/trip-mileage-logger'

type Source = 'odometer' | 'gps' | 'manual'
interface LTrip extends Trip { client: string; source: Source; track?: LL[] }

const T = today()
const ago = (d: number) => new Date(Date.parse(T) - d * 86400000).toISOString().slice(0, 10)
const thin = (pts: LL[], n = 80): LL[] => (pts.length <= n ? pts : Array.from({ length: n }, (_, i) => pts[Math.round((i * (pts.length - 1)) / (n - 1))])).map(([a, b]) => [+a.toFixed(5), +b.toFixed(5)])
const demoTrack = thin(trackDistance(demoDrive()).kept.map((f) => [f.lat, f.lon] as LL))
const tr = (d: number, from: string, to: string, purpose: string, client: string, cat: Cat, start: number | null, end: number | null, dist = 0, source: Source = 'odometer', track?: LL[]): LTrip =>
  ({ id: uid(), date: ago(d), vehicle: 'Car', from, to, purpose, client, cat, start, end, dist, round: false, source, track })
const DEF = {
  rate: 'irs2025',
  customRate: 0.3,
  trips: [
    tr(26, 'Office', 'Acme Corp HQ', 'Quarterly review meeting', 'Acme Corp', 'business', 41208, 41241),
    tr(22, 'Office', 'Print shop', 'Pick up brochures', 'Internal', 'business', 41241, 41249),
    tr(19, 'Home', 'Dr. Lee clinic', 'Physiotherapy', '', 'medical', 41302, 41315),
    tr(15, 'Office', 'Beta Labs', 'Site survey', 'Beta Labs', 'business', 41388, 41456),
    tr(12, 'Home', 'Food bank', 'Volunteer delivery', '', 'charity', 41470, 41482),
    tr(8, 'Office', 'Client downtown', 'Workshop', 'Acme Corp', 'business', null, null, 4.2, 'gps', demoTrack),
    tr(5, 'Office', 'Airport', 'Flight to conference', 'Internal', 'business', 41530, 41571),
    tr(2, 'Home', 'Supermarket', 'Groceries', '', 'personal', 41571, 41580),
  ] as LTrip[],
}
const CATS: [Cat, string][] = [['business', 'Business'], ['medical', 'Medical'], ['charity', 'Charity'], ['personal', 'Personal']]
const BLANK = { date: T, vehicle: 'Car', from: '', to: '', purpose: '', client: '', cat: 'business' as Cat, start: 0, end: 0, dist: 0, round: false }

function Route({ pts, h = 120 }: { pts: LL[]; h?: number }) {
  if (pts.length < 2) return null
  const la = pts.map((p) => p[0]), lo = pts.map((p) => p[1])
  const k = Math.cos((la[0] * Math.PI) / 180)
  const x0 = Math.min(...lo) * k, x1 = Math.max(...lo) * k, y0 = Math.min(...la), y1 = Math.max(...la)
  const sc = Math.min(280 / (x1 - x0 || 1e-6), (h - 20) / (y1 - y0 || 1e-6))
  const P = (p: LL) => `${(10 + (p[1] * k - x0) * sc).toFixed(1)},${(h - 10 - (p[0] - y0) * sc).toFixed(1)}`
  return (
    <svg viewBox={`0 0 300 ${h}`} width="100%" style={{ maxWidth: 300, display: 'block', background: 'color-mix(in srgb, var(--accent) 6%, transparent)', borderRadius: 8 }} aria-label="Route">
      <polyline points={pts.map(P).join(' ')} fill="none" stroke="var(--accent)" strokeWidth={3} strokeLinejoin="round" />
      <circle cx={P(pts[0]).split(',')[0]} cy={P(pts[0]).split(',')[1]} r={5} fill="#10b981" />
      <circle cx={P(pts[pts.length - 1]).split(',')[0]} cy={P(pts[pts.length - 1]).split(',')[1]} r={5} fill="#ef4444" />
    </svg>
  )
}

export default function TripMileageLogger() {
  const [s, set, reset] = useToolState('trip-mileage-logger', DEF)
  const [src, setSrc] = useState<Source>('odometer')
  const [f, setF] = useState(BLANK)
  const [rec, setRec] = useState<'idle' | 'gps' | 'demo'>('idle')
  const [live, setLive] = useState<{ metres: number; pts: LL[]; secs: number; acc: number }>({ metres: 0, pts: [], secs: 0, acc: 0 })
  const [err, setErr] = useState('')
  const fixes = useRef<Fix[]>([])
  const rs0 = RATE_SETS.find((r) => r.id === s.rate) ?? RATE_SETS[0]
  const rs = rs0.id === 'custom' ? { ...rs0, business: [{ upTo: null, rate: s.customRate }] } : rs0
  const u = rs.unit
  const m = (x: number) => money(x, rs.currency)

  const lastEnd = Math.max(0, ...s.trips.filter((t) => t.vehicle === f.vehicle && t.end !== null).map((t) => t.end!))
  useEffect(() => {
    if (rec === 'idle') return
    fixes.current = []
    const push = (fx: Fix) => {
      fixes.current.push(fx)
      const r = trackDistance(fixes.current)
      setLive({ metres: r.metres, pts: r.kept.map((k) => [k.lat, k.lon]), secs: (fx.t - fixes.current[0].t) / 1000, acc: fx.acc })
    }
    if (rec === 'demo') {
      const all = demoDrive()
      let i = 0
      const id = setInterval(() => {
        for (let k = 0; k < 12 && i < all.length; k++, i++) push({ ...all[i] })
        if (i >= all.length) { clearInterval(id); setRec('idle') }
      }, 40)
      return () => clearInterval(id)
    }
    const w = navigator.geolocation.watchPosition(
      (p) => push({ lat: p.coords.latitude, lon: p.coords.longitude, t: p.timestamp, acc: p.coords.accuracy }),
      (e) => { setErr(`GPS unavailable: ${e.message}. Try the demo drive or enter the distance.`); setRec('idle') },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 },
    )
    return () => navigator.geolocation.clearWatch(w)
  }, [rec])

  const distNow = src === 'odometer' ? Math.max(0, f.end - f.start) : src === 'gps' ? toUnit(live.metres, u) : f.dist * (f.round ? 2 : 1)
  const odoBad = src === 'odometer' && f.end < f.start
  const save = () => {
    const t: LTrip = { ...f, id: uid(), source: src, start: src === 'odometer' ? f.start : null, end: src === 'odometer' ? f.end : null, dist: src === 'gps' ? +toUnit(live.metres, u).toFixed(2) : f.dist, round: src === 'manual' && f.round, track: src === 'gps' && live.pts.length > 1 ? thin(live.pts) : undefined }
    set({ trips: [...s.trips, t] })
    setF({ ...BLANK, vehicle: f.vehicle, date: f.date, start: src === 'odometer' ? f.end : 0, end: src === 'odometer' ? f.end : 0 })
    setLive({ metres: 0, pts: [], secs: 0, acc: 0 })
  }
  const lines = claim(s.trips, rs)
  const issues = odometerIssues(s.trips)
  const biz = lines.filter((l) => l.trip.cat === 'business')
  const total = lines.reduce((a, l) => a + l.distance, 0)
  const bizDist = biz.reduce((a, l) => a + l.distance, 0)
  const amount = lines.reduce((a, l) => a + l.amount, 0)
  const byMonth = groupBy(lines, (l) => l.trip.date.slice(0, 7), (l) => l.distance, (l) => l.amount)
  const byClient = groupBy(biz, (l) => (l.trip as LTrip).client || '—', (l) => l.distance, (l) => l.amount)

  return (
    <Split>
      <div>
        <Panel title="Log a trip">
          <Seg value={src} onChange={(v) => { setSrc(v); if (v === 'odometer' && f.start === 0) setF({ ...f, start: lastEnd, end: lastEnd }) }} options={[['odometer', '🔢 Odometer'], ['gps', '📍 GPS'], ['manual', '✏️ Distance']]} />
          {src === 'odometer' && (
            <Row>
              <Num label="Start reading" value={f.start} onChange={(start) => setF({ ...f, start })} unit={u} min={0} hint={lastEnd ? `last end for ${f.vehicle}: ${num(lastEnd, 1)}` : undefined} />
              <Num label="End reading" value={f.end} onChange={(end) => setF({ ...f, end })} unit={u} min={0} />
            </Row>
          )}
          {src === 'gps' && (
            <div style={{ margin: '8px 0' }}>
              <Row>
                <Btn kind={rec === 'gps' ? 'danger' : 'primary'} disabled={!navigator.geolocation || rec === 'demo'} onClick={() => { setErr(''); setRec(rec === 'gps' ? 'idle' : 'gps') }}>{rec === 'gps' ? '■ Stop tracking' : '▶ Start GPS tracking'}</Btn>
                <Btn disabled={rec !== 'idle'} onClick={() => setRec('demo')}>Simulate demo drive</Btn>
              </Row>
              <Stats>
                <Stat label="Distance" value={`${num(toUnit(live.metres, u), 2)} ${u}`} tone="accent" />
                <Stat label="Time" value={`${Math.floor(live.secs / 60)}:${String(Math.floor(live.secs % 60)).padStart(2, '0')}`} sub={live.secs > 0 ? `${num(toUnit(live.metres, u) / (live.secs / 3600), 0)} ${u}/h avg` : ''} />
              </Stats>
              <Route pts={live.pts} />
              {err && <Note tone="warn">{err}</Note>}
              <p className="muted" style={{ fontSize: 12 }}>Keep this page open and the screen on while driving (browsers pause GPS in the background). Fixes worse than 50 m and impossible jumps are ignored.</p>
            </div>
          )}
          {src === 'manual' && (
            <Row>
              <Num label="Distance" value={f.dist} onChange={(dist) => setF({ ...f, dist: Math.max(0, dist) })} unit={u} min={0} />
              <Check label="Round trip (×2)" value={f.round} onChange={(round) => setF({ ...f, round })} />
            </Row>
          )}
          <Row>
            <Txt label="Date" type="date" value={f.date} onChange={(date) => setF({ ...f, date })} />
            <Txt label="Vehicle" value={f.vehicle} onChange={(vehicle) => setF({ ...f, vehicle })} />
          </Row>
          <Row>
            <Txt label="From" value={f.from} onChange={(from) => setF({ ...f, from })} placeholder="Office" />
            <Txt label="To" value={f.to} onChange={(to) => setF({ ...f, to })} placeholder="Client site" />
          </Row>
          <Txt label="Business purpose" value={f.purpose} onChange={(purpose) => setF({ ...f, purpose })} placeholder="e.g. Sales meeting with …" hint="Tax authorities expect a specific purpose for each business trip" />
          <Txt label="Client / project" value={f.client} onChange={(client) => setF({ ...f, client })} placeholder="optional" />
          <Seg value={f.cat} onChange={(cat) => setF({ ...f, cat })} options={CATS} />
          {odoBad && <Note tone="err">End reading is below the start reading.</Note>}
          <Row>
            <Btn kind="primary" disabled={odoBad || distNow <= 0 || rec !== 'idle' || (f.cat === 'business' && !f.purpose.trim())} onClick={save}>+ Save trip ({num(distNow, 1)} {u})</Btn>
          </Row>
          {f.cat === 'business' && !f.purpose.trim() && <p className="muted" style={{ fontSize: 12 }}>Add a business purpose to save.</p>}
        </Panel>
        <Panel title="Reimbursement rate">
          <Select label="Rate table" value={s.rate} onChange={(rate) => set({ rate })} options={RATE_SETS.map((r) => [r.id, r.name] as [string, string])} />
          {s.rate === 'custom' && <Num label="Rate per km" value={s.customRate} onChange={(customRate) => set({ customRate: Math.max(0, customRate) })} unit="€" min={0} />}
          <p className="muted" style={{ fontSize: 13, marginBottom: 0 }}>{rs.note} Check the current official rate before filing.</p>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Business distance" value={`${num(bizDist, 1)} ${u}`} sub={`${biz.length} trips`} tone="accent" />
          <Stat label="Reimbursable" value={m(amount)} sub={rs.name} tone="good" />
          <Stat label="Business share" value={pct(total ? bizDist / total : 0, 0)} sub={`of ${num(total, 0)} ${u} total`} />
        </Stats>
        <Panel title="Trip log" actions={<>
          <CsvButton name={`mileage-report-${T}.csv`} rows={() => [['Date', 'Vehicle', 'From', 'To', 'Purpose', 'Client/project', 'Category', 'Source', 'Odometer start', 'Odometer end', `Distance (${u})`, `Amount (${rs.currency})`], ...lines.map((l) => { const t = l.trip as LTrip; return [t.date, t.vehicle, t.from, t.to, t.purpose, t.client, t.cat, t.source, t.start ?? '', t.end ?? '', +l.distance.toFixed(2), +l.amount.toFixed(2)] }), ['', '', '', '', '', '', '', '', '', 'Total', +total.toFixed(2), +amount.toFixed(2)]]} />
          <JsonButtons name="mileage-log.json" data={s} onLoad={(d) => d && Array.isArray(d.trips) && set({ ...DEF, ...d })} />
          <Btn kind="ghost" onClick={reset}>Reset</Btn>
        </>}>
          <Table head={['Date', 'Trip', 'Category', `Distance`, 'Amount', '']} rows={[...lines].reverse().map((l) => {
            const t = l.trip as LTrip
            return [
              t.date.slice(5),
              <div key="t"><b>{t.from || '?'} → {t.to || '?'}</b><div className="muted" style={{ fontSize: 12 }}>{t.purpose}{t.client ? ` · ${t.client}` : ''} · {t.source}{t.start !== null ? ` ${num(t.start, 0)}–${num(t.end ?? 0, 0)}` : ''}</div>{issues[t.id] && <div style={{ color: 'var(--err)', fontSize: 12 }}>⚠ {issues[t.id]}</div>}</div>,
              t.cat,
              <span key="d" style={{ whiteSpace: 'nowrap' }}>{num(l.distance, 1)} {u}</span>,
              m(l.amount),
              <Btn key="x" kind="ghost" title="Delete" onClick={() => set({ trips: s.trips.filter((x) => x.id !== t.id) })}>✕</Btn>,
            ]
          })} foot={['', 'Total', '', `${num(total, 1)} ${u}`, m(amount), '']} />
        </Panel>
        <Panel title="By month">
          <BarChart bars={byMonth.map((r) => ({ label: r.key, value: [lines.filter((l) => l.trip.date.startsWith(r.key) && l.trip.cat === 'business').reduce((a, l) => a + l.distance, 0), lines.filter((l) => l.trip.date.startsWith(r.key) && l.trip.cat !== 'business').reduce((a, l) => a + l.distance, 0)] }))} stacks={[{ name: 'Business' }, { name: 'Other' }]} fy={(v) => `${num(v, 0)} ${u}`} height={200} />
          <Table head={['Month', 'Trips', 'Distance', 'Amount']} rows={byMonth.map((r) => [r.key, r.trips, `${num(r.distance, 1)} ${u}`, m(r.amount)])} />
        </Panel>
        <Panel title="Business by client / project">
          <Table head={['Client / project', 'Trips', 'Distance', 'Amount']} rows={byClient.map((r) => [r.key, r.trips, `${num(r.distance, 1)} ${u}`, m(r.amount)])} />
        </Panel>
        {s.trips.some((t) => (t as LTrip).track) && (
          <Panel title="Latest GPS route">
            <Route pts={[...s.trips].reverse().find((t) => (t as LTrip).track)!.track!} h={160} />
          </Panel>
        )}
        <Note>Keep odometer readings at the start and end of the year too. Records stay in this browser: export the CSV for your claim and use Backup to keep a copy.</Note>
      </div>
    </Split>
  )
}
