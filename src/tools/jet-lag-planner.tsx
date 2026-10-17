import { Btn, CsvButton, download, Note, Num, Panel, Row, Seg, Select, Split, Stat, Stats, Table, Txt, useToolState } from '../kit'
import { fmtH, plan, toIcs, tzOffsetMin, wrap24, type Day, type Dir } from './lib/jet-lag-planner'

const FALLBACK = ['UTC', 'America/Los_Angeles', 'America/Denver', 'America/Chicago', 'America/New_York', 'America/Sao_Paulo', 'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Kyiv', 'Europe/Istanbul', 'Africa/Cairo', 'Africa/Johannesburg', 'Asia/Dubai', 'Asia/Kolkata', 'Asia/Bangkok', 'Asia/Singapore', 'Asia/Shanghai', 'Asia/Tokyo', 'Australia/Sydney', 'Pacific/Auckland', 'Pacific/Honolulu']
const ZONES: string[] = (() => {
  try {
    const f = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf
    const z = f ? f('timeZone') : []
    return z.length ? (z.includes('UTC') ? z : ['UTC', ...z]) : FALLBACK
  } catch {
    return FALLBACK
  }
})()

const d0 = new Date()
const inAWeek = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() + 7)
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

interface State { home: string; dest: string; depart: string; bed: string; wake: string; preDays: number; dir: Dir; advanceRate: number; delayRate: number }
const DEF: State = { home: 'America/New_York', dest: 'Europe/Paris', depart: iso(inAWeek), bed: '23:00', wake: '07:00', preDays: 3, dir: 'auto', advanceRate: 1, delayRate: 1.5 }
const hrs = (t: string) => {
  const [h, m] = t.split(':').map(Number)
  return (h || 0) + (m || 0) / 60
}
const range = (r: [number, number]) => `${fmtH(r[0])}–${fmtH(r[1])}`
const offLabel = (min: number) => `UTC${min >= 0 ? '+' : '−'}${Math.floor(Math.abs(min) / 60)}${Math.abs(min) % 60 ? ':' + String(Math.abs(min) % 60).padStart(2, '0') : ''}`

/** Segments of [from, to) on a 0–24 axis, split at midnight. */
const segs = (a: number, b: number): [number, number][] => {
  const x = wrap24(a)
  const y = wrap24(b)
  return y > x ? [[x, y]] : [[x, 24], [0, y]]
}

function DayBar({ d }: { d: Day }) {
  const bar = (r: [number, number][], color: string, key: string, title: string) => r.map(([a, b], i) => <rect key={key + i} x={(a / 24) * 1000} width={((b - a) / 24) * 1000} y={key === 'sleep' ? 4 : 10} height={key === 'sleep' ? 28 : 16} rx={4} fill={color}><title>{title}</title></rect>)
  return (
    <svg viewBox="0 0 1000 36" style={{ width: '100%', height: 28, display: 'block' }} preserveAspectRatio="none">
      <rect x={0} y={4} width={1000} height={28} rx={4} fill="var(--panel2)" />
      {bar(segs(d.bed, d.wake), '#334155', 'sleep', `Sleep ${fmtH(d.bed)}–${fmtH(d.wake)}`)}
      {bar(segs(d.seek[0], d.seek[1]), '#f59e0b', 'seek', `Bright light ${range(d.seek)}`)}
      {bar(segs(d.avoid[0], d.avoid[1]), '#94a3b8', 'avoid', `Avoid light ${range(d.avoid)}`)}
      {[6, 12, 18].map((h) => <line key={h} x1={(h / 24) * 1000} x2={(h / 24) * 1000} y1={0} y2={36} stroke="var(--line)" strokeDasharray="3 3" />)}
    </svg>
  )
}

