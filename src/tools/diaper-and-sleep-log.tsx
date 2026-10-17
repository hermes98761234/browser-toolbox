import { useEffect, useMemo, useState } from 'react'
import { BarChart, Btn, CsvButton, JsonButtons, Note, Panel, Row, Seg, Split, Stat, Stats, Table, uid, useToolState } from '../kit'
import { addDays, dayKey, dayStart, dur, summarize, type Ev, type Kind, type Sleep } from './lib/diaper-and-sleep-log'

interface State { baby: string; events: Ev[]; sleeps: Sleep[] }

const MIN = 60000, HR = 60 * MIN
const nowMs = () => Date.now()
/** Six days of a plausible newborn rhythm ending now. */
function sample(): State {
  const now = Date.now()
  const events: Ev[] = [], sleeps: Sleep[] = []
  let t = now - 150 * HR, k = 0
  while (t < now - 40 * MIN) {
    const nap = (1.6 + ((k * 37) % 23) / 10) * HR
    const wake = (0.7 + ((k * 17) % 9) / 10) * HR
    events.push({ id: uid(), t, kind: 'feed' })
    events.push({ id: uid(), t: t + 15 * MIN, kind: k % 3 === 1 ? 'both' : k % 5 === 4 ? 'dirty' : 'wet' })
    const start = t + wake
    const end = Math.min(start + nap, now - 30 * MIN)
    if (end > start) sleeps.push({ id: uid(), start, end })
    t = start + nap
    k++
  }
  return { baby: 'Mia', events, sleeps }
}
const DEF = sample()

const KINDS: Record<Kind, { icon: string; label: string; color: string }> = {
  wet: { icon: '💧', label: 'Wet', color: '#0ea5e9' },
  dirty: { icon: '💩', label: 'Dirty', color: '#a16207' },
  both: { icon: '💧💩', label: 'Wet + dirty', color: '#7c3aed' },
  feed: { icon: '🍼', label: 'Feed', color: '#f59e0b' },
}
const toInput = (ms: number) => { const d = new Date(ms - new Date(ms).getTimezoneOffset() * MIN); return d.toISOString().slice(0, 16) }
const fromInput = (s: string) => new Date(s).getTime()
const clock = (ms: number) => new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

