import { Btn, CsvButton, LineChart, money, Note, num, Num, Panel, Row, Seg, Select, Slider, Split, Stat, Stats, Table, useToolState } from '../kit'
import { breakEven, co2, evCostPerDist, gasCostPerDist, netTotal, simulate, type Car, type Params } from './lib/ev-vs-gas-comparer'

type State = Params & { currency: string }

const US: State = {
  currency: '$', us: true, years: 8, distance: 12000, growth: 2,
  gasEff: 32, gasPrice: 3.4, evEff: 30, homePrice: 0.16, publicPrice: 0.45, publicShare: 20, chargeLoss: 10, gridCo2: 370,
  ev: { price: 42000, incentive: 7500, maintPerDist: 0.04, insurance: 1900, fees: 120, resalePct: 40 },
  gas: { price: 31000, incentive: 0, maintPerDist: 0.08, insurance: 1650, fees: 90, resalePct: 42 },
}
const EU: State = {
  currency: '€', us: false, years: 8, distance: 15000, growth: 2,
  gasEff: 6.5, gasPrice: 1.75, evEff: 17, homePrice: 0.3, publicPrice: 0.6, publicShare: 25, chargeLoss: 10, gridCo2: 250,
  ev: { price: 41000, incentive: 3000, maintPerDist: 0.025, insurance: 900, fees: 0, resalePct: 40 },
  gas: { price: 32000, incentive: 0, maintPerDist: 0.05, insurance: 850, fees: 250, resalePct: 42 },
}

function CarInputs({ title, c, on, cur, unit }: { title: string; c: Car; on: (p: Partial<Car>) => void; cur: string; unit: string }) {
  return (
    <Panel title={title}>
      <Row>
        <Num label="Purchase price" value={c.price} onChange={(price) => on({ price })} unit={cur} min={0} />
        <Num label="Incentives / rebates" value={c.incentive} onChange={(incentive) => on({ incentive })} unit={cur} min={0} />
      </Row>
      <Row>
        <Num label={`Maintenance per ${unit}`} value={c.maintPerDist} onChange={(maintPerDist) => on({ maintPerDist })} unit={cur} min={0} step={0.005} />
        <Num label="Insurance / year" value={c.insurance} onChange={(insurance) => on({ insurance })} unit={cur} min={0} />
      </Row>
      <Row>
        <Num label="Tax & fees / year" value={c.fees} onChange={(fees) => on({ fees })} unit={cur} min={0} />
        <Num label="Resale value at end" value={c.resalePct} onChange={(resalePct) => on({ resalePct })} unit="%" min={0} max={100} />
      </Row>
    </Panel>
  )
}

