import { Btn, CsvButton, download, Legend, Note, Panel, Row, Select, Split, Stat, Stats, Table, today, Txt, useToolState } from '../kit'
import { CROPS, kindLabel, schedule, seasonDays, toDay, toIcs, type Kind, type Task } from './lib/planting-calendar'

const ZONES: [string, string, string, string][] = [
  ['3', 'USDA 3 / short northern season', '05-20', '09-15'],
  ['4', 'USDA 4', '05-10', '09-25'],
  ['5', 'USDA 5', '04-28', '10-08'],
  ['6', 'USDA 6 / central Europe', '04-15', '10-20'],
  ['7', 'USDA 7', '04-05', '10-30'],
  ['8', 'USDA 8 / mild maritime', '03-20', '11-15'],
  ['9', 'USDA 9 / mediterranean', '02-20', '12-05'],
]
const COL: Record<Kind, string> = {
  indoor: '#a855f7',
  transplant: '#f97316',
  direct: '#10b981',
  harvest: '#eab308',
  'fall-sow': '#0ea5e9',
  'fall-harvest': '#84cc16',
}
const KINDS = Object.keys(COL) as Kind[]
const YEAR = new Date().getFullYear()
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const DEF = {
  zone: '6',
  lastFrost: `${YEAR}-04-15`,
  firstFrost: `${YEAR}-10-20`,
  crops: ['Tomato', 'Pepper', 'Basil', 'Zucchini', 'Bush beans', 'Peas', 'Lettuce', 'Kale', 'Carrot', 'Radish', 'Onion', 'Potato'],
}

const stampNow = () => new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z'
const nice = (iso: string) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

