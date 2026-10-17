import { useState } from 'react'
import { Btn, Check, CsvButton, download, Legend, Note, Num, Panel, Row, Seg, Slider, Split, Stat, Stats, Table, Txt, today, useToolState } from '../kit'
import { events, fromDay, fToC, nextDate, plan, SEEDS, toDay, toIcs, validDate, ZONE_FROST, type Plan, type Seed } from './lib/seed-starting-calculator'

const T = today()
const DEF = {
  frost: nextDate(4, 20, T),
  margin: 0,
  picked: ['Tomato', 'Pepper', 'Basil', 'Broccoli', 'Lettuce', 'Onion (seed)', 'Cucumber', 'Marigold'],
  custom: [] as Seed[],
  sort: 'sow' as 'sow' | 'name' | 'out',
  celsius: false,
}
const fmtD = (iso: string) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
const C = { sow: '#6366f1', grow: 'color-mix(in srgb, #6366f1 25%, transparent)', harden: '#f59e0b', out: '#10b981' }

function Gantt({ plans, frost }: { plans: Plan[]; frost: string }) {
  if (!plans.length) return null
  const d0 = Math.min(...plans.map((p) => toDay(p.sowFrom))) - 7
  const d1 = Math.max(...plans.map((p) => toDay(p.transplant))) + 10
  const W = 720, L = 130, R = 10, row = 24, top = 26
  const H = top + plans.length * row + 8
  const x = (d: number) => L + ((d - d0) / (d1 - d0)) * (W - L - R)
  const months: number[] = []
  for (let d = d0; d <= d1; d++) if (fromDay(d).endsWith('-01')) months.push(d)
  const now = toDay(T)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', fontSize: 11 }} role="img" aria-label="Seed starting timeline">
      {months.map((m) => (
        <g key={m}>
          <line x1={x(m)} x2={x(m)} y1={top - 6} y2={H} stroke="var(--line)" />
          <text x={x(m) + 3} y={12} fill="var(--muted)">{new Date(m * 86400000).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })}</text>
        </g>
      ))}
      {plans.map((p, i) => {
        const y = top + i * row
        return (
          <g key={p.name}>
            <text x={4} y={y + 15} fill="currentColor">{p.name}</text>
            <rect x={x(toDay(p.sowFrom))} y={y + 5} width={x(toDay(p.hardenFrom)) - x(toDay(p.sowFrom))} height={12} rx={3} fill={C.grow} />
            <rect x={x(toDay(p.sowFrom))} y={y + 5} width={Math.max(3, x(toDay(p.sowTo) + 1) - x(toDay(p.sowFrom)))} height={12} rx={3} fill={C.sow}><title>{`Sow ${fmtD(p.sowFrom)}–${fmtD(p.sowTo)}`}</title></rect>
            <rect x={x(toDay(p.hardenFrom))} y={y + 5} width={x(toDay(p.transplant)) - x(toDay(p.hardenFrom))} height={12} rx={3} fill={C.harden}><title>{`Harden off from ${fmtD(p.hardenFrom)}`}</title></rect>
            <circle cx={x(toDay(p.transplant))} cy={y + 11} r={6} fill={C.out}><title>{`Transplant ${fmtD(p.transplant)}`}</title></circle>
          </g>
        )
      })}
      <line x1={x(toDay(frost))} x2={x(toDay(frost))} y1={top - 8} y2={H} stroke="var(--err)" strokeDasharray="4 3" strokeWidth={1.5} />
      <text x={x(toDay(frost)) + 3} y={top - 10} fill="var(--err)" fontWeight={700}>last frost</text>
      {now > d0 && now < d1 && <line x1={x(now)} x2={x(now)} y1={top - 6} y2={H} stroke="var(--accent)" strokeWidth={2} />}
    </svg>
  )
}

