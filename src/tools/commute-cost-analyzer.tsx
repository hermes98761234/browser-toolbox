import { BarChart, Btn, Check, CsvButton, Note, Num, Panel, Row, Select, Split, Stat, Stats, Table, money, num, uid, useToolState } from '../kit'

interface Mode {
  id: string
  name: string
  on: boolean
  minutes: number // one-way door to door
  perDist: number // running cost per km/mi (fuel, wear, fares by distance)
  perDay: number // parking, tolls, day fares (round trip)
  perYear: number // passes, insurance share, gear
  co2: number // kg CO2 per km/mi
  stress: number // 0–1 share of the time you'd value at full rate (0.5 = reading on the train)
}

interface State {
  currency: string
  unit: 'km' | 'mi'
  dist: number
  days: number
  weeks: number
  wage: number
  wageMode: 'hour' | 'year'
  timeShare: number
  // car helper
  economy: number
  fuel: number
  maint: number
  modes: Mode[]
}

const DEF: State = {
  currency: '$',
  unit: 'km',
  dist: 18,
  days: 5,
  weeks: 46,
  wage: 30,
  wageMode: 'hour',
  timeShare: 50,
  economy: 7.5,
  fuel: 1.6,
  maint: 0.12,
  modes: [
    { id: 'car', name: '🚗 Drive', on: true, minutes: 32, perDist: 0.24, perDay: 8, perYear: 650, co2: 0.17, stress: 1 },
    { id: 'transit', name: '🚆 Train + bus', on: true, minutes: 48, perDist: 0, perDay: 0, perYear: 1080, co2: 0.04, stress: 0.5 },
    { id: 'bike', name: '🚲 E-bike', on: true, minutes: 45, perDist: 0.03, perDay: 0, perYear: 420, co2: 0.008, stress: 0.3 },
    { id: 'ride', name: '🚕 Rideshare', on: true, minutes: 35, perDist: 1.25, perDay: 6, perYear: 0, co2: 0.2, stress: 0.6 },
    { id: 'hybrid', name: '🏠 2 days remote + drive', on: true, minutes: 32, perDist: 0.24, perDay: 8, perYear: 650, co2: 0.17, stress: 1 },
  ],
}