export default function PlantingCalendar() {
  const [s, set, reset] = useToolState('planting-calendar', DEF)
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(s.lastFrost) && /^\d{4}-\d{2}-\d{2}$/.test(s.firstFrost) && seasonDays(s.lastFrost, s.firstFrost) > 30
  const season = valid ? seasonDays(s.lastFrost, s.firstFrost) : 0
  const chosen = CROPS.filter((c) => s.crops.includes(c.n))
  const rows = valid ? chosen.map((c) => ({ c, tasks: schedule(c, s.lastFrost, s.firstFrost) })) : []
  const all: Task[] = rows.flatMap((r) => r.tasks).sort((a, b) => a.start.localeCompare(b.start))
  const now = today()
  const upcoming = all.filter((t) => t.end >= now).slice(0, 12)
  const tooLong = chosen.filter((c) => !c.hardy && c.dtm + (c.out ? Math.max(0, c.out[0]) * 7 : 0) > season)

  // timeline range: at least the frost year, extended to cover every task
  const y = Number(s.lastFrost.slice(0, 4)) || YEAR
  const x0 = Math.min(toDay(`${y}-01-01`), ...all.map((t) => toDay(t.start.slice(0, 8) + '01')))
  const x1 = Math.max(toDay(`${y}-12-31`), ...all.map((t) => toDay(t.end)))
  const W = 1000, LBL = 150, RH = 32, TOP = 34
  const H = TOP + rows.length * RH + 22
  const sx = (d: number) => LBL + ((d - x0) / (x1 - x0)) * (W - LBL - 10)
  const months: { d: number; m: string }[] = []
  for (let d = new Date(x0 * 86400000); d.getTime() / 86400000 <= x1; d.setUTCMonth(d.getUTCMonth() + 1)) months.push({ d: d.getTime() / 86400000, m: MONTHS[d.getUTCMonth()] })

  const setZone = (zone: string) => {
    const z = ZONES.find((x) => x[0] === zone)
    if (!z) return set({ zone })
    set({ zone, lastFrost: `${y}-${z[2]}`, firstFrost: `${y}-${z[3]}` })
  }
  const exportIcs = () => {
    download('planting-calendar.ics', toIcs(all, stampNow()), 'text/calendar')
  }
  const toggle = (n: string) => set({ crops: s.crops.includes(n) ? s.crops.filter((x) => x !== n) : [...s.crops, n] })

  return (
    <Split wide="right">
      <div>
        <Panel title="Frost dates" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Select label="Climate preset" value={s.zone} onChange={setZone} options={[...ZONES.map(([k, l]) => [k, l] as const), ['custom', 'Custom dates'] as const]} />
          <Row>
            <Txt type="date" label="Last spring frost" value={s.lastFrost} onChange={(lastFrost) => set({ lastFrost, zone: 'custom' })} />
            <Txt type="date" label="First fall frost" value={s.firstFrost} onChange={(firstFrost) => set({ firstFrost, zone: 'custom' })} />
          </Row>
          {!valid && <Note tone="err">Enter both dates; the first fall frost must come at least a month after the last spring frost.</Note>}
          <p className="muted" style={{ fontSize: 13 }}>Use your local average dates (weather service or extension office). Many gardeners add a week of safety margin for tender crops.</p>
        </Panel>
        <Panel title={`Crops (${chosen.length})`} actions={<><Btn kind="ghost" onClick={() => set({ crops: CROPS.map((c) => c.n) })}>All</Btn><Btn kind="ghost" onClick={() => set({ crops: [] })}>None</Btn></>}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {CROPS.map((c) => {
              const on = s.crops.includes(c.n)
              return (
                <button key={c.n} type="button" onClick={() => toggle(c.n)} className={`k-btn ${on ? 'primary' : ''}`} style={{ padding: '4px 10px', fontSize: 13 }} title={`${c.dtm} days to maturity${c.hardy ? ', frost-hardy' : ', frost-tender'}`}>
                  {c.e} {c.n}
                </button>
              )
            })}
          </div>
        </Panel>
        <Panel title="Coming up">
          {upcoming.length === 0 ? <p className="muted">Nothing left this season. Try next year's dates.</p> : (
            <Table
              head={['When', 'Task']}
              rows={upcoming.map((t) => {
                const until = toDay(t.start) - toDay(now)
                return [
                  <span key="w" style={{ whiteSpace: 'nowrap' }}>{nice(t.start)}{t.end !== t.start ? `–${nice(t.end)}` : ''}<br /><small className="muted">{until <= 0 ? 'now' : `in ${until} d`}</small></span>,
                  <span key="t"><i style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: COL[t.kind], marginRight: 6 }} />{t.crop}: {kindLabel(t.kind).toLowerCase()}</span>,
                ]
              })}
            />
          )}
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Frost-free season" value={valid ? `${season} days` : '—'} sub={valid ? `${nice(s.lastFrost)} → ${nice(s.firstFrost)}` : undefined} tone="accent" />
          <Stat label="First task" value={all[0] ? nice(all[0].start) : '—'} sub={all[0] ? `${all[0].crop}: ${kindLabel(all[0].kind).toLowerCase()}` : undefined} />
          <Stat label="Tasks" value={all.length} sub={`${chosen.length} crops`} />
        </Stats>
        <Panel
          title="Season timeline"
          actions={
            <>
              <Btn kind="primary" disabled={!all.length} onClick={exportIcs}>📅 ICS</Btn>
              <CsvButton name="planting-calendar.csv" rows={() => [['Crop', 'Task', 'Start', 'End'], ...all.map((t) => [t.crop, kindLabel(t.kind), t.start, t.end])]} />
              <Btn onClick={() => window.print()}>Print</Btn>
            </>
          }
        >
          {tooLong.length > 0 && <Note tone="warn">Short season for {tooLong.map((c) => c.n).join(', ')}: pick early varieties, start indoors or use row covers.</Note>}
          {rows.length === 0 ? <p className="muted">Pick some crops on the left.</p> : (
            <div style={{ overflowX: 'auto' }}>
              <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', minWidth: 680, display: 'block', fontFamily: 'system-ui, sans-serif' }} role="img" aria-label="Planting timeline">
                {months.map(({ d, m }, i) => (
                  <g key={i}>
                    <rect x={sx(d)} y={TOP - 4} width={Math.max(0, sx(d + 30.4) - sx(d))} height={H - TOP} fill={i % 2 ? 'var(--line)' : 'transparent'} opacity={0.35} />
                    <text x={sx(d) + 4} y={20} fontSize={15} fill="var(--muted)">{m}</text>
                  </g>
                ))}
                {rows.map(({ c, tasks }, i) => (
                  <g key={c.n}>
                    <text x={4} y={TOP + i * RH + RH / 2 + 4} fontSize={16} fill="var(--fg)">{c.e} {c.n}</text>
                    {tasks.map((t, j) => {
                      const a = sx(toDay(t.start)), b = sx(toDay(t.end) + 1)
                      const thin = t.kind === 'harvest' || t.kind === 'fall-harvest'
                      const half = c.out && c.dir && (t.kind === 'transplant' || t.kind === 'direct')
                      const top = half ? (t.kind === 'transplant' ? 4 : RH / 2) : thin ? 10 : 5
                      return (
                        <rect key={j} x={a} y={TOP + i * RH + top} width={Math.max(3, b - a)} height={half ? RH / 2 - 5 : thin ? RH - 20 : RH - 10} rx={4} fill={COL[t.kind]} opacity={thin ? 0.75 : 0.95}>
                          <title>{`${c.n}: ${kindLabel(t.kind)} ${nice(t.start)} – ${nice(t.end)}`}</title>
                        </rect>
                      )
                    })}
                  </g>
                ))}
                {valid && ([[s.lastFrost, 'last frost'], [s.firstFrost, 'first frost']] as const).map(([d, l]) => (
                  <g key={l}>
                    <line x1={sx(toDay(d))} x2={sx(toDay(d))} y1={TOP - 6} y2={H} stroke="#38bdf8" strokeWidth={2} strokeDasharray="5 4" />
                    <text x={sx(toDay(d)) + 4} y={H - 2} fontSize={13} fill="#0284c7">❄ {l}</text>
                  </g>
                ))}
                {toDay(now) >= x0 && toDay(now) <= x1 && <line x1={sx(toDay(now))} x2={sx(toDay(now))} y1={TOP - 6} y2={H} stroke="#ef4444" strokeWidth={2}><title>Today</title></line>}
              </svg>
            </div>
          )}
          <Legend items={[...KINDS.map((k) => [kindLabel(k), COL[k]] as [string, string]), ['Today', '#ef4444']]} />
        </Panel>
        <Panel title="Crop details">
          <Table
            head={['Crop', 'Start indoors', 'Plant / sow out', 'Harvest', 'Fall crop']}
            rows={rows.map(({ c, tasks }) => {
              const f = (k: Kind) => {
                const t = tasks.find((x) => x.kind === k)
                return t ? `${nice(t.start)} – ${nice(t.end)}` : '—'
              }
              const out = tasks.find((x) => x.kind === 'transplant') ?? tasks.find((x) => x.kind === 'direct')
              return [`${c.e} ${c.n}`, f('indoor'), out ? `${nice(out.start)} – ${nice(out.end)}` : '—', f('harvest'), f('fall-sow') === '—' ? '—' : `sow ${f('fall-sow')}`]
            })}
          />
          <p className="muted" style={{ fontSize: 13 }}>Timings are typical averages relative to frost dates; varieties differ (check days to maturity on the seed packet). Harvest of frost-tender crops ends at the first frost; hardy crops can carry on a few weeks longer.</p>
        </Panel>
      </div>
    </Split>
  )
}