export default function JetLagPlanner() {
  const [s, set, reset] = useToolState('jet-lag-planner', DEF)
  const when = new Date(s.depart + 'T12:00:00Z')
  const valid = !Number.isNaN(when.getTime())
  let hOff = 0
  let dOff = 0
  try {
    hOff = tzOffsetMin(s.home, valid ? when : new Date(0))
    dOff = tzOffsetMin(s.dest, valid ? when : new Date(0))
  } catch {
    /* unknown zone */
  }
  const p = plan({ delta: (dOff - hOff) / 60, bed: hrs(s.bed), wake: hrs(s.wake), preDays: s.preDays, dir: s.dir, advanceRate: s.advanceRate, delayRate: s.delayRate, depart: valid ? s.depart : iso(inAWeek) })
  const after = p.days.filter((d) => d.offset > 0).length
  const east = p.delta > 0
  const zoneOpts = ZONES.map((z) => [z, z.replace(/_/g, ' ')] as const)
  const label = (d: Day) => (d.offset < 0 ? `${-d.offset} day${d.offset < -1 ? 's' : ''} before` : d.offset === 0 ? 'Travel day' : `Day ${d.offset} there`)
  const dateFmt = (x: string) => new Date(x + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })

  return (
    <Split wide="right">
      <div>
        <Panel title="Trip">
          <Select label="From (home)" value={s.home} onChange={(home) => set({ home })} options={zoneOpts} />
          <Select label="To (destination)" value={s.dest} onChange={(dest) => set({ dest })} options={zoneOpts} />
          <Row>
            <Btn kind="ghost" onClick={() => set({ home: Intl.DateTimeFormat().resolvedOptions().timeZone })}>Use my zone as home</Btn>
            <Btn kind="ghost" onClick={() => set({ home: s.dest, dest: s.home })}>⇄ Swap (return trip)</Btn>
          </Row>
          <Txt label="Travel date" type="date" value={s.depart} onChange={(depart) => set({ depart })} />
        </Panel>
        <Panel title="Your usual sleep">
          <Row>
            <Txt label="Bedtime" type="time" value={s.bed} onChange={(bed) => set({ bed })} />
            <Txt label="Wake time" type="time" value={s.wake} onChange={(wake) => set({ wake })} />
          </Row>
          <Num label="Days to start shifting before the trip" value={s.preDays} onChange={(v) => set({ preDays: Math.max(0, Math.min(7, Math.round(v))) })} min={0} max={7} step={1} />
          <Seg value={s.dir} onChange={(dir) => set({ dir })} options={[['auto', 'Auto'], ['advance', 'Shift earlier'], ['delay', 'Shift later']]} />
          <Row>
            <Num label="Earlier by" value={s.advanceRate} onChange={(v) => set({ advanceRate: Math.max(0.5, Math.min(2, v)) })} unit="h/day" min={0.5} max={2} step={0.25} />
            <Num label="Later by" value={s.delayRate} onChange={(v) => set({ delayRate: Math.max(0.5, Math.min(3, v)) })} unit="h/day" min={0.5} max={3} step={0.25} />
          </Row>
          <Btn kind="ghost" onClick={reset}>Reset</Btn>
        </Panel>
        <Panel title="Why it works">
          <p style={{ marginTop: 0, fontSize: 14 }}>Your body clock moves about 1 hour a day earlier, or 1–2 hours a day later, when light hits at the right time. Light in the hours after your body-temperature low (about 2–3 h before your usual wake time) pulls the clock earlier. Light in the evening pushes it later.</p>
          <ul style={{ fontSize: 14, paddingLeft: 18, margin: 0 }}>
            <li>Outdoor daylight beats room lighting. A 10,000-lux light box works indoors.</li>
            <li>Avoid caffeine within 8 h of your shifted bedtime.</li>
            <li>For trips of 2 days or less, it is often better to stay on home time.</li>
            <li>Low-dose melatonin can help shift earlier. Ask a doctor first.</li>
          </ul>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Time difference" value={`${p.delta > 0 ? '+' : p.delta < 0 ? '−' : ''}${Math.abs(p.delta)} h`} sub={`${offLabel(hOff)} → ${offLabel(dOff)}`} tone="accent" />
          <Stat label="Strategy" value={p.need ? (p.direction === 'advance' ? 'Shift earlier' : 'Shift later') : 'No change'} sub={p.need ? `${p.need} h ${east ? 'eastward' : 'westward'}${(p.direction === 'advance') !== east ? ' (the long way round)' : ''}` : 'Same clock time'} />
          <Stat label="Adapted by" value={p.days.length ? dateFmt(p.days[p.days.length - 1].date) : '—'} sub={after ? `${after} day${after > 1 ? 's' : ''} after arrival` : 'on arrival'} tone={after <= 2 ? 'good' : undefined} />
        </Stats>
        {!p.need && <Note tone="ok">Both places share the same clock time on this date, so there is no jet lag to plan for. Just get daylight and keep your usual schedule.</Note>}
        <Panel
          title="Daily plan"
          actions={
            <>
              <Btn kind="primary" onClick={() => download('jet-lag-plan.ics', toIcs(p, new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z'), 'text/calendar')}>⬇ Calendar (.ics)</Btn>
              <CsvButton name="jet-lag-plan.csv" rows={() => [['Date', 'Day', 'Clock', 'Bed', 'Wake', 'Seek light', 'Avoid light', 'Hours left'], ...p.days.map((d) => [d.date, label(d), d.where === 'home' ? s.home : s.dest, fmtH(d.bed), fmtH(d.wake), range(d.seek), range(d.avoid), d.behind])]} />
            </>
          }
        >
          <div style={{ display: 'flex', gap: 14, fontSize: 12, marginBottom: 8, flexWrap: 'wrap' }} className="muted">
            <span><i style={{ display: 'inline-block', width: 12, height: 12, background: '#334155', borderRadius: 3, verticalAlign: -2 }} /> Sleep</span>
            <span><i style={{ display: 'inline-block', width: 12, height: 12, background: '#f59e0b', borderRadius: 3, verticalAlign: -2 }} /> Seek bright light</span>
            <span><i style={{ display: 'inline-block', width: 12, height: 12, background: '#94a3b8', borderRadius: 3, verticalAlign: -2 }} /> Avoid light (sunglasses)</span>
            <span style={{ marginLeft: 'auto' }}>0h · 6 · 12 · 18 · 24h, local clock</span>
          </div>
          {p.days.map((d) => (
            <div key={d.date} style={{ display: 'grid', gridTemplateColumns: '108px 1fr', gap: 8, alignItems: 'center', marginBottom: 6 }}>
              <div style={{ fontSize: 12, lineHeight: 1.2 }}>
                <b style={{ color: d.offset === 0 ? 'var(--accent)' : undefined }}>{label(d)}</b>
                <br />
                <span className="muted">{dateFmt(d.date)}</span>
              </div>
              <DayBar d={d} />
            </div>
          ))}
        </Panel>
        <Panel title="Schedule table">
          <Table
            head={['Date', 'Clock', 'Bed', 'Wake', '☀ Seek light', '🕶 Avoid light', 'Left']}
            rows={p.days.map((d) => [<span key="d"><b>{label(d)}</b><br /><span className="muted">{dateFmt(d.date)}</span></span>, d.where === 'home' ? 'Home' : 'Destination', fmtH(d.bed), fmtH(d.wake), range(d.seek), range(d.avoid), d.behind ? `${d.behind} h` : '✓'])}
          />
          <p className="muted" style={{ fontSize: 13 }}>Before the trip, times are on your home clock. From the travel day on, they are on destination time. Calendar events use floating local times, so they show at the right wall-clock time wherever you are.</p>
        </Panel>
      </div>
    </Split>
  )
}