export default function CommuteCostAnalyzer() {
  const [s, set, reset] = useToolState('commute-cost-analyzer', DEF)
  const m = (x: number) => money(x, s.currency, 0)
  const u = s.unit
  const hourly = s.wageMode === 'hour' ? s.wage : s.wage / (52 * 40)
  const carPerDist = (u === 'km' ? s.economy / 100 : 1 / Math.max(1e-9, s.economy)) * s.fuel + s.maint
  const edit = (id: string, p: Partial<Mode>) => set({ modes: s.modes.map((x) => (x.id === id ? { ...x, ...p } : x)) })

  const rows = s.modes.filter((x) => x.on).map((x) => {
    const days = x.id === 'hybrid' ? Math.max(0, s.days - 2) * s.weeks : s.days * s.weeks
    const km = 2 * s.dist * days
    const cash = km * x.perDist + days * x.perDay + x.perYear
    const hours = (2 * x.minutes * days) / 60
    const timeCost = hours * hourly * (s.timeShare / 100) * x.stress
    return { ...x, days, km, cash, hours, timeCost, total: cash + timeCost, perTrip: days ? cash / (2 * days) : 0, co2: km * x.co2, speed: x.minutes ? s.dist / (x.minutes / 60) : 0 }
  })
  const best = [...rows].sort((a, b) => a.total - b.total)[0]
  const cheapest = [...rows].sort((a, b) => a.cash - b.cash)[0]
  const fastest = [...rows].sort((a, b) => a.hours - b.hours)[0]
  const worst = [...rows].sort((a, b) => b.total - a.total)[0]

  return (
    <Split wide="right">
      <div>
        <Panel title="Your commute" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Row>
            <Select label="Units" value={u} onChange={(unit) => set({ unit })} options={[['km', 'Kilometres'], ['mi', 'Miles']]} />
            <Select label="Currency" value={s.currency} onChange={(currency) => set({ currency })} options={['$', '€', '£', '₴', 'zł', '¥', 'CHF ']} />
          </Row>
          <Num label="One-way distance" value={s.dist} onChange={(dist) => set({ dist })} unit={u} min={0} />
          <Row>
            <Num label="Days per week" value={s.days} onChange={(days) => set({ days: Math.min(7, Math.max(0, days)) })} min={0} max={7} />
            <Num label="Working weeks / year" value={s.weeks} onChange={(weeks) => set({ weeks: Math.min(52, Math.max(0, weeks)) })} min={0} max={52} hint="minus holidays" />
          </Row>
        </Panel>
        <Panel title="Value of your time">
          <Row>
            <Select label="Pay given as" value={s.wageMode} onChange={(wageMode) => set({ wageMode, wage: wageMode === 'year' ? Math.round(s.wage * 2080) : Math.round((s.wage / 2080) * 100) / 100 })} options={[['hour', 'Hourly'], ['year', 'Yearly salary']]} />
            <Num label={s.wageMode === 'hour' ? 'Hourly wage' : 'Gross salary'} value={s.wage} onChange={(wage) => set({ wage })} unit={s.currency} min={0} />
          </Row>
          <Num label="Count commute time at" value={s.timeShare} onChange={(timeShare) => set({ timeShare })} unit="% of wage" min={0} max={200} hint="Transport economists typically use 35–50 %" />
          <p className="muted" style={{ fontSize: 13 }}>= {money(hourly * s.timeShare / 100, s.currency)} per hour behind the wheel. Each mode's “time weight” lowers it when you can read, rest or exercise.</p>
        </Panel>
        <Panel title="Car cost helper">
          <Row>
            <Num label={u === 'km' ? 'Fuel use' : 'Fuel economy'} value={s.economy} onChange={(economy) => set({ economy })} unit={u === 'km' ? 'L/100 km' : 'mpg'} min={0.1} />
            <Num label="Fuel price" value={s.fuel} onChange={(fuel) => set({ fuel })} unit={`${s.currency}/${u === 'km' ? 'L' : 'gal'}`} min={0} />
          </Row>
          <Num label="Tyres, maintenance, depreciation" value={s.maint} onChange={(maint) => set({ maint })} unit={`${s.currency}/${u}`} min={0} hint="AAA estimates ≈ $0.10–0.25 per mile" />
          <Row>
            <b>{money(carPerDist, s.currency)} per {u}</b>
            <Btn onClick={() => set({ modes: s.modes.map((x) => (x.id === 'car' || x.id === 'hybrid' ? { ...x, perDist: Math.round(carPerDist * 1000) / 1000 } : x)) })}>Apply to car modes</Btn>
          </Row>
        </Panel>
      </div>

      <div>
        {best && (
          <Stats>
            <Stat label="Best overall" value={<span style={{ fontSize: 17 }}>{best.name}</span>} sub={`${m(best.total)} / year incl. time`} tone="good" />
            <Stat label="Cheapest cash" value={<span style={{ fontSize: 17 }}>{cheapest.name}</span>} sub={`${m(cheapest.cash)} / year`} />
            <Stat label="Fastest" value={<span style={{ fontSize: 17 }}>{fastest.name}</span>} sub={`${num(fastest.hours, 0)} h / year`} />
            <Stat label="Switch saves" value={m(worst.total - best.total)} sub={`vs ${worst.name}`} tone="accent" />
          </Stats>
        )}
        <Panel title="True yearly cost (cash + time)">
          {rows.length ? (
            <BarChart
              height={260}
              fy={(v) => m(v)}
              stacks={[{ name: 'Cash cost', color: '#6366f1' }, { name: 'Value of time', color: '#f59e0b' }]}
              bars={rows.map((r) => ({ label: r.name.replace(/^\S+\s/, ''), value: [r.cash, r.timeCost] }))}
            />
          ) : (
            <Note>Enable at least one mode.</Note>
          )}
        </Panel>
        <Panel
          title="Comparison"
          actions={<CsvButton name="commute-costs.csv" rows={() => [['Mode', 'Days/yr', `Distance (${u})`, 'Cash/yr', 'Hours/yr', 'Time value/yr', 'True total/yr', 'Per trip', 'CO2 kg/yr'], ...rows.map((r) => [r.name, r.days, Math.round(r.km), Math.round(r.cash), Math.round(r.hours), Math.round(r.timeCost), Math.round(r.total), r.perTrip.toFixed(2), Math.round(r.co2)])]} />}
        >
          <Table
            head={['Mode', 'Cash / yr', 'Hours / yr', 'Time value', 'True total', 'Per trip', 'CO₂']}
            rows={rows.map((r) => [
              <b key="n" style={{ color: r.id === best?.id ? 'var(--ok)' : undefined }}>{r.name}</b>,
              m(r.cash),
              `${num(r.hours, 0)} h`,
              m(r.timeCost),
              <b key="t">{m(r.total)}</b>,
              money(r.perTrip, s.currency),
              `${num(r.co2, 0)} kg`,
            ])}
          />
          {best && (
            <p className="muted" style={{ fontSize: 13 }}>
              Over 10 years, choosing {best.name} instead of {worst.name} frees up {m((worst.total - best.total) * 10)} of cash and time
              {worst.hours > best.hours ? ` and ${num((worst.hours - best.hours) * 10 / 24, 0)} full days of your life` : ''}.
            </p>
          )}
        </Panel>
        <Panel title="Modes" actions={<Btn onClick={() => set({ modes: [...s.modes, { id: uid(), name: '🛴 New mode', on: true, minutes: 30, perDist: 0.1, perDay: 0, perYear: 0, co2: 0.05, stress: 1 }] })}>+ Mode</Btn>}>
          <Table
            head={['On', 'Mode', 'Min one-way', `${s.currency}/${u}`, `${s.currency}/day`, `${s.currency}/year`, 'Time weight', 'kg CO₂/' + u, '']}
            rows={s.modes.map((x) => [
              <Check key="o" label="" value={x.on} onChange={(on) => edit(x.id, { on })} />,
              <input key="n" value={x.name} onChange={(e) => edit(x.id, { name: e.target.value })} aria-label="Mode name" style={{ width: 150 }} />,
              ...(['minutes', 'perDist', 'perDay', 'perYear', 'stress', 'co2'] as const).map((k) => (
                <input key={k} type="number" min={0} step={k === 'stress' ? 0.1 : 'any'} value={x[k]} onChange={(e) => edit(x.id, { [k]: Math.max(0, Number(e.target.value) || 0) })} aria-label={k} style={{ width: 70 }} />
              )),
              <Btn key="x" kind="ghost" title="Remove" onClick={() => set({ modes: s.modes.filter((y) => y.id !== x.id) })}>✕</Btn>,
            ])}
          />
          <p className="muted" style={{ fontSize: 12 }}>
            Per-{u} covers fuel, wear and distance fares; per-day covers parking, tolls and day tickets (round trip); per-year covers passes, insurance share or gear. Time weight 1 = time fully lost (driving), 0.5 = half useful (reading on a train), 0.3 = doubles as exercise.
          </p>
        </Panel>
      </div>
    </Split>
  )
}
