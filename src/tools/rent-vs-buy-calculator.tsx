import { Btn, CsvButton, LineChart, money, Note, Num, Panel, Row, Select, Slider, Split, Stat, Stats, Table, useToolState } from '../kit'
import { simulate, type Inputs } from './lib/rent-vs-buy-calculator'

const DEF: Inputs & { cur: string } = {
  cur: '$',
  price: 400000, downPct: 20, rate: 6.5, term: 30, closingPct: 3, sellPct: 6,
  taxPct: 1.1, insurance: 1800, maintPct: 1, hoa: 0, appreciation: 3.5,
  rent: 2200, rentGrowth: 3.5, rentersIns: 200,
  invest: 6, inflation: 2.5, years: 15, pmiPct: 0.5, deductPct: 0,
}

const SCENARIOS: [string, Partial<Inputs>][] = [
  ['Balanced', { appreciation: 3.5, rentGrowth: 3.5, invest: 6, rate: 6.5 }],
  ['Hot housing market', { appreciation: 6, rentGrowth: 5, invest: 6 }],
  ['Flat prices', { appreciation: 1, rentGrowth: 2, invest: 7 }],
  ['Low rates (2021)', { rate: 3, appreciation: 4 }],
  ['Short stay (5 yrs)', { years: 5 }],
]

