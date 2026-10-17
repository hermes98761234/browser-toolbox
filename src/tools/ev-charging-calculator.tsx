import { Check, Note, Num, Panel, Row, Seg, Select, Slider, Split, Stat, Stats, Table, LineChart, money, num, useToolState } from '../kit'
import { fmtDuration, kwh100kmToMiPerKwh, miPerKwhToKwh100km, simulate } from './lib/ev-charging-calculator'

// name, usable kWh, kWh/100 km, onboard AC kW, DC peak kW
const CARS: [string, number, number, number, number][] = [
  ['Tesla Model 3 RWD', 57.5, 14.5, 11, 170],
  ['Tesla Model Y Long Range', 75, 16.5, 11, 250],
  ['Hyundai Ioniq 5 (77 kWh)', 74, 17.5, 11, 235],
  ['Kia EV6 (77 kWh)', 74, 17, 11, 235],
  ['VW ID.4 Pro', 77, 18, 11, 135],
  ['BMW i4 eDrive40', 81, 17, 11, 205],
  ['Chevrolet Bolt EV', 65, 16.5, 11, 55],
  ['Nissan Leaf 40 kWh', 39, 16, 6.6, 46],
  ['Renault Zoe R135', 52, 17, 22, 46],
  ['Ford F-150 Lightning ER', 131, 28, 19.2, 155],
  ['Custom', 0, 0, 0, 0],
]
type Price = 'home' | 'publicAc' | 'dc'
const CHARGERS: { id: string; name: string; kw: number; kind: 'ac' | 'dc'; loss: number; price: Price }[] = [
  { id: 'l1', name: 'Household socket', kw: 2.3, kind: 'ac', loss: 15, price: 'home' },
  { id: 'w7', name: 'Home wallbox 7.4 kW', kw: 7.4, kind: 'ac', loss: 10, price: 'home' },
  { id: 'w11', name: 'Wallbox 11 kW (3-phase)', kw: 11, kind: 'ac', loss: 10, price: 'home' },
  { id: 'ac22', name: 'Public AC 22 kW', kw: 22, kind: 'ac', loss: 10, price: 'publicAc' },
  { id: 'dc50', name: 'DC fast 50 kW', kw: 50, kind: 'dc', loss: 6, price: 'dc' },
  { id: 'dc150', name: 'DC rapid 150 kW', kw: 150, kind: 'dc', loss: 6, price: 'dc' },
  { id: 'dc350', name: 'DC ultra 350 kW', kw: 350, kind: 'dc', loss: 6, price: 'dc' },
]
const DEF = {
  car: 'Hyundai Ioniq 5 (77 kWh)', battery: 74, cons: 17.5, onboardAc: 11, dcPeak: 235,
  from: 10, to: 80, charger: 'dc150', unit: 'km' as 'km' | 'mi', currency: '€',
  home: 0.3, offpeak: 0.12, useOffpeak: true, publicAc: 0.45, dc: 0.59, fee: 0,
  fuelPrice: 1.75, fuelCons: 6.5,
}

