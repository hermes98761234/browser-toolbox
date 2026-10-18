import { Btn, CsvButton, LineChart, money, Note, Num, Panel, pct, Row, Seg, Select, Slider, Split, Stat, Stats, Table, num, useToolState } from '../kit'
import { CONDITION, halfLife, PRESETS, rateAt, schedule } from './lib/car-depreciation-calculator'

const DEF = {
  cur: '$',
  unit: 'mi' as 'mi' | 'km',
  price: 32000,
  ageAtPurchase: 0,
  odoAtPurchase: 0,
  years: 8,
  sellYear: 5,
  perYear: 15000,
  expected: 12000,
  k: 0.4,
  preset: 'avg',
  rates: PRESETS[0].rates,
  condition: 0,
}

export default function CarDepreciationCalculator() {
  const [s, set, reset] = useToolState('car-depreciation-calculator', DEF)
  const m = (x: number) => money(x, s.cur, 0)
  const valid = s.price > 0 && s.years >= 1 && s.years <= 30
  const input = { price: s.price, ageAtPurchase: Math.max(0, Math.round(s.ageAtPurchase)), odoAtPurchase: s.odoAtPurchase, years: Math.round(s.years), perYear: s.perYear, expectedPerYear: s.expected, kPer1000: s.k, rates: s.rates, condition: s.condition }
  const rows = valid ? schedule(input) : []
  const plain = valid ? schedule({ ...input, perYear: s.expected, odoAtPurchase: s.expected * input.ageAtPurchase, condition: 0 }) : []
  const sell = rows[Math.min(rows.length - 1, Math.max(1, Math.round(s.sellYear)))]
  const hl = halfLife(s.price, input.ageAtPurchase, s.rates)
  const setRate = (i: number, v: number) => set({ rates: s.rates.map((r, j) => (j === i ? Math.min(90, Math.max(0, v)) : r)), preset: 'custom' })
  const switchUnit = (unit: 'mi' | 'km') => {
    if (unit === s.unit) return
    const f = unit === 'km' ? 1.609344 : 1 / 1.609344
    set({ unit, perYear: Math.round(s.perYear * f), expected: Math.round(s.expected * f), odoAtPurchase: Math.round(s.odoAtPurchase * f), k: Math.round((s.k / f) * 1000) / 1000 })
  }

  return (
    <Split wide="right">
      <div>
        <Panel title="Your car" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Row>
            <Num label="Price paid" value={s.price} onChange={(price) => set({ price })} unit={s.cur} min={1} />
            <Select label="Currency" value={s.cur} onChange={(cur) => set({ cur })} options={['$', '€', '£', 'CHF ', 'zł', '₴', '¥']} />
          </Row>
          <Row>
            <Num label="Age when bought" value={s.ageAtPurchase} onChange={(ageAtPurchase) => set({ ageAtPurchase })} unit="years" min={0} max={30} step={1} hint="0 = new" />
            <Num label="Odometer when bought" value={s.odoAtPurchase} onChange={(odoAtPurchase) => set({ odoAtPurchase })} unit={s.unit} min={0} />
          </Row>
          <Row>
            <Num label="Years to project" value={s.years} onChange={(years) => set({ years })} min={1} max={30} step={1} />
            <Num label="Plan to sell after" value={s.sellYear} onChange={(sellYear) => set({ sellYear })} unit="years" min={1} max={30} step={1} />
          </Row>
          <Select label="Condition at sale" value={s.condition} onChange={(condition) => set({ condition })} options={CONDITION.map(([n, v]) => [v, `${n} (${v > 0 ? '+' : ''}${v}%)`] as [number, string])} />
        </Panel>
        <Panel title="Mileage adjustment">
          <Seg value={s.unit} onChange={switchUnit} options={[['mi', 'Miles'], ['km', 'Kilometres']]} />
          <Row>
            <Num label="You drive per year" value={s.perYear} onChange={(perYear) => set({ perYear })} unit={s.unit} min={0} />
            <Num label="Normal per year" value={s.expected} onChange={(expected) => set({ expected })} unit={s.unit} min={1} />
          </Row>
          <Slider label={`Value change per 1,000 ${s.unit} above/below normal`} value={s.k} onChange={(k) => set({ k })} min={0} max={2} step={0.05} unit="%" />
          <Note>Each 1,000 {s.unit} over the normal total for the car's age lowers the value by {s.k}% (under-driving raises it), capped between −45% and +15%.</Note>
        </Panel>
        <Panel title="Yearly depreciation rates">
          <Select label="Start from preset" value={s.preset} onChange={(preset) => { const p = PRESETS.find((x) => x.id === preset); if (p) set({ preset, rates: p.rates }) }}
            options={[...PRESETS.map((p) => [p.id, p.name] as [string, string]), ['custom', 'Custom (edited)']]} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(88px,1fr))', gap: 6 }}>
            {s.rates.map((r, i) => (
              <Num key={i} label={`Year ${i + 1}${i === s.rates.length - 1 ? '+' : ''}`} value={r} onChange={(v) => setRate(i, v)} unit="%" min={0} max={90} />
            ))}
          </div>
          <Row>
            <Btn kind="ghost" onClick={() => set({ rates: [...s.rates, s.rates[s.rates.length - 1] ?? 10], preset: 'custom' })}>+ Year</Btn>
            <Btn kind="ghost" disabled={s.rates.length <= 1} onClick={() => set({ rates: s.rates.slice(0, -1), preset: 'custom' })}>− Year</Btn>
          </Row>
          <Note>Rates apply to the car's age, not your years of ownership: a 3-year-old car you buy starts at "Year 4". The last rate repeats for older ages.</Note>
        </Panel>
      </div>
      <div>
        {!valid && <Note tone="err">Enter a price above zero and 1–30 years.</Note>}
        {valid && sell && (
          <Stats>
            <Stat label={`Resale value after ${sell.year} yr${sell.year === 1 ? '' : 's'}`} value={m(sell.value)} tone="accent" sub={`${pct(sell.value / s.price, 0)} of price paid`} />
            <Stat label="Depreciation" value={m(sell.lost)} tone="bad" sub={`${m(sell.lost / sell.year)} per year`} />
            <Stat label={`Cost per ${s.unit}`} value={money(sell.perDistance, s.cur, 2)} sub={`over ${num(s.perYear * sell.year, 0)} ${s.unit}`} />
            <Stat label="Half value at" value={hl ? `${hl} yr${hl === 1 ? '' : 's'}` : '30+ yrs'} sub="of ownership, normal mileage" />
          </Stats>
        )}
        <Panel title="Value over time">
          <LineChart
            series={[
              { name: 'Your estimate', points: rows.map((r) => [r.year, r.value]), area: true },
              { name: 'Normal mileage, good condition', points: plain.map((r) => [r.year, r.value]), dashed: true, color: 'var(--muted)' },
            ]}
            xLabel="Years of ownership" fx={(v) => `${v}`} fy={(v) => m(v)} yMin={0}
            markers={sell ? [{ x: sell.year, label: 'Sell' }] : []}
          />
        </Panel>
        <Panel title="Year-by-year schedule" actions={<CsvButton name="car-depreciation.csv" rows={() => [['Year', 'Car age', 'Rate %', `Odometer (${s.unit})`, 'Mileage factor', 'Value', 'Lost', 'Lost %'], ...rows.map((r) => [r.year, r.age, r.rate, Math.round(r.odo), r.factor.toFixed(3), r.value.toFixed(0), r.lost.toFixed(0), (r.lostPct * 100).toFixed(1)])]} />}>
          <Table
            head={['Year', 'Age', 'Rate', 'Odometer', 'Mileage ×', 'Value', 'Lost so far']}
            rows={rows.map((r) => [
              r.year === sell?.year ? <b key="y">{r.year} ⟵ sell</b> : r.year,
              r.age,
              r.year ? `−${rateAt(s.rates, r.age)}%` : '—',
              `${num(r.odo, 0)} ${s.unit}`,
              r.factor.toFixed(3),
              <b key="v">{m(r.value)}</b>,
              `${m(r.lost)} (${pct(r.lostPct, 0)})`,
            ])}
          />
        </Panel>
        <Note tone="warn">
          This is a transparent rule-of-thumb model: value = price × ∏(1 − yearly rate) × mileage factor × condition. It does not use market or auction data,
          and real prices depend on model, region, demand, accident history and options. Edit the rates to match listings you see for your model.
        </Note>
      </div>
    </Split>
  )
}
