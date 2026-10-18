import { Btn, CsvButton, LineChart, money, Note, Num, Panel, pct, num, Row, Seg, Select, Split, Stat, Stats, Table, useToolState } from '../kit'
import { CROPS, LB_PER_KG, pointFactor, shrink } from './lib/grain-moisture-shrink-calculator'

type Unit = 'bu' | 'lb' | 'kg' | 't' | 'ton'
const UNITS: [Unit, string][] = [['bu', 'Wet bushels'], ['lb', 'Pounds'], ['kg', 'Kilograms'], ['t', 'Metric tonnes'], ['ton', 'Short tons']]
const TO_LB: Record<Exclude<Unit, 'bu'>, number> = { lb: 1, kg: LB_PER_KG, t: 1000 * LB_PER_KG, ton: 2000 }

const DEF = {
  crop: 'corn',
  unit: 'bu' as Unit,
  amount: 10000,
  m0: 22,
  m1: 15.5,
  handling: 0.5,
  method: 'exact' as 'exact' | 'factor',
  factor: 1.4,
  price: 4.35,
  dryCost: 0.045,
  currency: '$',
}

export default function GrainMoistureShrinkCalculator() {
  const [s, set, reset] = useToolState('grain-moisture-shrink-calculator', DEF)
  const crop = CROPS.find((c) => c.id === s.crop) ?? CROPS[0]
  const lbPerBu = crop.lbPerBu
  const wetLb = s.unit === 'bu' ? s.amount * lbPerBu : s.amount * TO_LB[s.unit]
  const valid = s.m0 >= 0 && s.m0 < 60 && s.m1 >= 0 && s.m1 < 40 && wetLb >= 0
  const r = shrink({ wetWeight: wetLb, m0: s.m0, m1: s.m1, handling: s.handling, method: s.method, factor: s.factor })
  const wetBu = wetLb / lbPerBu
  const dryBu = r.dryWeight / lbPerBu
  const lostBu = wetBu - dryBu
  const m = (x: number) => money(x, s.currency)
  const grossDry = dryBu * s.price
  const dryingCost = r.points * wetBu * s.dryCost
  const net = grossDry - dryingCost
  const naive = wetBu * s.price
  const out = (lb: number) => (s.unit === 'bu' || s.unit === 'lb' ? `${num(lb, 0)} lb` : `${num(lb / TO_LB[s.unit], s.unit === 'kg' ? 0 : 2)} ${s.unit}`)

  const sched = Array.from({ length: 16 }, (_, i) => s.m1 + i)
  const rowAt = (m0: number) => {
    const x = shrink({ wetWeight: wetLb, m0, m1: s.m1, handling: s.handling, method: s.method, factor: s.factor })
    const bu = x.dryWeight / lbPerBu
    return { m0, total: x.total, bu, value: bu * s.price - x.points * wetBu * s.dryCost }
  }
  const rows = sched.map(rowAt)

  return (
    <Split>
      <div>
        <Panel title="Grain lot">
          <Select label="Crop" value={s.crop} onChange={(c) => { const k = CROPS.find((x) => x.id === c)!; set({ crop: c, m1: k.base, factor: k.factor }) }} options={CROPS.map((c) => [c.id, `${c.name} · ${c.lbPerBu} lb/bu`] as [string, string])} />
          <Row>
            <Num label="Wet amount" value={s.amount} onChange={(amount) => set({ amount })} min={0} />
            <Select label="Unit" value={s.unit} onChange={(unit) => set({ unit })} options={UNITS} />
          </Row>
          <Row>
            <Num label="Harvest moisture" value={s.m0} onChange={(m0) => set({ m0 })} unit="%" min={0} max={60} />
            <Num label="Target moisture" value={s.m1} onChange={(m1) => set({ m1 })} unit="%" min={0} max={40} />
          </Row>
          <p className="muted" style={{ margin: '0 0 4px', fontSize: 12.5 }}>Market base moisture for {crop.name.toLowerCase()}: {crop.base}% · standard test weight {crop.lbPerBu} lb/bu</p>
        </Panel>
        <Panel title="Shrink method">
          <Seg value={s.method} onChange={(method) => set({ method })} options={[['exact', 'Exact (water only)'], ['factor', 'Elevator factor']]} />
          {s.method === 'factor' ? (
            <Num label="Shrink factor" value={s.factor} onChange={(factor) => set({ factor })} unit="% / point" min={0} max={5} hint="Elevators often quote 1.2–1.5 % per point; it usually already includes handling." />
          ) : (
            <Note>Exact water shrink = (M₀ − M₁) ÷ (100 − M₁). At {s.m1}% target that is <b>{num(pointFactor(s.m1), 3)}% per point</b>.</Note>
          )}
          <Num label="Handling (invisible) loss" value={s.handling} onChange={(handling) => set({ handling })} unit="%" min={0} max={5} hint="Dust, fines and dry matter lost in drying and handling; 0.5–1% is typical." />
        </Panel>
        <Panel title="Price impact">
          <Row>
            <Num label="Price per dry bushel" value={s.price} onChange={(price) => set({ price })} unit={s.currency} min={0} />
            <Num label="Drying cost" value={s.dryCost} onChange={(dryCost) => set({ dryCost })} unit={`${s.currency}/pt/bu`} min={0} />
          </Row>
          <Select label="Currency" value={s.currency} onChange={(currency) => set({ currency })} options={['$', '€', '£', 'C$', 'A$', '₴']} />
          <Btn kind="ghost" onClick={reset}>Reset</Btn>
        </Panel>
      </div>
      <div>
        {!valid && <Note tone="err">Check the moisture values: they must be between 0 and 60% (target below 40%).</Note>}
        {s.m0 <= s.m1 && <Note tone="warn">Grain is already at or below the target moisture: no drying shrink applies (overdried grain is usually not paid a premium).</Note>}
        <Stats>
          <Stat label="Points removed" value={num(r.points, 1)} sub={`${s.m0}% → ${s.m1}%`} />
          <Stat label="Total shrink" value={pct(r.total, 2)} sub={`water ${pct(r.water, 2)} + handling ${pct(r.total - r.water, 2)}`} tone="accent" />
          <Stat label="Dry bushels" value={num(dryBu, 1)} sub={`from ${num(wetBu, 1)} wet bu · −${num(lostBu, 1)} bu`} />
          <Stat label="Net value" value={m(net)} sub={`${m(grossDry)} − drying ${m(dryingCost)}`} tone={net >= 0 ? 'good' : 'bad'} />
        </Stats>
        <Panel title="Weight balance">
          <Table
            head={['', 'Weight', 'Bushels', 'Share of wet']}
            rows={[
              ['Wet grain delivered', out(wetLb), num(wetBu, 1), '100%'],
              ['Water evaporated', out(r.waterLost), num(r.waterLost / lbPerBu, 1), pct(r.water, 2)],
              ['Handling loss', out(r.handlingLost), num(r.handlingLost / lbPerBu, 1), pct(r.total - r.water, 2)],
              [<b key="d">Dry grain at {s.m1}%</b>, <b key="w">{out(r.dryWeight)}</b>, <b key="b">{num(dryBu, 1)}</b>, pct(1 - r.total, 2)],
            ]}
          />
          <Note tone="info">
            Shrink costs <b>{m(naive - grossDry)}</b> compared with paying for the wet bushels at {m(s.price)}, plus {m(dryingCost)} drying. Effective value per wet bushel: <b>{m(wetBu ? net / wetBu : 0)}</b>.
          </Note>
        </Panel>
        <Panel title="Dry bushels vs harvest moisture" actions={<CsvButton name="grain-shrink-schedule.csv" rows={() => [['Harvest moisture %', 'Total shrink %', 'Dry bushels', 'Net value'], ...rows.map((x) => [x.m0, +(x.total * 100).toFixed(3), +x.bu.toFixed(2), +x.value.toFixed(2)])]} />}>
          <LineChart
            series={[{ name: 'Dry bushels', points: rows.map((x) => [x.m0, x.bu]), area: true }]}
            xLabel="Harvest moisture %"
            fy={(v) => num(v, 0)}
            yMin={Math.floor(Math.min(...rows.map((x) => x.bu)) * 0.95)}
            markers={[{ x: s.m0, label: 'this lot' }]}
          />
          <Table
            head={['Harvest %', 'Shrink', 'Dry bu', 'Net value']}
            rows={rows.filter((_, i) => i % 2 === 0 || rows[i].m0 === s.m0).map((x) => [`${num(x.m0, 1)}%`, pct(x.total, 2), num(x.bu, 1), m(x.value)])}
          />
        </Panel>
        <Note tone="info">Moisture is on a wet basis (share of total weight). Dry matter is conserved: dry weight = wet weight × (100 − M₀) ÷ (100 − M₁). Contract terms vary; check your elevator's shrink schedule.</Note>
      </div>
    </Split>
  )
}
