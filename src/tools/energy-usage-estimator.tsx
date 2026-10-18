import { useState } from 'react'
import { BarChart, Btn, CsvButton, Donut, JsonButtons, money, Note, Num, num, Panel, Row, Seg, Select, Split, Stat, Stats, Table, uid, useToolState } from '../kit'
import { analyse, runCost, type Appliance, type Tariff } from './lib/energy-usage-estimator'

// name, category, watts, duty, standby W, hours/day, days/week, off-peak share
type P = [string, string, number, number, number, number, number, number]
const PRESETS: P[] = [
  ['Refrigerator', 'Kitchen', 150, 0.35, 0, 24, 7, 0.33], ['Chest freezer', 'Kitchen', 100, 0.4, 0, 24, 7, 0.33],
  ['Electric oven', 'Kitchen', 2400, 0.5, 2, 1, 4, 0], ['Induction hob', 'Kitchen', 2000, 0.6, 1, 1, 7, 0],
  ['Microwave', 'Kitchen', 1100, 1, 2, 0.2, 7, 0], ['Kettle', 'Kitchen', 2200, 1, 0, 0.25, 7, 0],
  ['Dishwasher (eco)', 'Kitchen', 1800, 0.5, 0.5, 2, 4, 0.8], ['Coffee machine', 'Kitchen', 1200, 0.5, 1, 0.3, 7, 0],
  ['Washing machine', 'Laundry', 2000, 0.35, 0.5, 1.2, 3, 0.5], ['Tumble dryer (vented)', 'Laundry', 2500, 0.8, 0.5, 1, 2, 0.3],
  ['Heat-pump dryer', 'Laundry', 900, 0.8, 0.5, 2, 2, 0.3], ['Iron', 'Laundry', 1200, 0.5, 0, 0.3, 2, 0],
  ['LED TV 55"', 'Entertainment', 100, 1, 0.5, 4, 7, 0], ['Game console', 'Entertainment', 150, 1, 10, 2, 3, 0],
  ['Sound bar', 'Entertainment', 30, 1, 3, 3, 7, 0], ['Wi-Fi router', 'Office & IT', 10, 1, 0, 24, 7, 0.33],
  ['Desktop PC', 'Office & IT', 200, 1, 2, 4, 5, 0], ['Laptop', 'Office & IT', 50, 1, 0.5, 6, 5, 0], ['Monitor 27"', 'Office & IT', 30, 1, 0.3, 6, 5, 0],
  ['LED bulb 9 W', 'Lighting', 9, 1, 0, 5, 7, 0], ['Incandescent bulb 60 W', 'Lighting', 60, 1, 0, 5, 7, 0], ['Halogen spot 50 W', 'Lighting', 50, 1, 0, 4, 7, 0],
  ['Electric space heater', 'Heating & cooling', 1500, 0.6, 0, 4, 7, 0], ['Portable air conditioner', 'Heating & cooling', 1000, 0.7, 1, 5, 7, 0],
  ['Ceiling fan', 'Heating & cooling', 50, 1, 0, 6, 7, 0.2], ['Dehumidifier', 'Heating & cooling', 300, 0.7, 1, 8, 7, 0.3],
  ['Electric water heater', 'Water heating', 3000, 1, 0, 2.5, 7, 0.6], ['Electric shower', 'Water heating', 9000, 1, 0, 0.15, 7, 0],
  ['EV charging (7.4 kW)', 'Transport', 7400, 1, 0, 1.2, 7, 0.9], ['E-bike charger', 'Transport', 100, 1, 0, 3, 2, 0.5],
  ['Hair dryer', 'Personal care', 1800, 1, 0, 0.15, 7, 0], ['Aquarium (heater + pump)', 'Other', 80, 0.6, 0, 24, 7, 0.33], ['Pool pump', 'Other', 1000, 1, 0, 6, 7, 0.5],
]
const mk = (p: P, qty = 1): Appliance => ({ id: uid(), name: p[0], cat: p[1], watts: p[2], duty: p[3], standby: p[4], hours: p[5], days: p[6], offPeak: p[7], qty })
const pick = (n: string, qty = 1) => mk(PRESETS.find((p) => p[0] === n)!, qty)
const SAMPLE: Appliance[] = [
  pick('Refrigerator'), pick('Electric oven'), pick('Induction hob'), pick('Microwave'), pick('Kettle'), pick('Dishwasher (eco)'),
  pick('Washing machine'), pick('Tumble dryer (vented)'), pick('LED TV 55"'), pick('Game console'), pick('Wi-Fi router'), pick('Desktop PC'),
  pick('Laptop', 2), pick('LED bulb 9 W', 12), pick('Incandescent bulb 60 W', 3), pick('Electric space heater'),
]
const CATS = [...new Set(PRESETS.map((p) => p[1]))]

const DEF = {
  items: SAMPLE,
  cur: '$',
  tariff: { mode: 'flat', rate: 0.3, peak: 0.36, offPeakRate: 0.15, daily: 0.5 } as Tariff,
  co2: 400,
  calcW: 2200,
  calcMin: 3,
  all: false,
}