export default function EvChargingCalculator() {
  const [s, set, reset] = useToolState('ev-charging-calculator', DEF)
  const m = (x: number, d = 2) => money(x, s.currency, d)
  const mi = s.unit === 'mi'
  const homePrice = s.useOffpeak ? s.offpeak : s.home
  const priceOf = (p: Price) => (p === 'home' ? homePrice : p === 'publicAc' ? s.publicAc : s.dc)
  const run = (id: string) => {
    const c = CHARGERS.find((x) => x.id === id)!
    const r = simulate({ battery: s.battery, from: s.from, to: s.to, charger: c.kw, kind: c.kind, onboardAc: s.onboardAc, dcPeak: s.dcPeak, loss: c.loss })
    const cost = r.grid * priceOf(c.price) + (c.price === 'home' ? 0 : s.fee)
    return { c, r, cost }
  }
  const cur = run(s.charger)
  const km = (cur.r.battery / s.cons) * 100
  const dist = (k: number) => (mi ? k / 1.609344 : k)
  const per100 = (cur.cost / km) * 100 * (mi ? 1.609344 : 1)
  const fuelPer100 = s.fuelPrice * s.fuelCons * (mi ? 1.609344 : 1)
  const homePer100 = homePrice * (s.cons / 0.9) * (mi ? 1.609344 : 1)
  const fullRange = (s.battery / s.cons) * 100

  return (
    <Split>
      <div>
        <Panel title="Car">
          <Select
            label="Model"
            value={s.car}
            onChange={(car) => {
              const c = CARS.find((x) => x[0] === car)!
              set(c[1] ? { car, battery: c[1], cons: c[2], onboardAc: c[3], dcPeak: c[4] } : { car })
            }}
            options={CARS.map((c) => c[0])}
          />
          <Row>
            <Num label="Usable battery" value={s.battery} min={5} max={250} unit="kWh" onChange={(battery) => set({ battery, car: 'Custom' })} />
            {mi ? (
              <Num label="Efficiency" value={+kwh100kmToMiPerKwh(s.cons).toFixed(2)} min={0.5} max={10} unit="mi/kWh" onChange={(v) => v > 0 && set({ cons: miPerKwhToKwh100km(v), car: 'Custom' })} />
            ) : (
              <Num label="Consumption" value={s.cons} min={5} max={60} unit="kWh/100 km" onChange={(cons) => set({ cons, car: 'Custom' })} />
            )}
          </Row>
          <Row>
            <Num label="On-board AC charger" value={s.onboardAc} min={1} max={22} unit="kW" onChange={(onboardAc) => set({ onboardAc, car: 'Custom' })} />
            <Num label="DC peak power" value={s.dcPeak} min={10} max={400} unit="kW" onChange={(dcPeak) => set({ dcPeak, car: 'Custom' })} />
          </Row>
          <Seg value={s.unit} onChange={(unit) => set({ unit })} options={[['km', 'Kilometres'], ['mi', 'Miles']]} />
        </Panel>
        <Panel title="Charging session">
          <Select label="Charger" value={s.charger} onChange={(charger) => set({ charger })} options={CHARGERS.map((c) => [c.id, c.name] as const)} />
          <Slider label="Start charge" value={s.from} min={0} max={99} unit="%" onChange={(from) => set({ from, to: Math.max(s.to, from + 1) })} />
          <Slider label="Target charge" value={s.to} min={1} max={100} unit="%" onChange={(to) => set({ to, from: Math.min(s.from, to - 1) })} />
          <Row>
            {[[10, 80], [20, 80], [20, 100], [5, 50]].map(([a, b]) => (
              <button key={`${a}${b}`} type="button" className="k-btn ghost" onClick={() => set({ from: a, to: b })}>{a}→{b}%</button>
            ))}
          </Row>
        </Panel>
        <Panel title="Electricity prices">
          <Row>
            <Num label="Home (standard)" value={s.home} min={0} unit={`${s.currency}/kWh`} onChange={(home) => set({ home })} />
            <Num label="Home off-peak" value={s.offpeak} min={0} unit={`${s.currency}/kWh`} onChange={(offpeak) => set({ offpeak })} />
          </Row>
          <Check label="Charge at home during off-peak hours" value={s.useOffpeak} onChange={(useOffpeak) => set({ useOffpeak })} />
          <Row>
            <Num label="Public AC" value={s.publicAc} min={0} unit={`${s.currency}/kWh`} onChange={(publicAc) => set({ publicAc })} />
            <Num label="DC fast" value={s.dc} min={0} unit={`${s.currency}/kWh`} onChange={(dc) => set({ dc })} />
          </Row>
          <Row>
            <Num label="Public session fee" value={s.fee} min={0} unit={s.currency} onChange={(fee) => set({ fee })} />
            <Select label="Currency" value={s.currency} onChange={(currency) => set({ currency })} options={['€', '$', '£', '₴', 'zł', 'CHF ', 'kr ']} />
          </Row>
        </Panel>
        <Panel title="Compare with a petrol car">
          <Row>
            <Num label="Fuel price" value={s.fuelPrice} min={0} unit={`${s.currency}/L`} onChange={(fuelPrice) => set({ fuelPrice })} />
            <Num label="Fuel use" value={s.fuelCons} min={1} unit="L/100 km" onChange={(fuelCons) => set({ fuelCons })} />
          </Row>
          <button type="button" className="k-btn ghost" onClick={reset}>Reset all</button>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Charging time" value={fmtDuration(cur.r.minutes)} sub={`${s.from}% → ${s.to}% · avg ${num(cur.r.avgKw, 1)} kW`} tone="accent" />
          <Stat label="Cost" value={m(cur.cost)} sub={`${num(cur.r.grid, 1)} kWh from the grid @ ${m(priceOf(cur.c.price), 2)}`} />
          <Stat label="Range added" value={`${num(dist(km), 0)} ${s.unit}`} sub={`full battery ≈ ${num(dist(fullRange), 0)} ${s.unit}`} />
          <Stat label={`Cost per 100 ${s.unit}`} value={m(per100)} sub={`petrol: ${m(fuelPer100)}`} tone={per100 < fuelPer100 ? 'good' : 'bad'} />
        </Stats>
        {cur.c.kind === 'ac' && s.onboardAc < cur.c.kw && <Note tone="warn">This car's on-board charger limits AC charging to {s.onboardAc} kW, so the {cur.c.kw} kW point is not used fully.</Note>}
        {cur.c.kind === 'dc' && s.to > 80 && <Note>DC power drops steeply above 80%. Stopping at 80% and driving on usually saves time on road trips.</Note>}
        <Panel title="Charge level over time">
          <LineChart series={[{ name: 'Charge', points: cur.r.timeline, area: true, color: '#10b981' }]} xLabel="minutes" fx={(v) => num(v, 0)} fy={(v) => `${num(v, 0)}%`} yMin={0} yMax={100} height={220} />
        </Panel>
        <Panel title="Charging power curve">
          <LineChart series={[{ name: 'Power', points: cur.r.curve, color: '#6366f1', area: true }]} xLabel="state of charge (%)" fx={(v) => `${num(v, 0)}%`} fy={(v) => `${num(v, 0)} kW`} yMin={0} xMin={0} xMax={100} height={200} />
          <p className="muted" style={{ fontSize: 13 }}>
            {cur.c.kind === 'dc' ? `Power is the lower of the charger (${cur.c.kw} kW) and the car's DC peak (${s.dcPeak} kW) times a typical taper curve.` : `AC power is the lower of the charger and the car's on-board charger, flat until the last few percent.`} Losses assumed: {cur.c.loss}%.
          </p>
        </Panel>
        <Panel title="All charger types for this session">
          <Table
            head={['Charger', 'Time', 'Cost', `per 100 ${s.unit}`]}
            rows={CHARGERS.map((c) => {
              const x = run(c.id)
              return [
                <button key="n" type="button" className={`k-btn ${c.id === s.charger ? 'primary' : 'ghost'}`} onClick={() => set({ charger: c.id })}>{c.name}</button>,
                fmtDuration(x.r.minutes),
                m(x.cost),
                m((x.cost / km) * 100 * (mi ? 1.609344 : 1)),
              ]
            })}
          />
          <p className="muted" style={{ fontSize: 13 }}>Home charging at {m(homePrice, 2)}/kWh costs about {m(homePer100)} per 100 {s.unit}, versus {m(fuelPer100)} for the petrol car.</p>
        </Panel>
      </div>
    </Split>
  )
}