export default function RentVsBuyCalculator() {
  const [s, set, reset] = useToolState('rent-vs-buy-calculator', DEF)
  const m = (x: number, d = 0) => money(x, s.cur, d)
  const sim = simulate(s)
  const last = sim.rows[sim.rows.length - 1]
  const diff = last ? last.buyNW - last.rentNW : 0
  const firstOwn = sim.rows[0]?.buyCost / 12 || 0
  const short = (v: number) => (Math.abs(v) >= 1e6 ? `${s.cur}${(v / 1e6).toFixed(1)}M` : Math.abs(v) >= 1e3 ? `${s.cur}${(v / 1e3).toFixed(0)}k` : `${s.cur}${v.toFixed(0)}`)
  const N = (k: keyof Inputs, label: string, unit?: string, step?: number) => (
    <Num label={label} unit={unit} value={s[k]} min={0} step={step} onChange={(v) => set({ [k]: Math.max(0, v) } as Partial<typeof s>)} />
  )

  return (
    <Split>
      <div>
        <Panel title="Scenario">
          <Row>
            {SCENARIOS.map(([n, p]) => (
              <Btn key={n} onClick={() => set(p)}>{n}</Btn>
            ))}
          </Row>
          <Slider label="Years you expect to stay" value={s.years} min={1} max={40} onChange={(years) => set({ years })} unit=" yrs" show={(v) => String(v)} />
        </Panel>
        <Panel title="Buying">
          <Row>
            {N('price', 'Home price', s.cur)}
            {N('downPct', 'Down payment', '%')}
          </Row>
          <Row>
            {N('rate', 'Mortgage rate', '%')}
            <Select label="Term" value={s.term} onChange={(term) => set({ term })} options={[[15, '15 years'], [20, '20 years'], [30, '30 years']]} />
          </Row>
          <Row>
            {N('closingPct', 'Closing costs', '%')}
            {N('sellPct', 'Selling costs', '%')}
          </Row>
          <Row>
            {N('taxPct', 'Property tax', '%/yr')}
            {N('maintPct', 'Maintenance', '%/yr')}
          </Row>
          <Row>
            {N('insurance', 'Home insurance', `${s.cur}/yr`)}
            {N('hoa', 'HOA / condo fee', `${s.cur}/mo`)}
          </Row>
          <Row>
            {N('appreciation', 'Home appreciation', '%/yr')}
            {N('pmiPct', 'PMI (if < 20% down)', '%/yr')}
          </Row>
        </Panel>
        <Panel title="Renting & investing">
          <Row>
            {N('rent', 'Monthly rent', s.cur)}
            {N('rentGrowth', 'Rent increase', '%/yr')}
          </Row>
          <Row>
            {N('rentersIns', "Renter's insurance", `${s.cur}/yr`)}
            {N('invest', 'Investment return', '%/yr')}
          </Row>
          <Row>
            {N('inflation', 'Inflation (fees)', '%/yr')}
            {N('deductPct', 'Tax rate on deductions', '%')}
          </Row>
          <Row>
            <Select label="Currency" value={s.cur} onChange={(cur) => set({ cur })} options={['$', '€', '£', 'C$', 'A$', '₴', 'zł']} />
            <Btn kind="ghost" onClick={reset}>Reset</Btn>
          </Row>
          <p className="muted" style={{ fontSize: 13 }}>Tax rate on deductions: set your marginal rate only if you itemize mortgage interest and property tax; leave 0 otherwise.</p>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label={`After ${s.years} years`} value={diff >= 0 ? 'Buying wins' : 'Renting wins'} sub={`by ${m(Math.abs(diff))} net worth`} tone={diff >= 0 ? 'good' : 'accent'} />
          <Stat label="Break-even" value={sim.breakEven ? `Year ${sim.breakEven}` : `> ${s.years} yrs`} sub="when buying pulls ahead" />
          <Stat label="Mortgage P&I" value={m(sim.pay)} sub={`on ${m(sim.loan)} loan`} />
          <Stat label="Owning, month 1" value={m(firstOwn)} sub={`vs rent ${m(s.rent + s.rentersIns / 12)}`} />
        </Stats>
        <Panel title="Net worth over time">
          <LineChart
            series={[
              { name: 'Buy: equity after sale costs + invested savings', points: sim.rows.map((r) => [r.year, r.buyNW]), color: '#6366f1', area: true },
              { name: 'Rent: invested down payment + savings', points: sim.rows.map((r) => [r.year, r.rentNW]), color: '#f59e0b' },
            ]}
            xLabel="Year"
            fx={(v) => String(Math.round(v))}
            fy={short}
            markers={sim.breakEven ? [{ x: sim.breakEven, label: 'break-even' }] : []}
            height={280}
          />
          <Note>
            Both paths start with the same {m(sim.upfront)} (down payment + closing costs). Each month, whichever option is cheaper invests the difference at {s.invest}%/yr, so the comparison uses equal money.
          </Note>
        </Panel>
        <Panel title="Yearly cash cost">
          <LineChart
            series={[
              { name: 'Owning cost', points: sim.rows.map((r) => [r.year, r.buyCost]), color: '#6366f1' },
              { name: 'Owning cost minus principal paid', points: sim.rows.map((r, i) => [r.year, r.buyCost - ((i ? sim.rows[i - 1].balance : sim.loan) - r.balance)]), color: '#6366f1', dashed: true },
              { name: 'Renting cost', points: sim.rows.map((r) => [r.year, r.rentCost]), color: '#f59e0b' },
            ]}
            xLabel="Year"
            fx={(v) => String(Math.round(v))}
            fy={short}
            height={220}
          />
          <p className="muted" style={{ fontSize: 13 }}>Owning = principal & interest, PMI, tax, insurance, maintenance and HOA. The dashed line removes principal, which builds equity rather than being spent.</p>
        </Panel>
        <Panel title="Year by year" actions={<CsvButton name="rent-vs-buy.csv" rows={() => [['Year', 'Home value', 'Mortgage balance', 'Owning cost', 'Renting cost', 'Buyer net worth', 'Renter net worth'], ...sim.rows.map((r) => [r.year, r.homeValue.toFixed(0), r.balance.toFixed(0), r.buyCost.toFixed(0), r.rentCost.toFixed(0), r.buyNW.toFixed(0), r.rentNW.toFixed(0)])]} />}>
          <Table
            max={15}
            head={['Year', 'Home value', 'Loan left', 'Own cost', 'Rent cost', 'Buy NW', 'Rent NW']}
            rows={sim.rows.map((r) => [r.year, m(r.homeValue), m(r.balance), m(r.buyCost), m(r.rentCost), <b key="b" style={{ color: r.buyNW >= r.rentNW ? 'var(--ok)' : undefined }}>{m(r.buyNW)}</b>, <b key="r" style={{ color: r.rentNW > r.buyNW ? 'var(--warn)' : undefined }}>{m(r.rentNW)}</b>])}
          />
          <p className="muted" style={{ fontSize: 13 }}>Ignores capital-gains tax on investments and on the home sale. Figures are nominal (not inflation-adjusted).</p>
        </Panel>
      </div>
    </Split>
  )
}