export default function EnergyUsageEstimator() {
  const [s, set, reset] = useToolState('energy-usage-estimator', DEF)
  const [preset, setPreset] = useState(PRESETS[0][0])
  const t = s.tariff
  const m = (x: number, d = 2) => money(x, s.cur, d)
  const r = analyse(s.items, t)
  const edit = (id: string, p: Partial<Appliance>) => set({ items: s.items.map((a) => (a.id === id ? { ...a, ...p } : a)) })
  const setT = (p: Partial<Tariff>) => set({ tariff: { ...t, ...p } })
  const byCat = CATS.map((c) => ({ label: c, value: r.rows.filter((x) => x.a.cat === c).reduce((a, x) => a + x.cost, 0) })).filter((x) => x.value > 0)
  const top = [...r.rows].sort((a, b) => b.cost - a.cost).slice(0, 10)
  const standbyYear = r.rows.reduce((a, x) => a + x.standbyYear, 0)
  const price = t.mode === 'flat' ? t.rate : t.peak

  // Savings ideas computed from the list
  const tips: { text: string; save: number }[] = []
  if (standbyYear > 5) tips.push({ text: `Switch off standby loads at the wall (${num(standbyYear, 0)} kWh/yr of standby)`, save: standbyYear * r.avgPrice })
  for (const x of r.rows) {
    if (/incandescent|halogen/i.test(x.a.name)) tips.push({ text: `Swap ${x.a.qty} × ${x.a.name} for LED (≈ 85 % less)`, save: x.cost * 0.85 })
    if (/tumble dryer \(vented\)/i.test(x.a.name)) tips.push({ text: 'Replace the vented dryer with a heat-pump dryer (≈ 50 % less)', save: x.cost * 0.5 })
    if (/space heater/i.test(x.a.name)) tips.push({ text: 'Heat the room with a heat pump instead of a resistive heater (COP ≈ 3)', save: x.cost * (2 / 3) })
  }
  if (t.mode === 'tou') {
    const shift = r.rows.filter((x) => /dishwasher|washing|dryer|EV|water heater/i.test(x.a.name)).reduce((a, x) => a + x.year * (1 - x.a.offPeak) * (t.peak - t.offPeakRate), 0)
    if (shift > 1) tips.push({ text: 'Run dishwasher, laundry, water heating and EV charging fully off-peak', save: shift })
  }
  tips.sort((a, b) => b.save - a.save)

  return (
    <Split wide="right">
      <div>
        <Panel title="Tariff" actions={<Btn kind="ghost" onClick={reset}>Sample</Btn>}>
          <Seg value={t.mode} onChange={(mode) => setT({ mode })} options={[['flat', 'Flat rate'], ['tou', 'Peak / off-peak']]} />
          <Row>
            {t.mode === 'flat' ? (
              <Num label="Price per kWh" value={t.rate} onChange={(rate) => setT({ rate })} unit={s.cur} min={0} step={0.01} />
            ) : (
              <>
                <Num label="Peak price / kWh" value={t.peak} onChange={(peak) => setT({ peak })} unit={s.cur} min={0} step={0.01} />
                <Num label="Off-peak price / kWh" value={t.offPeakRate} onChange={(offPeakRate) => setT({ offPeakRate })} unit={s.cur} min={0} step={0.01} />
              </>
            )}
          </Row>
          <Row>
            <Num label="Standing charge / day" value={t.daily} onChange={(daily) => setT({ daily })} unit={s.cur} min={0} step={0.01} />
            <Select label="Currency" value={s.cur} onChange={(cur) => set({ cur })} options={['$', '€', '£', '₴', 'zł', 'CHF ', 'A$', 'C$', '₹']} />
          </Row>
          <Num label="Grid carbon intensity" value={s.co2} onChange={(co2) => set({ co2 })} unit="g CO₂/kWh" min={0} hint="≈ 50 (hydro/nuclear-heavy grids) to 700+ (coal-heavy grids)" />
        </Panel>
        <Panel title="Add appliance">
          <Select label="Preset" value={preset} onChange={setPreset} options={CATS.flatMap((c) => PRESETS.filter((p) => p[1] === c).map((p) => [p[0], `${c} · ${p[0]} (${p[2]} W)`] as [string, string]))} />
          <Row>
            <Btn kind="primary" onClick={() => set({ items: [...s.items, pick(preset)] })}>＋ Add preset</Btn>
            <Btn onClick={() => set({ items: [...s.items, { id: uid(), name: 'My appliance', cat: 'Other', watts: 500, duty: 1, standby: 0, hours: 1, days: 7, qty: 1, offPeak: 0 }] })}>＋ Custom</Btn>
            <Btn kind="ghost" onClick={() => set({ items: [] })}>Clear list</Btn>
          </Row>
          <p className="k-hint">Watts are typical ratings — check the label on the device or measure with a plug-in meter. <b>Duty</b> is the share of the on-time the device really draws full power (fridges cycle their compressor, ovens their element).</p>
        </Panel>
        <Panel title="Cost of one run">
          <Row>
            <Num label="Power" value={s.calcW} onChange={(calcW) => set({ calcW })} unit="W" min={0} />
            <Num label="Running time" value={s.calcMin} onChange={(calcMin) => set({ calcMin })} unit="min" min={0} />
          </Row>
          <Stats>
            <Stat label="Energy" value={`${num((s.calcW / 1000) * (s.calcMin / 60), 3)} kWh`} />
            <Stat label="Cost" value={m(runCost(s.calcW, s.calcMin, price), 3)} sub={t.mode === 'tou' ? `${m(runCost(s.calcW, s.calcMin, t.offPeakRate), 3)} off-peak` : undefined} tone="accent" />
          </Stats>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Electricity per year" value={`${num(r.kwhYear, 0)} kWh`} sub={`${num(r.kwhYear / 12, 0)} kWh / month`} />
          <Stat label="Cost per year" value={m(r.totalYear, 0)} sub={`${m(r.fixed, 0)} standing charge`} tone="accent" />
          <Stat label="Per month" value={m(r.totalYear / 12)} sub={`avg ${m(r.avgPrice, 3)}/kWh`} />
          <Stat label="CO₂ per year" value={`${num((r.kwhYear * s.co2) / 1000, 0)} kg`} sub={`${num(standbyYear, 0)} kWh standby`} />
        </Stats>
        <Panel title="Appliances" actions={<><CsvButton name="energy-usage.csv" rows={() => [['Appliance', 'Category', 'Watts', 'Duty', 'Standby W', 'Hours/day', 'Days/week', 'Qty', 'Off-peak share', 'kWh/day', 'kWh/year', 'Cost/year'], ...r.rows.map((x) => [x.a.name, x.a.cat, x.a.watts, x.a.duty, x.a.standby, x.a.hours, x.a.days, x.a.qty, x.a.offPeak, x.day.toFixed(3), x.year.toFixed(1), x.cost.toFixed(2)])]} /><JsonButtons name="energy-usage.json" data={s} onLoad={(d) => d && Array.isArray(d.items) && set(d)} /></>}>
          <Table
            head={['Appliance', 'Watts', ...(s.all ? ['Duty %'] : []), 'h/day', ...(s.all ? ['d/wk'] : []), 'Qty', ...(s.all ? ['Standby W'] : []), ...(t.mode === 'tou' && s.all ? ['Off-peak %'] : []), 'kWh/yr', 'Cost/yr', '']}
            rows={r.rows.map((x) => {
              const a = x.a
              const n = (k: keyof Appliance, w: number, mul = 1, max?: number) => (
                <input type="number" min={0} max={max} step="any" value={Math.round((a[k] as number) * mul * 1000) / 1000} style={{ width: w }} onChange={(e) => edit(a.id, { [k]: Math.max(0, Math.min(max ?? Infinity, +e.target.value)) / mul })} />
              )
              return [
                <input key="n" value={a.name} onChange={(e) => edit(a.id, { name: e.target.value })} style={{ minWidth: 150 }} title={a.cat} />,
                n('watts', 64), ...(s.all ? [n('duty', 48, 100, 100)] : []), n('hours', 48, 1, 24), ...(s.all ? [n('days', 40, 1, 7)] : []), n('qty', 40), ...(s.all ? [n('standby', 48)] : []),
                ...(t.mode === 'tou' && s.all ? [n('offPeak', 48, 100, 100)] : []),
                num(x.year, 0),
                <b key="c">{m(x.cost, 0)}</b>,
                <Btn key="x" kind="ghost" onClick={() => set({ items: s.items.filter((b) => b.id !== a.id) })} title="Remove">✕</Btn>,
              ]
            })}
            foot={['Total', '', '', '', ...(s.all ? ['', '', ''] : []), ...(t.mode === 'tou' && s.all ? [''] : []), num(r.kwhYear, 0), m(r.energyCost, 0), '']}
          />
          <Seg value={s.all ? 'all' : 'basic'} onChange={(v) => set({ all: v === 'all' })} options={[['basic', 'Basic columns'], ['all', 'All details (duty, days, standby' + (t.mode === 'tou' ? ', off-peak)' : ')')]]} />
          {!s.items.length && <Note>Add appliances from the presets to start.</Note>}
        </Panel>
        <Panel title="Where the money goes">
          <Donut slices={byCat} fv={(v) => m(v, 0)} center={m(r.energyCost, 0)} />
          <BarChart bars={top.map((x) => ({ label: x.a.name, value: Math.round(x.cost) }))} fy={(v) => m(v, 0)} />
        </Panel>
        <Panel title="Savings ideas">
          {tips.length ? (
            <Table head={['Idea', 'Saves / year']} rows={tips.map((x) => [x.text, <b key="s" style={{ color: 'var(--good, #16a34a)' }}>{m(x.save, 0)}</b>])} />
          ) : <Note tone="ok">No obvious quick wins in this list.</Note>}
          <Note>Average-day model: hours × days per week ÷ 7, plus standby watts for the remaining hours. Every watt left on around the clock costs about {m((price * 24 * 365) / 1000, 2)} per year at {m(price, 2)}/kWh.</Note>
        </Panel>
      </div>
    </Split>
  )
}