export default function DiaperAndSleepLog() {
  const [s, set, reset] = useToolState('diaper-and-sleep-log', DEF)
  const [now, setNow] = useState(nowMs)
  const [ago, setAgo] = useState<'0' | '15' | '30' | '60'>('0')
  const [range, setRange] = useState<'7' | '14'>('7')
  useEffect(() => {
    const id = setInterval(() => setNow(nowMs()), 15000)
    return () => clearInterval(id)
  }, [])
  const when = () => nowMs() - Number(ago) * MIN
  const open = s.sleeps.find((x) => x.end === null)
  const days = useMemo(() => summarize(s.events, s.sleeps, now, Number(range)), [s.events, s.sleeps, now, range])
  const today = days[days.length - 1]
  const lastDiaper = [...s.events].filter((e) => e.kind !== 'feed').sort((a, b) => b.t - a.t)[0]
  const lastFeed = [...s.events].filter((e) => e.kind === 'feed').sort((a, b) => b.t - a.t)[0]
  const avg = (f: (d: (typeof days)[number]) => number) => { const full = days.slice(0, -1).filter((d) => d.wet + d.dirty + d.feeds > 0 || d.sleepH > 0); return full.length ? full.reduce((a, d) => a + f(d), 0) / full.length : 0 }

  const log = (kind: Kind) => { setNow(nowMs()); set({ events: [...s.events, { id: uid(), t: when(), kind }] }) }
  const toggleSleep = () => {
    setNow(nowMs())
    if (open) set({ sleeps: s.sleeps.map((x) => (x.id === open.id ? { ...x, end: Math.max(x.start + MIN, when()) } : x)) })
    else set({ sleeps: [...s.sleeps, { id: uid(), start: when(), end: null }] })
  }

  type LogRow = { id: string; t: number; what: string; detail: string; kind: 'ev' | 'sl' }
  const recent: LogRow[] = [
    ...s.events.map((e) => ({ id: e.id, t: e.t, what: `${KINDS[e.kind].icon} ${KINDS[e.kind].label}`, detail: '', kind: 'ev' as const })),
    ...s.sleeps.map((x) => ({ id: x.id, t: x.start, what: '😴 Sleep', detail: x.end ? `${dur(x.end - x.start)} · until ${clock(x.end)}` : `sleeping ${dur(now - x.start)}`, kind: 'sl' as const })),
  ].sort((a, b) => b.t - a.t)

  const big = { fontSize: 16, padding: '14px 10px', flex: '1 1 120px', justifyContent: 'center' } as const

  return (
    <Split>
      <div>
        <Panel title={`Quick log · ${s.baby}`}>
          <Seg value={ago} onChange={setAgo} label="When" options={[['0', 'Now'], ['15', '15 min ago'], ['30', '30 min ago'], ['60', '1 h ago']]} />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {(['wet', 'dirty', 'both', 'feed'] as Kind[]).map((k) => (
              <button key={k} type="button" className="k-btn" style={{ ...big, borderColor: KINDS[k].color }} onClick={() => log(k)}>
                {KINDS[k].icon} {KINDS[k].label}
              </button>
            ))}
            <button type="button" className={`k-btn ${open ? 'primary' : ''}`} style={{ ...big, flexBasis: '100%' }} onClick={toggleSleep}>
              {open ? `⏰ Woke up · slept ${dur(now - open.start)}` : '😴 Fell asleep'}
            </button>
          </div>
          <p className="muted" style={{ fontSize: 12.5, marginBottom: 0 }}>
            Last diaper: <b>{lastDiaper ? `${dur(now - lastDiaper.t)} ago` : '—'}</b> · last feed: <b>{lastFeed ? `${dur(now - lastFeed.t)} ago` : '—'}</b>
          </p>
        </Panel>

        <Panel title="Recent entries" actions={<>
          <CsvButton name={`${s.baby || 'baby'}-log.csv`} rows={() => [['Start', 'End', 'Type', 'Duration (min)'], ...[...recent].reverse().map((r) => {
            const sl = r.kind === 'sl' ? s.sleeps.find((x) => x.id === r.id) : undefined
            return [toInput(r.t).replace('T', ' '), sl?.end ? toInput(sl.end).replace('T', ' ') : '', r.what.replace(/^\S+\s/, ''), sl?.end ? Math.round((sl.end - sl.start) / MIN) : '']
          })]} />
          <JsonButtons name="baby-log.json" data={s} onLoad={(d) => d && Array.isArray(d.events) && Array.isArray(d.sleeps) && set(d)} />
        </>}>
          <Table
            max={25}
            head={['Time', 'Entry', '']}
            rows={recent.map((r) => [
              <input key="t" type="datetime-local" value={toInput(r.t)} aria-label="Time" style={{ width: 178, fontSize: 12.5 }} onChange={(e) => {
                const t = fromInput(e.target.value)
                if (!Number.isFinite(t)) return
                if (r.kind === 'ev') set({ events: s.events.map((x) => (x.id === r.id ? { ...x, t } : x)) })
                else set({ sleeps: s.sleeps.map((x) => (x.id === r.id ? { ...x, start: t, end: x.end !== null ? Math.max(x.end, t) : null } : x)) })
              }} />,
              <span key="w"><b>{r.what}</b>{r.detail && <span className="muted" style={{ display: 'block', fontSize: 12 }}>{r.detail}</span>}</span>,
              <Btn key="x" kind="ghost" title="Delete" onClick={() => (r.kind === 'ev' ? set({ events: s.events.filter((x) => x.id !== r.id) }) : set({ sleeps: s.sleeps.filter((x) => x.id !== r.id) }))}>✕</Btn>,
            ])}
          />
          <Row>
            <label className="k-field"><span className="k-label">Baby's name</span><input className="k-text" value={s.baby} onChange={(e) => set({ baby: e.target.value })} /></label>
            <Btn kind="danger" onClick={() => confirm('Delete all entries?') && set({ events: [], sleeps: [] })}>Clear all</Btn>
            <Btn kind="ghost" onClick={reset}>Sample</Btn>
          </Row>
        </Panel>
      </div>

      <div>
        <Stats>
          <Stat label="Wet today" value={today.wet} sub={`avg ${avg((d) => d.wet).toFixed(1)}/day`} tone={today.wet >= 6 ? 'good' : 'accent'} />
          <Stat label="Dirty today" value={today.dirty} sub={`avg ${avg((d) => d.dirty).toFixed(1)}/day`} />
          <Stat label="Sleep today" value={dur(today.sleepH * HR)} sub={`longest ${dur(today.longestH * HR)}`} />
          <Stat label="Feeds today" value={today.feeds} sub={`avg ${avg((d) => d.feeds).toFixed(1)}/day`} />
        </Stats>

        <Panel title="Daily timeline" actions={<Seg value={range} onChange={setRange} options={[['7', '7 days'], ['14', '14 days']]} />}>
          <Timeline days={days.map((d) => d.day)} s={s} now={now} />
        </Panel>

        <Panel title="Diapers per day">
          <BarChart bars={days.map((d) => ({ label: d.key.slice(5), value: [d.wet, d.dirty] }))} stacks={[{ name: 'Wet', color: KINDS.wet.color }, { name: 'Dirty', color: KINDS.dirty.color }]} height={200} fy={(v) => String(Math.round(v))} />
        </Panel>
        <Panel title="Sleep hours per day">
          <BarChart bars={days.map((d) => ({ label: d.key.slice(5), value: Math.round(d.sleepH * 10) / 10, color: '#6366f1' }))} height={200} fy={(v) => `${v}h`} />
          <Note>
            Typical newborn ranges: about 6+ wet diapers a day after the first week, and 14–17 hours of sleep in 24 h in short stretches. These are general references, not medical advice. Share the CSV with your pediatrician if anything worries you.
          </Note>
        </Panel>
      </div>
    </Split>
  )
}