export default function SeedStartingCalculator() {
  const [s, set, reset] = useToolState('seed-starting-calculator', DEF)
  const [nc, setNc] = useState({ name: '', early: 8, late: 6, out: 1, hardy: false })
  const frost = validDate(s.frost) ? s.frost : DEF.frost
  const all = [...SEEDS, ...s.custom]
  const plans = all.filter((x) => s.picked.includes(x.name)).map((x) => plan(x, frost, s.margin))
  const sorted = [...plans].sort((a, b) => (s.sort === 'name' ? a.name.localeCompare(b.name) : s.sort === 'out' ? a.transplant.localeCompare(b.transplant) : a.sowFrom.localeCompare(b.sowFrom)))
  const evs = events(plans)
  const soon = evs.filter((e) => toDay(e.end ?? e.date) >= toDay(T) && toDay(e.date) <= toDay(T) + 14)
  const first = sorted.length ? [...plans].sort((a, b) => a.sowFrom.localeCompare(b.sowFrom))[0] : null
  const daysToFirst = first ? toDay(first.sowFrom) - toDay(T) : 0
  const tmp = (t: [number, number]) => (s.celsius ? `${Math.round(fToC(t[0]))}–${Math.round(fToC(t[1]))} °C` : `${t[0]}–${t[1]} °F`)
  const toggle = (n: string) => set({ picked: s.picked.includes(n) ? s.picked.filter((x) => x !== n) : [...s.picked, n] })

  return (
    <Split>
      <div>
        <Panel title="Last spring frost">
          <Txt label="Average last frost date" type="date" value={s.frost} onChange={(f) => set({ frost: f })} hint="From your local extension service or a frost-date lookup" />
          <div className="muted" style={{ fontSize: 12, margin: '4px 0' }}>Typical by USDA zone:</div>
          <Row>
            {ZONE_FROST.map(([z, m, d]) => (
              <button key={z} type="button" className={`k-btn ${frost === nextDate(m, d, T) ? 'primary' : ''}`} style={{ padding: '3px 8px', fontSize: 12 }} onClick={() => set({ frost: nextDate(m, d, T) })}>{z.replace('Zone ', 'Z')}</button>
            ))}
          </Row>
          <Slider label="Safety margin for tender crops" value={s.margin} onChange={(margin) => set({ margin })} min={0} max={3} step={1} unit=" wk" show={(v) => String(v)} />
          <Seg value={s.celsius ? 'c' : 'f'} onChange={(v) => set({ celsius: v === 'c' })} options={[['f', '°F'], ['c', '°C']]} />
        </Panel>
        <Panel title={`Crops (${s.picked.length})`} actions={<><Btn kind="ghost" onClick={() => set({ picked: all.map((x) => x.name) })}>All</Btn><Btn kind="ghost" onClick={() => set({ picked: [] })}>None</Btn></>}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 2 }}>
            {all.map((x) => <Check key={x.name} label={<>{x.name}{x.hardy ? <span className="muted"> ❄</span> : ''}</>} value={s.picked.includes(x.name)} onChange={() => toggle(x.name)} />)}
          </div>
          <p className="muted" style={{ fontSize: 12 }}>❄ = frost-hardy, transplanted before the last frost.</p>
        </Panel>
        <Panel title="Add your own crop">
          <Txt label="Name" value={nc.name} onChange={(name) => setNc({ ...nc, name })} placeholder="e.g. Tomatillo" />
          <Row>
            <Num label="Sow from" value={nc.early} onChange={(early) => setNc({ ...nc, early })} unit="wk before" min={0} max={20} />
            <Num label="Sow until" value={nc.late} onChange={(late) => setNc({ ...nc, late })} unit="wk before" min={0} max={20} />
            <Num label="Transplant" value={nc.out} onChange={(out) => setNc({ ...nc, out })} unit="wk ± frost" min={-8} max={8} />
          </Row>
          <Check label="Frost-hardy" value={nc.hardy} onChange={(hardy) => setNc({ ...nc, hardy })} />
          <Row>
            <Btn kind="primary" disabled={!nc.name.trim() || all.some((x) => x.name === nc.name.trim())} onClick={() => {
              const name = nc.name.trim()
              set({ custom: [...s.custom, { name, sow: [Math.max(nc.early, nc.late), Math.min(nc.early, nc.late)], germ: [5, 14], temp: [65, 80], out: nc.out, hardy: nc.hardy }], picked: [...s.picked, name] })
              setNc({ ...nc, name: '' })
            }}>+ Add crop</Btn>
            {s.custom.length > 0 && <Btn kind="ghost" onClick={() => set({ custom: [], picked: s.picked.filter((n) => SEEDS.some((x) => x.name === n)) })}>Remove custom</Btn>}
          </Row>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="First sowing" value={first ? fmtD(first.sowFrom) : '—'} sub={first ? `${first.name} · ${daysToFirst > 0 ? `in ${daysToFirst} days` : daysToFirst === 0 ? 'today' : `${-daysToFirst} days ago`}` : ''} tone="accent" />
          <Stat label="Last frost" value={fmtD(frost)} sub={frost.slice(0, 4)} />
          <Stat label="Crops" value={plans.length} sub={`${plans.filter((p) => !p.hardy).length} tender`} />
          <Stat label="Transplanting" value={plans.length ? `${fmtD(evs.filter((e) => e.title.startsWith('Transplant'))[0].date)}` : '—'} sub={plans.length ? `to ${fmtD(evs.filter((e) => e.title.startsWith('Transplant')).slice(-1)[0].date)}` : ''} />
        </Stats>
        {soon.length > 0 ? <Note tone="warn"><b>Next two weeks:</b> {soon.map((e) => `${e.title} (${fmtD(e.date)}${e.end && e.end !== e.date ? `–${fmtD(e.end)}` : ''})`).join('; ')}.</Note> : first && <Note>Nothing to do in the next two weeks. Get trays, seed-starting mix and grow lights ready before {fmtD(first.sowFrom)}.</Note>}
        <Panel title="Timeline">
          <Gantt plans={sorted} frost={frost} />
          <Legend items={[['Sow indoors', C.sow], ['Growing indoors', '#c7d2fe'], ['Harden off', C.harden], ['Transplant', C.out]]} />
        </Panel>
        <Panel title="Schedule" actions={<>
          <Btn onClick={() => download('seed-starting.ics', toIcs(evs), 'text/calendar')}>📅 Calendar (.ics)</Btn>
          <CsvButton name="seed-starting.csv" rows={() => [['Crop', 'Sow from', 'Sow until', 'Germinates', 'Soil temp', 'Harden off', 'Transplant', 'Weeks indoors'], ...sorted.map((p) => [p.name, p.sowFrom, p.sowTo, `${p.germFrom} – ${p.germTo}`, tmp(p.temp), p.hardenFrom, p.transplant, p.weeksIndoors])]} />
          <Btn kind="ghost" onClick={reset}>Reset</Btn>
        </>}>
          <Seg value={s.sort} onChange={(sort) => set({ sort })} options={[['sow', 'By sowing date'], ['out', 'By transplant'], ['name', 'A–Z']]} />
          <Table
            head={['Crop', 'Sow indoors', 'Sprouts', 'Soil temp', 'Harden off', 'Transplant', 'Weeks']}
            rows={sorted.map((p) => {
              const past = toDay(p.sowTo) < toDay(T)
              return [<b key="n">{p.name}</b>, <span key="s" style={{ color: past ? 'var(--muted)' : undefined, whiteSpace: 'nowrap' }}>{fmtD(p.sowFrom)} – {fmtD(p.sowTo)}</span>, <span key="g" style={{ whiteSpace: 'nowrap' }}>{fmtD(p.germFrom)} – {fmtD(p.germTo)}</span>, tmp(p.temp), fmtD(p.hardenFrom), <b key="t" style={{ color: C.out }}>{fmtD(p.transplant)}</b>, p.weeksIndoors]
            })}
          />
          {!plans.length && <p className="muted">Pick some crops on the left.</p>}
        </Panel>
        <Note>Harden off over 7–10 days: start with an hour of shade outdoors and add an hour or two daily. Keep seedlings 2–3 in (5–8 cm) under grow lights for 14–16 h a day. Timings are typical averages; adjust for your climate and variety.</Note>
      </div>
    </Split>
  )
}
