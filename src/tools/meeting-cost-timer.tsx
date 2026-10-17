import { useEffect, useRef, useState } from 'react'
import { Btn, CopyButton, money, Note, Num, Panel, Row, Seg, Select, shareLink, Slider, Split, Stat, Stats, Table, uid, useToolState } from '../kit'
import { comparison, costAt, costPerHour, hms, hourly, people, type Group, type RateMode } from './lib/meeting-cost-timer'

interface State { currency: string; mode: RateMode; overhead: number; planned: number; perWeek: number; groups: Group[] }

const DEF: State = {
  currency: '$',
  mode: 'hourly',
  overhead: 1.3,
  planned: 60,
  perWeek: 1,
  groups: [
    { id: 'eng', role: 'Engineers', count: 5, rate: 70 },
    { id: 'des', role: 'Designer', count: 1, rate: 60 },
    { id: 'pm', role: 'Product manager', count: 1, rate: 75 },
    { id: 'mgr', role: 'Director', count: 1, rate: 110 },
  ],
}

const PRESETS: [string, Group[]][] = [
  ['Daily stand-up', [{ id: 'p1', role: 'Engineers', count: 6, rate: 70 }, { id: 'p2', role: 'Scrum master', count: 1, rate: 60 }]],
  ['All-hands', [{ id: 'p3', role: 'Staff', count: 80, rate: 50 }, { id: 'p4', role: 'Executives', count: 5, rate: 150 }]],
  ['1:1', [{ id: 'p5', role: 'Manager', count: 1, rate: 80 }, { id: 'p6', role: 'Report', count: 1, rate: 60 }]],
  ['Board meeting', [{ id: 'p7', role: 'Board members', count: 7, rate: 400 }, { id: 'p8', role: 'C-suite', count: 3, rate: 250 }]],
]

