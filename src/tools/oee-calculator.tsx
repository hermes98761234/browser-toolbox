import { BarChart, Btn, CsvButton, JsonButtons, money, Note, Num, Panel, pct, Ring, Row, Select, Split, Stat, Stats, Table, Txt, uid, useToolState } from '../kit'
import { combine, oee, rating, waterfall, WORLD_CLASS, type OeeResult, type Shift, type Step } from './lib/oee-calculator'

interface State { shifts: Shift[]; sel: string; partValue: number; currency: string }

const DEF: State = {
  sel: 'all',
  partValue: 3.4,
  currency: '$',
  shifts: [
    { id: 's1', name: 'Morning', shiftMin: 480, breakMin: 50, breakdownMin: 22, setupMin: 18, smallStopMin: 14, idealCycleSec: 20, total: 1080, startupRejects: 12, rejects: 19 },
    { id: 's2', name: 'Afternoon', shiftMin: 480, breakMin: 50, breakdownMin: 46, setupMin: 25, smallStopMin: 20, idealCycleSec: 20, total: 940, startupRejects: 15, rejects: 31 },
    { id: 's3', name: 'Night', shiftMin: 480, breakMin: 60, breakdownMin: 9, setupMin: 0, smallStopMin: 26, idealCycleSec: 20, total: 1010, startupRejects: 4, rejects: 41 },
  ],
}

const LOSS_COLOR = '#ef4444'
const TOTAL_COLOR = '#6366f1'

function Waterfall({ steps }: { steps: Step[] }) {
  const W = 760, H = 270, L = 46, B = 64, T = 14
  const max = Math.max(1, steps[0].value)
  const bw = (W - L - 10) / steps.length
  const y = (v: number) => T + (1 - v / max) * (H - T - B)
  // Bar extents: totals stand on zero, each loss hangs from the running level.
  const spans = steps.reduce<{ top: number; bot: number; level: number }[]>((acc, st) => {
    const level = acc.length ? acc[acc.length - 1].level : 0
    acc.push(st.kind === 'total' ? { top: y(st.value), bot: y(0), level: st.value } : { top: y(level), bot: y(level - st.value), level: level - st.value })
    return acc
  }, [])
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }} role="img" aria-label="OEE loss waterfall">
      {[0, 0.25, 0.5, 0.75, 1].map((f) => (
        <g key={f}>
          <line x1={L} x2={W - 10} y1={y(f * max)} y2={y(f * max)} stroke="var(--line)" />
          <text x={L - 6} y={y(f * max) + 4} textAnchor="end" fontSize={11} fill="var(--muted)">{Math.round(f * max)}</text>
        </g>
      ))}
      {steps.map((s, i) => {
        const x = L + i * bw + bw * 0.14
        const w = bw * 0.72
        const { top, bot } = spans[i]
        const words = s.label.split(' ')
        return (
          <g key={s.label}>
            <rect x={x} y={top} width={w} height={Math.max(1, bot - top)} rx={3} fill={s.kind === 'total' ? TOTAL_COLOR : LOSS_COLOR} opacity={s.kind === 'total' ? 1 : 0.85}>
              <title>{`${s.label}: ${s.value.toFixed(1)} min`}</title>
            </rect>
            <text x={x + w / 2} y={top - 4} textAnchor="middle" fontSize={11} fontWeight={600} fill="var(--fg)">{s.kind === 'loss' ? '−' : ''}{s.value.toFixed(0)}</text>
            {words.map((wd, k) => (
              <text key={k} x={x + w / 2} y={H - B + 16 + k * 13} textAnchor="middle" fontSize={11} fill="var(--muted)">{wd}</text>
            ))}
          </g>
        )
      })}
      <text x={L} y={H - 4} fontSize={11} fill="var(--muted)">minutes</text>
    </svg>
  )
}