function Timeline({ days, s, now }: { days: number[]; s: State; now: number }) {
  const W = 720, L = 54, R = 8, rowH = 26, T = 18
  const H = T + days.length * rowH + 4
  const x = (ms: number, day: number) => L + ((ms - day) / (addDays(day, 1) - day)) * (W - L - R)
  return (
    <div className="k-chart">
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }} role="img" aria-label="Sleep and diaper timeline">
        {[0, 3, 6, 9, 12, 15, 18, 21, 24].map((h) => {
          const xx = L + (h / 24) * (W - L - R)
          return (
            <g key={h}>
              <line x1={xx} x2={xx} y1={T - 4} y2={H} className="grid" />
              <text x={xx} y={11} textAnchor="middle">{h === 0 || h === 24 ? '12a' : h === 12 ? '12p' : h > 12 ? `${h - 12}p` : `${h}a`}</text>
            </g>
          )
        })}
        {days.map((day, i) => {
          const y = T + i * rowH
          const next = addDays(day, 1)
          return (
            <g key={day}>
              <text x={L - 6} y={y + rowH / 2 + 4} textAnchor="end">{dayStart(now) === day ? 'Today' : new Date(day).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' })}</text>
              <rect x={L} y={y + 3} width={W - L - R} height={rowH - 6} rx={4} fill="var(--panel)" stroke="var(--line)" />
              {s.sleeps.map((sl) => {
                const a = Math.max(sl.start, day), b = Math.min(sl.end ?? now, next)
                return b > a ? <rect key={sl.id} x={x(a, day)} y={y + 5} width={Math.max(1, x(b, day) - x(a, day))} height={rowH - 10} rx={3} fill="#6366f1" opacity={sl.end ? 0.75 : 0.45}><title>{`Sleep ${clock(sl.start)}–${sl.end ? clock(sl.end) : 'now'} (${dur((sl.end ?? now) - sl.start)})`}</title></rect> : null
              })}
              {s.events.filter((e) => e.t >= day && e.t < next).map((e) => (
                e.kind === 'feed'
                  ? <circle key={e.id} cx={x(e.t, day)} cy={y + rowH - 6} r={2.6} fill={KINDS.feed.color}><title>{`Feed ${clock(e.t)}`}</title></circle>
                  : <rect key={e.id} x={x(e.t, day) - 1.5} y={y + 2} width={3} height={rowH - 12} rx={1} fill={KINDS[e.kind].color}><title>{`${KINDS[e.kind].label} ${clock(e.t)}`}</title></rect>
              ))}
              {dayStart(now) === day && <line x1={x(now, day)} x2={x(now, day)} y1={y + 1} y2={y + rowH - 1} stroke="var(--err)" strokeWidth={1.5} />}
            </g>
          )
        })}
      </svg>
      <div className="k-legend">
        <span><i style={{ background: '#6366f1' }} />Sleep</span>
        {(['wet', 'dirty', 'both', 'feed'] as Kind[]).map((k) => <span key={k}><i style={{ background: KINDS[k].color }} />{KINDS[k].label}</span>)}
        <span className="muted">{dayKey(days[0])} → {dayKey(days[days.length - 1])}</span>
      </div>
    </div>
  )
}
