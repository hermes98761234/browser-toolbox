import { Bar, BarChart, Btn, Check, color, CsvButton, LineChart, money, Note, Num, Panel, Row, Select, Split, Stat, Stats, Table, Txt, useToolState } from '../kit'
import { MACRS, METHOD_NAMES, schedule, type Input, type Method } from './lib/depreciation-calculator'

const DEF = {
  asset: 'Delivery van',
  currency: '$',
  cost: 42000,
  salvage: 6000,
  life: 5,
  startYear: 2026,
  startMonth: 4, // April: 9 months in service in the first year
  method: 'db' as Method,
  factor: 2,
  switchToSl: true,
  totalUnits: 150000,
  units: [24000, 32000, 30000, 28000, 22000, 14000],
  macrs: 5,
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const ALL: Method[] = ['sl', 'db', 'syd', 'units', 'macrs']

export default function DepreciationCalculator() {
  const [s, set, reset] = useToolState('depreciation-calculator', DEF)
  const m = (x: number) => money(x, s.currency, 0)
  const input: Input = { ...s, months: 13 - s.startMonth }
  const rows = schedule(input, s.method)
  const total = rows.reduce((a, r) => a + r.dep, 0)
  const last = rows[rows.length - 1]
  const bad = s.cost <= 0 || s.salvage < 0 || s.salvage >= s.cost || s.life < 1
  const label = (y: number) => String(s.startYear + y - 1)
  const desc: Record<Method, string> = {
    sl: `Equal charge each year: (cost − salvage) ÷ life = ${m((s.cost - s.salvage) / Math.max(1, s.life))} per full year.`,
    db: `Book value × ${s.factor} ÷ ${s.life} = ${((s.factor / Math.max(1, s.life)) * 100).toFixed(1)}% a year, never below salvage${s.switchToSl ? ', switching to straight-line when that gives more' : ''}.`,
    syd: `Charge = (cost − salvage) × remaining life ÷ ${(s.life * (s.life + 1)) / 2} (sum of 1…${s.life}). Front-loaded, but gentler than double declining.`,
    units: `Rate = (cost − salvage) ÷ ${s.totalUnits.toLocaleString()} units = ${money((s.cost - s.salvage) / Math.max(1, s.totalUnits), s.currency, 4)} per unit.`,
    macrs: `IRS GDS ${s.macrs}-year property, 200%/150% declining balance, half-year convention (Pub. 946 table A-1). Salvage is ignored.`,
  }

  return (
    <Split wide="right">
      <div>
        <Panel title="Asset" actions={<Btn kind="ghost" onClick={reset}>Example</Btn>}>
          <Txt label="Name" value={s.asset} onChange={(asset) => set({ asset })} />
          <Row>
            <Num label="Cost" value={s.cost} onChange={(cost) => set({ cost })} unit={s.currency} min={0} />
            <Num label="Salvage value" value={s.salvage} onChange={(salvage) => set({ salvage })} unit={s.currency} min={0} />
          </Row>
          <Row>
            <Num label="Useful life" value={s.life} onChange={(life) => set({ life: Math.max(1, Math.round(life)) })} unit="years" min={1} max={50} />
            <Select label="Currency" value={s.currency} onChange={(currency) => set({ currency })} options={['$', '€', '£', '₴', 'zł', '¥', 'CHF ', '₹']} />
          </Row>
          <Row>
            <Select label="Placed in service" value={s.startMonth} onChange={(startMonth) => set({ startMonth })} options={MONTHS.map((n, i) => [i + 1, n] as [number, string])} />
            <Num label="Fiscal year" value={s.startYear} onChange={(startYear) => set({ startYear: Math.round(startYear) })} />
          </Row>
          {bad && <Note tone="err">Cost must be positive and larger than the salvage value; life at least 1 year.</Note>}
        </Panel>
        <Panel title="Method">
          <Select label="Depreciation method" value={s.method} onChange={(method) => set({ method })} options={ALL.map((k) => [k, METHOD_NAMES[k]] as [Method, string])} />
          {s.method === 'db' && (
            <>
              <Select label="Rate" value={s.factor} onChange={(factor) => set({ factor })} options={[[2, 'Double declining (200%)'], [1.5, '150% declining'], [1.25, '125% declining'], [1, '100% declining']]} />
              <Check label="Switch to straight-line when it is larger" value={s.switchToSl} onChange={(switchToSl) => set({ switchToSl })} />
            </>
          )}
          {s.method === 'macrs' && <Select label="Recovery period" value={s.macrs} onChange={(macrs) => set({ macrs })} options={Object.keys(MACRS).map((k) => [Number(k), `${k}-year property`] as [number, string])} />}
          {s.method === 'units' && (
            <>
              <Num label="Total expected units (km, hours, pieces…)" value={s.totalUnits} onChange={(totalUnits) => set({ totalUnits })} min={1} />
              <div className="k-label" style={{ margin: '6px 0' }}>Units per year</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 8 }}>
                {s.units.map((u, k) => (
                  <Num key={k} label={label(k + 1)} value={u} onChange={(v) => set({ units: s.units.map((x, j) => (j === k ? v : x)) })} min={0} />
                ))}
              </div>
              <Row>
                <Btn onClick={() => set({ units: [...s.units, 0] })}>+ Year</Btn>
                <Btn kind="ghost" disabled={s.units.length < 2} onClick={() => set({ units: s.units.slice(0, -1) })}>− Year</Btn>
                <span className="muted">Used: {s.units.reduce((a, b) => a + b, 0).toLocaleString()} / {s.totalUnits.toLocaleString()}</span>
              </Row>
            </>
          )}
          <Note>{desc[s.method]}</Note>
          {s.startMonth > 1 && ['sl', 'db', 'syd'].includes(s.method) && (
            <p className="muted" style={{ margin: 0 }}>
              In service from {MONTHS[s.startMonth - 1]}: the first year gets {13 - s.startMonth}/12 of a full year’s charge, and the schedule runs one extra year.
            </p>
          )}
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label={`First year (${s.startYear})`} value={m(rows[0]?.dep ?? 0)} tone="accent" />
          <Stat label="Total depreciation" value={m(total)} sub={`over ${rows.length} years`} />
          <Stat label="Final book value" value={m(last?.book ?? s.cost)} />
          <Stat label="Average per year" value={m(total / Math.max(1, rows.length))} />
        </Stats>
        <Panel
          title={`${METHOD_NAMES[s.method]} schedule${s.asset ? ` · ${s.asset}` : ''}`}
          actions={<CsvButton name="depreciation-schedule.csv" rows={() => [['Year', 'Depreciation', 'Accumulated', 'Book value'], ...rows.map((r) => [label(r.year), r.dep, r.accum, r.book])]} />}
        >
          <Table
            head={['Year', 'Depreciation', 'Accumulated', 'Book value (end)', '']}
            rows={rows.map((r) => [label(r.year), m(r.dep), m(r.accum), <b key="b">{m(r.book)}</b>, <div key="v" style={{ minWidth: 90 }}><Bar value={r.book} max={s.cost} /></div>])}
            foot={['Total', m(total), '', '', '']}
          />
        </Panel>
        <Panel title="Annual charge">
          <BarChart height={200} fy={m} bars={rows.map((r) => ({ label: label(r.year), value: r.dep }))} />
        </Panel>
        <Panel title="Book value: all methods compared">
          <LineChart
            height={260}
            fx={(v) => String(Math.round(v))}
            fy={m}
            series={ALL.map((k, i) => ({
              name: METHOD_NAMES[k],
              color: color(i),
              dashed: k !== s.method,
              points: [[s.startYear - 1, s.cost] as [number, number], ...schedule(input, k).map((r) => [s.startYear + r.year - 1, r.book] as [number, number])],
            }))}
          />
        </Panel>
      </div>
    </Split>
  )
}