export default function OeeCalculator() {
  const [s, set, reset] = useToolState('oee-calculator', DEF)
  const results = s.shifts.map((sh) => ({ sh, r: oee(sh) }))
  const all = combine(results.map((x) => x.r))
  const cur = s.shifts.find((x) => x.id === s.sel)
  const r: OeeResult = cur ? oee(cur) : all
  const edit = (p: Partial<Shift>) => cur && set({ shifts: s.shifts.map((x) => (x.id === cur.id ? { ...x, ...p } : x)) })
  const lostParts = r.netRun > 0 ? ((r.planned - r.fullyProductive) / (r.netRun / Math.max(1, r.total))) : 0
  const losses = [
    ['Breakdowns', 'Availability', r.losses.breakdown], ['Setup & adjustments', 'Availability', r.losses.setup],
    ['Small stops', 'Performance', r.losses.smallStops], ['Reduced speed', 'Performance', r.losses.speed],
    ['Startup rejects', 'Quality', r.losses.startupRejects], ['Production rejects', 'Quality', r.losses.prodRejects],
  ] as const
  const biggest = [...losses].sort((a, b) => b[2] - a[2])[0]
  const tone = (v: number, target: number) => (v >= target ? 'good' : v < target * 0.75 ? 'bad' : undefined)
  const errs: string[] = []
  if (cur) {
    const o = oee(cur)
    if (cur.breakMin > cur.shiftMin) errs.push('Planned stops exceed the shift length.')
    if (cur.breakdownMin + cur.setupMin > o.planned) errs.push('Downtime exceeds planned production time.')
    if (o.P > 1.0001) errs.push(`Performance is ${pct(o.P)} — the ideal cycle time is too slow or the count is too high.`)
    if (cur.startupRejects + cur.rejects > cur.total) errs.push('More rejects than parts produced.')
  }

  return (
    <Split>
      <div>
        <Panel title="Shift data" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Select label="Show" value={s.sel} onChange={(sel) => set({ sel })} options={[['all', 'All shifts combined'] as const, ...s.shifts.map((x) => [x.id, x.name] as const)]} />
          <Row>
            <Btn onClick={() => {
              const n: Shift = { ...(cur ?? s.shifts[s.shifts.length - 1] ?? DEF.shifts[0]), id: uid(), name: `Shift ${s.shifts.length + 1}` }
              set({ shifts: [...s.shifts, n], sel: n.id })
            }}>+ Add shift</Btn>
            {cur && s.shifts.length > 1 && <Btn kind="danger" onClick={() => set({ shifts: s.shifts.filter((x) => x.id !== cur.id), sel: 'all' })}>Delete “{cur.name}”</Btn>}
          </Row>
          {!cur && <Note>Pick a shift above to edit it. The combined view sums times and counts (time-weighted), it does not average percentages.</Note>}
          {cur && (
            <>
              <Txt label="Shift name" value={cur.name} onChange={(name) => edit({ name })} />
              <Row>
                <Num label="Shift length" value={cur.shiftMin} onChange={(shiftMin) => edit({ shiftMin })} unit="min" min={0} />
                <Num label="Planned stops" value={cur.breakMin} onChange={(breakMin) => edit({ breakMin })} unit="min" min={0} hint="breaks, meetings, no orders" />
              </Row>
              <Row>
                <Num label="Breakdowns" value={cur.breakdownMin} onChange={(breakdownMin) => edit({ breakdownMin })} unit="min" min={0} />
                <Num label="Setup / changeover" value={cur.setupMin} onChange={(setupMin) => edit({ setupMin })} unit="min" min={0} />
              </Row>
              <Row>
                <Num label="Small stops (< 5 min)" value={cur.smallStopMin} onChange={(smallStopMin) => edit({ smallStopMin })} unit="min" min={0} />
                <Num label="Ideal cycle time" value={cur.idealCycleSec} onChange={(idealCycleSec) => edit({ idealCycleSec })} unit="s/part" min={0} />
              </Row>
              <Row>
                <Num label="Total parts" value={cur.total} onChange={(total) => edit({ total: Math.round(total) })} min={0} />
                <Num label="Startup rejects" value={cur.startupRejects} onChange={(startupRejects) => edit({ startupRejects: Math.round(startupRejects) })} min={0} />
                <Num label="Production rejects" value={cur.rejects} onChange={(rejects) => edit({ rejects: Math.round(rejects) })} min={0} />
              </Row>
              {errs.map((e) => <Note key={e} tone="err">{e}</Note>)}
            </>
          )}
        </Panel>
        <Panel title="Cost of losses">
          <Row>
            <Num label="Value per good part" value={s.partValue} onChange={(partValue) => set({ partValue })} unit={s.currency} min={0} />
            <Select label="Currency" value={s.currency} onChange={(currency) => set({ currency })} options={['$', '€', '£', '₴', 'zł', '¥']} />
          </Row>
          <p style={{ margin: 0 }}>At ideal speed with zero losses this {cur ? 'shift' : 'period'} could have made <b>{Math.round(lostParts).toLocaleString()}</b> more good parts — about <b>{money(lostParts * s.partValue, s.currency, 0)}</b> of output.</p>
        </Panel>
        <Panel title="Formulas">
          <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7, fontSize: 14 }}>
            <li><b>Availability</b> = run time ÷ planned production time</li>
            <li><b>Performance</b> = (ideal cycle × total parts) ÷ run time</li>
            <li><b>Quality</b> = good parts ÷ total parts</li>
            <li><b>OEE</b> = A × P × Q = fully productive time ÷ planned production time</li>
          </ul>
        </Panel>
      </div>
      <div>
        <Panel title={cur ? `OEE — ${cur.name}` : 'OEE — all shifts'}>
          <Row>
            <Ring value={r.oee} size={120} label={<b style={{ fontSize: 22 }}>{pct(r.oee)}</b>} color={r.oee >= 0.85 ? '#10b981' : r.oee >= 0.6 ? '#f59e0b' : '#ef4444'} />
            <div style={{ flex: 1, minWidth: 220 }}>
              <Stats>
                <Stat label="Availability" value={pct(r.A)} sub={`world class ${pct(WORLD_CLASS.A, 0)}`} tone={tone(r.A, WORLD_CLASS.A)} />
                <Stat label="Performance" value={pct(r.P)} sub={`world class ${pct(WORLD_CLASS.P, 0)}`} tone={tone(r.P, WORLD_CLASS.P)} />
                <Stat label="Quality" value={pct(r.Q)} sub={`world class ${pct(WORLD_CLASS.Q, 1)}`} tone={tone(r.Q, WORLD_CLASS.Q)} />
              </Stats>
            </div>
          </Row>
          <p style={{ margin: '8px 0 0' }}><b>{rating(r.oee)}.</b> Good parts {r.good.toLocaleString()} of {r.total.toLocaleString()} · run {r.run.toFixed(0)} of {r.planned.toFixed(0)} planned min. Biggest loss: <b>{biggest[0]}</b> ({biggest[2].toFixed(0)} min).</p>
        </Panel>
        <Panel title="Loss waterfall">
          <Waterfall steps={waterfall(r)} />
        </Panel>
        <Panel title="Six big losses">
          <Table
            head={['Loss', 'Affects', 'Minutes', 'Share of planned']}
            rows={losses.map(([n, a, v]) => [n, a, v.toFixed(1), <div key="b" style={{ minWidth: 120 }}>{pct(v / (r.planned || 1))}<span className="k-bar"><span style={{ width: `${Math.min(100, (v / (r.planned || 1)) * 400)}%`, background: LOSS_COLOR }} /></span></div>])}
          />
        </Panel>
        <Panel title="Shift comparison" actions={<>
          <CsvButton name="oee-shifts.csv" rows={() => [['Shift', 'Planned min', 'Run min', 'Total', 'Good', 'Availability', 'Performance', 'Quality', 'OEE'],
            ...[...results, { sh: { name: 'All shifts' } as Shift, r: all }].map(({ sh, r: x }) => [sh.name, x.planned.toFixed(1), x.run.toFixed(1), x.total, x.good, x.A.toFixed(4), x.P.toFixed(4), x.Q.toFixed(4), x.oee.toFixed(4)])]} />
          <JsonButtons name="oee-shifts.json" data={s} onLoad={(d) => d && Array.isArray(d.shifts) && set(d)} />
        </>}>
          <BarChart height={200} fy={(v) => pct(v, 0)} bars={[...results.map(({ sh, r: x }) => ({ label: sh.name, value: x.oee, color: x.oee >= 0.85 ? '#10b981' : x.oee >= 0.6 ? '#f59e0b' : '#ef4444' })), { label: 'All', value: all.oee, color: TOTAL_COLOR }]} />
          <Table
            head={['Shift', 'A', 'P', 'Q', 'OEE']}
            rows={results.map(({ sh, r: x }) => [<a key="n" href="#" onClick={(e) => { e.preventDefault(); set({ sel: sh.id }) }}>{sh.name}</a>, pct(x.A), pct(x.P), pct(x.Q), <b key="o">{pct(x.oee)}</b>])}
            foot={['All shifts', pct(all.A), pct(all.P), pct(all.Q), pct(all.oee)]}
          />
        </Panel>
      </div>
    </Split>
  )
}