export default function MeetingCostTimer() {
  const [s, set, reset] = useToolState('meeting-cost-timer', DEF)
  const [acc, setAcc] = useState(0)
  const [since, setSince] = useState<number | null>(null)
  const [now, setNow] = useState(0)
  const big = useRef<HTMLDivElement>(null)
  const [full, setFull] = useState(false)

  useEffect(() => {
    if (since == null) return
    const id = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(id)
  }, [since])
  useEffect(() => {
    const f = () => setFull(document.fullscreenElement === big.current)
    document.addEventListener('fullscreenchange', f)
    return () => document.removeEventListener('fullscreenchange', f)
  }, [])

  const elapsed = acc + (since != null ? Math.max(0, now - since) : 0)
  const perHour = costPerHour(s.groups, s.mode, s.overhead)
  const cost = costAt(perHour, elapsed)
  const plannedCost = costAt(perHour, s.planned * 60_000)
  const m = (x: number, d = 2) => money(x, s.currency, d)
  const over = elapsed > s.planned * 60_000
  const cmp = comparison(cost || plannedCost)
  const toggle = () => {
    const t = Date.now()
    if (since == null) {
      setSince(t)
      setNow(t)
    } else {
      setAcc(acc + (t - since))
      setSince(null)
    }
  }
  const stop = () => {
    setAcc(0)
    setSince(null)
  }
  const edit = (id: string, p: Partial<Group>) => set({ groups: s.groups.map((g) => (g.id === id ? { ...g, ...p } : g)) })
  const goFull = () => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void big.current?.requestFullscreen?.()
  }
  const frac = Math.min(1, elapsed / (s.planned * 60_000 || 1))

  return (
    <Split wide="left">
      <div>
        <div
          ref={big}
          style={{
            background: full ? '#0b1020' : 'var(--panel)',
            color: full ? '#f8fafc' : undefined,
            border: '1px solid var(--line)',
            borderRadius: 14,
            padding: full ? '8vh 4vw' : 22,
            textAlign: 'center',
            marginBottom: 14,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            minHeight: full ? '100vh' : undefined,
            boxSizing: 'border-box',
          }}
        >
          <div style={{ fontSize: full ? '3vw' : 15, opacity: 0.7, fontWeight: 600 }}>This meeting has cost</div>
          <div style={{ fontSize: full ? '13vw' : 'clamp(44px, 8vw, 84px)', fontWeight: 800, fontFamily: 'var(--mono)', color: over ? 'var(--err)' : full ? '#fbbf24' : 'var(--accent)', lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{m(cost)}</div>
          <div style={{ fontSize: full ? '4vw' : 26, fontFamily: 'var(--mono)', fontWeight: 700 }}>⏱ {hms(elapsed)}</div>
          <div style={{ height: 10, borderRadius: 5, background: full ? '#334155' : 'var(--line)', margin: '14px auto 6px', maxWidth: 560, width: '100%', overflow: 'hidden' }}>
            <div style={{ width: `${frac * 100}%`, height: '100%', background: over ? 'var(--err)' : 'var(--ok)', transition: 'width .2s' }} />
          </div>
          <div style={{ fontSize: full ? '2.2vw' : 14, opacity: 0.8 }}>
            {people(s.groups)} people · {m(perHour / 60)} per minute · {over ? `${hms(elapsed - s.planned * 60_000)} over time` : `${s.planned} min planned`}
          </div>
          <div style={{ fontSize: full ? '3vw' : 18, marginTop: 10 }}>
            {cmp.icon} {cost > 0 ? `That's ${cmp.n.toFixed(1)} ${cmp.label}` : `The full ${s.planned} min will cost ${m(plannedCost, 0)}`}
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 16, flexWrap: 'wrap' }}>
            <button type="button" className="k-btn primary" style={{ fontSize: 18, padding: '10px 24px' }} onClick={toggle}>{since != null ? '⏸ Pause' : elapsed ? '▶ Resume' : '▶ Start meeting'}</button>
            <button type="button" className="k-btn" style={{ fontSize: 18, padding: '10px 18px' }} onClick={stop} disabled={!elapsed}>⏹ Reset</button>
            <button type="button" className="k-btn" style={{ fontSize: 18, padding: '10px 18px' }} onClick={goFull}>{full ? '✕ Exit' : '⛶ Fullscreen'}</button>
          </div>
        </div>
        <Stats>
          <Stat label="Cost per hour" value={m(perHour, 0)} sub={`${m(perHour / 3600)} per second`} />
          <Stat label="Planned meeting" value={m(plannedCost, 0)} sub={`${s.planned} min`} />
          <Stat label="Per year" value={m(plannedCost * s.perWeek * 52, 0)} sub={`${s.perWeek}× a week × 52`} tone="accent" />
        </Stats>
        <Panel title="What shorter meetings would save">
          <Table
            head={['Length', 'Cost', 'Per year', 'Saved per year']}
            rows={[15, 25, 30, 45, 50, 60, 90].filter((x) => x !== s.planned).concat(s.planned).sort((a, b) => a - b).map((min) => {
              const c = costAt(perHour, min * 60_000)
              const yr = c * s.perWeek * 52
              const save = (plannedCost - c) * s.perWeek * 52
              return [min === s.planned ? <b key="l">{min} min (planned)</b> : `${min} min`, m(c, 0), m(yr, 0), save > 0 ? <span key="s" style={{ color: 'var(--ok)', fontWeight: 700 }}>{m(save, 0)}</span> : '—']
            })}
          />
          {s.mode === 'hourly' && s.groups.some((g) => hourly(g.rate, s.mode) > 1000) && <Note tone="warn">Some hourly rates look like annual salaries. Switch to "Annual salary".</Note>}
        </Panel>
      </div>
      <div>
        <Panel title="Who's in the room">
          <Row>
            <Seg value={s.mode} onChange={(mode) => set({ mode, groups: s.groups.map((g) => ({ ...g, rate: Math.round(mode === 'annual' ? g.rate * 2080 : g.rate / 2080) })) })} options={[['hourly', 'Hourly rate'], ['annual', 'Annual salary']]} />
            <Select label="Currency" value={s.currency} onChange={(currency) => set({ currency })} options={['$', '€', '£', '₴', 'zł', '¥', 'CHF ']} />
          </Row>
          <Table
            head={['Role', 'People', s.mode === 'annual' ? 'Salary / yr' : 'Rate / h', '']}
            rows={s.groups.map((g) => [
              <input key="r" value={g.role} onChange={(e) => edit(g.id, { role: e.target.value })} aria-label="Role" style={{ width: '100%', minWidth: 90 }} />,
              <input key="c" type="number" min={0} value={g.count} onChange={(e) => edit(g.id, { count: Math.max(0, Math.round(Number(e.target.value) || 0)) })} aria-label="People" style={{ width: 60 }} />,
              <input key="h" type="number" min={0} value={g.rate} onChange={(e) => edit(g.id, { rate: Math.max(0, Number(e.target.value) || 0) })} aria-label="Rate" style={{ width: 90 }} />,
              <Btn key="x" kind="ghost" title="Remove" onClick={() => set({ groups: s.groups.filter((x) => x.id !== g.id) })}>✕</Btn>,
            ])}
          />
          <Row>
            <Btn onClick={() => set({ groups: [...s.groups, { id: uid(), role: 'Guest', count: 1, rate: s.mode === 'annual' ? 100000 : 50 }] })}>+ Role</Btn>
            {PRESETS.map(([n, g]) => (
              <Btn key={n} kind="ghost" onClick={() => set({ groups: g.map((x) => ({ ...x, id: uid(), rate: s.mode === 'annual' ? x.rate * 2080 : x.rate })) })}>{n}</Btn>
            ))}
          </Row>
          <Slider label="Overhead multiplier" value={s.overhead} onChange={(overhead) => set({ overhead })} min={1} max={2} step={0.05} unit="×" />
          <p className="muted" style={{ fontSize: 13, marginTop: -4 }}>Benefits, taxes, office and equipment usually add 25–40% on top of pay. Salaries use {2080} working hours a year.</p>
        </Panel>
        <Panel title="Meeting plan">
          <Row>
            <Num label="Scheduled length" value={s.planned} onChange={(planned) => set({ planned: Math.max(1, planned) })} unit="min" min={1} />
            <Num label="Times per week" value={s.perWeek} onChange={(perWeek) => set({ perWeek: Math.max(0, perWeek) })} min={0} step={1} />
          </Row>
          <Row>
            <CopyButton text={() => shareLink(s)} label="🔗 Copy share link" />
            <Btn kind="ghost" onClick={reset}>Reset</Btn>
          </Row>
        </Panel>
      </div>
    </Split>
  )
}