export default function EvVsGasComparer() {
  const [s, set, reset] = useToolState('ev-vs-gas-comparer', US)
  const m = (x: number) => money(x, s.currency, 0)
  const unit = s.us ? 'mile' : 'km'
  const ys = simulate(s)
  const net = netTotal(s, ys)
  const be = breakEven(ys)
  const c = co2(s)
  const last = ys[ys.length - 1]
  const sum = (k: 'evEnergy' | 'gasEnergy') => ys.reduce((a, y) => a + y[k], 0)
  const D = s.distance * s.years
  const rows: [string, number, number][] = [
    ['Purchase after incentives', s.ev.price - s.ev.incentive, s.gas.price - s.gas.incentive],
    [s.us ? 'Electricity / gasoline' : 'Electricity / fuel', sum('evEnergy'), sum('gasEnergy')],
    ['Maintenance', s.ev.maintPerDist * D, s.gas.maintPerDist * D],
    ['Insurance', s.ev.insurance * s.years, s.gas.insurance * s.years],
    ['Tax & fees', s.ev.fees * s.years, s.gas.fees * s.years],
    ['Resale value', -(s.ev.price * s.ev.resalePct) / 100, -(s.gas.price * s.gas.resalePct) / 100],
  ]
  const saving = net.gas - net.ev
  const gasSteps = [0.6, 0.8, 1, 1.2, 1.5].map((k) => {
    const p = { ...s, gasPrice: s.gasPrice * k }
    const y = simulate(p)
    const n = netTotal(p, y)
    return [k, p.gasPrice, n.gas - n.ev, breakEven(y)] as const
  })

  return (
    <Split>
      <div>
        <Panel title="Driving & energy">
          <Row>
            <Seg value={s.us ? 'us' : 'metric'} onChange={(v) => set(v === 'us' ? US : EU)} options={[['us', 'US (mi, mpg, $)'], ['metric', 'Metric (km, L, €)']]} />
            <Btn kind="ghost" onClick={reset}>Reset</Btn>
          </Row>
          <Row>
            <Num label="Distance per year" value={s.distance} onChange={(distance) => set({ distance })} unit={s.us ? 'mi' : 'km'} min={0} step={500} />
            <Slider label="Years of ownership" value={s.years} onChange={(years) => set({ years })} min={1} max={15} show={(v) => String(v)} />
          </Row>
          <Row>
            <Num label={s.us ? 'Gas car efficiency' : 'Fuel consumption'} value={s.gasEff} onChange={(gasEff) => set({ gasEff })} unit={s.us ? 'mpg' : 'L/100 km'} min={0.1} />
            <Num label={s.us ? 'Gas price' : 'Fuel price'} value={s.gasPrice} onChange={(gasPrice) => set({ gasPrice })} unit={`${s.currency}/${s.us ? 'gal' : 'L'}`} min={0} step={0.05} />
          </Row>
          <Row>
            <Num label="EV consumption" value={s.evEff} onChange={(evEff) => set({ evEff })} unit={`kWh/100 ${s.us ? 'mi' : 'km'}`} min={1} />
            <Num label="Charging losses" value={s.chargeLoss} onChange={(chargeLoss) => set({ chargeLoss })} unit="%" min={0} max={40} />
          </Row>
          <Row>
            <Num label="Home electricity" value={s.homePrice} onChange={(homePrice) => set({ homePrice })} unit={`${s.currency}/kWh`} min={0} step={0.01} />
            <Num label="Public fast charging" value={s.publicPrice} onChange={(publicPrice) => set({ publicPrice })} unit={`${s.currency}/kWh`} min={0} step={0.01} />
          </Row>
          <Slider label="Share charged in public" value={s.publicShare} onChange={(publicShare) => set({ publicShare })} min={0} max={100} unit="%" show={(v) => String(v)} />
          <Row>
            <Num label="Energy price growth" value={s.growth} onChange={(growth) => set({ growth })} unit="%/yr" />
            <Select label="Grid carbon intensity" value={s.gridCo2} onChange={(gridCo2) => set({ gridCo2 })} options={[[30, 'Very clean (hydro/nuclear) 30 g'], [150, 'Clean 150 g'], [250, 'EU average 250 g'], [370, 'US average 370 g'], [550, 'Coal-heavy 550 g'], [800, 'Mostly coal 800 g']]} />
          </Row>
        </Panel>
        <CarInputs title="⚡ Electric car" c={s.ev} on={(p) => set({ ev: { ...s.ev, ...p } })} cur={s.currency} unit={unit} />
        <CarInputs title="⛽ Gas car" c={s.gas} on={(p) => set({ gas: { ...s.gas, ...p } })} cur={s.currency} unit={unit} />
      </div>
      <div>
        <Stats>
          <Stat label={`EV saves over ${s.years} yr`} value={m(saving)} tone={saving >= 0 ? 'good' : 'bad'} sub="after resale" />
          <Stat label="Break-even" value={be === null ? 'not reached' : be === 0 ? 'day one' : `${num(be, 1)} years`} sub={be === null ? `within ${s.years} years` : `≈ ${num((be ?? 0) * s.distance, 0)} ${unit}s`} tone="accent" />
          <Stat label={`Energy per ${unit}`} value={`${money(evCostPerDist(s), s.currency, 3)} vs ${money(gasCostPerDist(s), s.currency, 3)}`} sub="EV vs gas, year 1" />
          <Stat label="CO₂ per year" value={`${num(c.ev / 1000, 2)} vs ${num(c.gas / 1000, 2)} t`} sub={`EV saves ${num((c.gas - c.ev) / 1000 * s.years, 1)} t over ${s.years} yr`} />
        </Stats>
        <Panel title="Cumulative cost of ownership">
          <LineChart
            series={[
              { name: 'Electric', points: ys.map((y) => [y.year, y.ev]), color: '#10b981', area: true },
              { name: 'Gas', points: ys.map((y) => [y.year, y.gas]), color: '#f97316' },
            ]}
            xLabel="Years"
            fx={(v) => `${v}`}
            fy={(v) => m(v)}
            markers={be !== null && be > 0 ? [{ x: be, label: 'break-even' }] : []}
          />
          <p className="muted" style={{ fontSize: 13 }}>Before resale. The EV usually starts higher (price) and climbs slower (energy & maintenance).</p>
        </Panel>
        <Panel title={`Total over ${s.years} years`} actions={<CsvButton name="ev-vs-gas.csv" rows={() => [['Year', 'EV cumulative', 'Gas cumulative'], ...ys.map((y) => [y.year, Math.round(y.ev), Math.round(y.gas)])]} />}>
          <Table
            head={['', 'Electric', 'Gas', 'Difference']}
            rows={rows.map(([n, e, g]) => [n, m(e), m(g), <span key="d" style={{ color: g - e >= 0 ? 'var(--ok)' : 'var(--err)' }}>{m(g - e)}</span>])}
            foot={['Net cost', m(net.ev), m(net.gas), m(saving)]}
          />
          <p className="muted" style={{ fontSize: 13 }}>Per {unit}: EV {money(net.ev / D, s.currency, 3)}, gas {money(net.gas / D, s.currency, 3)} all-in. Cumulative at year {s.years} before resale: {m(last.ev)} vs {m(last.gas)}.</p>
        </Panel>
        <Panel title="What if gas prices change?">
          <Table
            head={['Gas price', 'EV saving', 'Break-even']}
            rows={gasSteps.map(([k, p, sv, b]) => [
              <b key="p" style={{ fontWeight: k === 1 ? 800 : 400 }}>{money(p, s.currency)}/{s.us ? 'gal' : 'L'}{k === 1 ? ' (now)' : ''}</b>,
              <span key="s" style={{ color: sv >= 0 ? 'var(--ok)' : 'var(--err)' }}>{m(sv)}</span>,
              b === null ? '—' : `${num(b, 1)} yr`,
            ])}
          />
          <Note>Estimates only. Real costs depend on local tariffs (time-of-use rates make home charging cheaper), tyres, battery warranty and financing. Insurance and resale for EVs vary widely by model.</Note>
        </Panel>
      </div>
    </Split>
  )
}
