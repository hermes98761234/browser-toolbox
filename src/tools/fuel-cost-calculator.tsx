import { Btn, Check, CopyButton, LineChart, Note, Num, Panel, Row, Select, Seg, Split, Stat, Stats, Table, money, num, useToolState } from '../kit'
import { CO2, from100km, KM_PER_MI, L_PER_GALUK, L_PER_GALUS, per100km, pricePerUnit, tripCost, type ConsUnit, type PriceUnit } from './lib/fuel-cost-calculator'

type Fuel = 'petrol' | 'diesel' | 'lpg' | 'electric'
interface Vehicle { fuel: Fuel; cons: number; consUnit: ConsUnit; price: number; priceUnit: PriceUnit }
interface State {
  distance: number; distUnit: 'km' | 'mi'; roundTrip: boolean; passengers: number; tolls: number; parking: number; currency: string
  a: Vehicle; compare: boolean; b: Vehicle
}

const DEF: State = {
  distance: 320, distUnit: 'km', roundTrip: true, passengers: 3, tolls: 18, parking: 12, currency: '€',
  a: { fuel: 'petrol', cons: 6.8, consUnit: 'l100', price: 1.79, priceUnit: 'L' },
  compare: true,
  b: { fuel: 'electric', cons: 17, consUnit: 'kwh100', price: 0.32, priceUnit: 'kWh' },
}

const LIQUID_UNITS: [ConsUnit, string][] = [['l100', 'L/100 km'], ['kml', 'km/L'], ['mpgus', 'mpg (US)'], ['mpguk', 'mpg (UK)']]
const EV_UNITS: [ConsUnit, string][] = [['kwh100', 'kWh/100 km'], ['mikwh', 'mi/kWh']]
const FUELS: [Fuel, string][] = [['petrol', 'Petrol / gasoline'], ['diesel', 'Diesel'], ['lpg', 'LPG / autogas'], ['electric', 'Electric']]

const PRESETS: [string, Partial<State>][] = [
  ['Commute 25 km', { distance: 25, distUnit: 'km', roundTrip: true, passengers: 1, tolls: 0, parking: 6 }],
  ['Weekend away 320 km', { distance: 320, distUnit: 'km', roundTrip: true, passengers: 3, tolls: 18, parking: 12 }],
  ['Road trip 1,200 mi', { distance: 1200, distUnit: 'mi', roundTrip: false, passengers: 4, tolls: 40, parking: 60 }],
]

function VehicleInputs({ v, onChange, cur }: { v: Vehicle; onChange: (v: Vehicle) => void; cur: string }) {
  const ev = v.fuel === 'electric'
  return (
    <>
      <Select
        label="Fuel"
        value={v.fuel}
        onChange={(fuel) => {
          const toEv = fuel === 'electric'
          if (toEv === ev) return onChange({ ...v, fuel })
          onChange(toEv ? { fuel, cons: 17, consUnit: 'kwh100', price: 0.3, priceUnit: 'kWh' } : { fuel, cons: 6.5, consUnit: 'l100', price: 1.7, priceUnit: 'L' })
        }}
        options={FUELS}
      />
      <Row>
        <Num label="Consumption" value={v.cons} onChange={(cons) => onChange({ ...v, cons })} min={0.01} />
        <Select
          label="Unit"
          value={v.consUnit}
          onChange={(consUnit) => {
            // keep the same real consumption when switching units
            const l = per100km(v.cons, v.consUnit)
            onChange({ ...v, consUnit, cons: Number.isFinite(l) ? Math.round(from100km(l, consUnit) * 100) / 100 : v.cons })
          }}
          options={ev ? EV_UNITS : LIQUID_UNITS}
        />
      </Row>
      <Row>
        <Num label="Price" value={v.price} onChange={(price) => onChange({ ...v, price })} unit={cur} min={0} />
        <Select
          label="per"
          value={v.priceUnit}
          onChange={(priceUnit) => {
            const perL = pricePerUnit(v.price, v.priceUnit)
            const k = priceUnit === 'galUS' ? L_PER_GALUS : priceUnit === 'galUK' ? L_PER_GALUK : 1
            onChange({ ...v, priceUnit, price: Math.round(perL * k * 1000) / 1000 })
          }}
          options={ev ? [['kWh', 'kWh']] : [['L', 'litre'], ['galUS', 'US gallon'], ['galUK', 'UK gallon']]}
        />
      </Row>
    </>
  )
}

export default function FuelCostCalculator() {
  const [s, set, reset] = useToolState('fuel-cost-calculator', DEF)
  const m = (x: number, d = 2) => money(x, s.currency, d)
  const km = s.distUnit === 'mi' ? s.distance * KM_PER_MI : s.distance
  const calc = (v: Vehicle, extras: number) => tripCost({ km, roundTrip: s.roundTrip, l100: per100km(v.cons, v.consUnit), price: pricePerUnit(v.price, v.priceUnit), passengers: s.passengers, extras })
  const extras = s.tolls + s.parking
  const A = calc(s.a, extras)
  const B = calc(s.b, extras)
  const evA = s.a.fuel === 'electric'
  const u = evA ? 'kWh' : 'L'
  const dist = (k: number) => (s.distUnit === 'mi' ? `${num(k / KM_PER_MI, 0)} mi` : `${num(k, 0)} km`)
  const perDist = s.distUnit === 'mi' ? A.total / (A.km / KM_PER_MI) : A.perKm
  const co2 = A.fuel * CO2[s.a.fuel]
  const valid = s.distance > 0 && Number.isFinite(A.fuel)
  const l100 = per100km(s.a.cons, s.a.consUnit)
  const maxD = Math.max(1, s.distance * 2)
  const line = (v: Vehicle) =>
    Array.from({ length: 21 }, (_, i): [number, number] => {
      const d = (maxD * i) / 20
      const k = s.distUnit === 'mi' ? d * KM_PER_MI : d
      return [d, tripCost({ km: k, roundTrip: s.roundTrip, l100: per100km(v.cons, v.consUnit), price: pricePerUnit(v.price, v.priceUnit), passengers: 1, extras: 0 }).fuelCost]
    })
  const summary = `${dist(A.km)}${s.roundTrip ? ' (round trip)' : ''}: ${num(A.fuel, 1)} ${u} of ${s.a.fuel}, fuel ${m(A.fuelCost)} + extras ${m(extras)} = ${m(A.total)}; ${m(A.perPassenger)} each for ${s.passengers}.`

  return (
    <Split>
      <div>
        <Panel title="Trip" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Row>
            <Num label="Distance (one way)" value={s.distance} onChange={(distance) => set({ distance })} min={0} />
            <div className="k-field">
              <span className="k-label">Unit</span>
              <Seg value={s.distUnit} onChange={(distUnit) => set({ distUnit, distance: Math.round((distUnit === 'mi' ? s.distance / KM_PER_MI : s.distance * KM_PER_MI) * 10) / 10 })} options={[['km', 'km'], ['mi', 'miles']]} />
            </div>
          </Row>
          <Check label="Round trip (there and back)" value={s.roundTrip} onChange={(roundTrip) => set({ roundTrip })} />
          <Row>
            <Num label="People sharing" value={s.passengers} onChange={(passengers) => set({ passengers: Math.max(1, Math.round(passengers)) })} min={1} step={1} />
            <Select label="Currency" value={s.currency} onChange={(currency) => set({ currency })} options={['€', '$', '£', '₴', 'zł', 'CHF ', '¥', '₹']} />
          </Row>
          <Row>
            <Num label="Tolls" value={s.tolls} onChange={(tolls) => set({ tolls })} unit={s.currency} min={0} />
            <Num label="Parking" value={s.parking} onChange={(parking) => set({ parking })} unit={s.currency} min={0} />
          </Row>
          <Row>
            {PRESETS.map(([n, p]) => (
              <Btn key={n} onClick={() => set(p)}>{n}</Btn>
            ))}
          </Row>
        </Panel>
        <Panel title="Vehicle">
          <VehicleInputs v={s.a} onChange={(a) => set({ a })} cur={s.currency} />
          {Number.isFinite(l100) && !evA && (
            <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>
              = {num(l100, 2)} L/100 km · {num(100 / l100, 1)} km/L · {num(from100km(l100, 'mpgus'), 1)} mpg US · {num(from100km(l100, 'mpguk'), 1)} mpg UK
            </p>
          )}
        </Panel>
        <Panel title="Compare">
          <Check label="Compare with a second vehicle" value={s.compare} onChange={(compare) => set({ compare })} />
          {s.compare && <VehicleInputs v={s.b} onChange={(b) => set({ b })} cur={s.currency} />}
        </Panel>
      </div>

      <div>
        {!valid && <Note tone="err">Enter a distance and a consumption above zero.</Note>}
        <Stats>
          <Stat label="Trip cost" value={m(A.total)} sub={`fuel ${m(A.fuelCost)} + extras ${m(extras)}`} tone="accent" />
          <Stat label="Per person" value={m(A.perPassenger)} sub={`${s.passengers} ${s.passengers === 1 ? 'person' : 'people'}`} />
          <Stat label={evA ? 'Energy used' : 'Fuel used'} value={`${num(A.fuel, 1)} ${u}`} sub={evA ? undefined : `${num(A.fuel / L_PER_GALUS, 2)} US gal · ${num(A.fuel / L_PER_GALUK, 2)} UK gal`} />
          <Stat label={`Cost per ${s.distUnit}`} value={m(perDist, 3)} sub={`${dist(A.km)} driven`} />
        </Stats>
        <Panel title="Breakdown" actions={<CopyButton text={summary} label="Copy summary" />}>
          <Table
            head={['', 'Vehicle 1', ...(s.compare ? ['Vehicle 2'] : [])]}
            rows={[
              ['Fuel type', FUELS.find((f) => f[0] === s.a.fuel)![1], ...(s.compare ? [FUELS.find((f) => f[0] === s.b.fuel)![1]] : [])],
              ['Distance driven', dist(A.km), ...(s.compare ? [dist(B.km)] : [])],
              ['Energy used', `${num(A.fuel, 1)} ${u}`, ...(s.compare ? [`${num(B.fuel, 1)} ${s.b.fuel === 'electric' ? 'kWh' : 'L'}`] : [])],
              ['Fuel / charging cost', m(A.fuelCost), ...(s.compare ? [m(B.fuelCost)] : [])],
              ['Tolls + parking', m(extras), ...(s.compare ? [m(extras)] : [])],
              [<b key="t">Total</b>, <b key="a">{m(A.total)}</b>, ...(s.compare ? [<b key="b">{m(B.total)}</b>] : [])],
              ['Per person', m(A.perPassenger), ...(s.compare ? [m(B.perPassenger)] : [])],
              ['CO₂ (tailpipe / grid est.)', `${num(co2, 1)} kg`, ...(s.compare ? [`${num(B.fuel * CO2[s.b.fuel], 1)} kg`] : [])],
            ]}
          />
          {s.compare && Number.isFinite(B.total) && (
            <Note tone={B.fuelCost < A.fuelCost ? 'ok' : 'info'}>
              Vehicle {B.fuelCost < A.fuelCost ? 2 : 1} saves <b>{m(Math.abs(A.fuelCost - B.fuelCost))}</b> on this trip ({num((Math.abs(A.fuelCost - B.fuelCost) / Math.max(A.fuelCost, B.fuelCost)) * 100, 0)}% less on fuel).
            </Note>
          )}
        </Panel>
        <Panel title={`Fuel cost by one-way distance${s.roundTrip ? ' (round trip)' : ''}`}>
          <LineChart
            series={[{ name: 'Vehicle 1', points: line(s.a), area: !s.compare }, ...(s.compare ? [{ name: 'Vehicle 2', points: line(s.b), dashed: true }] : [])]}
            markers={[{ x: s.distance, label: 'this trip' }]}
            fx={(v) => `${num(v, 0)} ${s.distUnit}`}
            fy={(v) => m(v, 0)}
            height={230}
          />
        </Panel>
        <p className="muted" style={{ fontSize: 12.5 }}>
          Real consumption varies with speed, load, weather and traffic: highway driving at 120 km/h (75 mph) typically uses 15–25% more than at 90 km/h (55 mph). CO₂ uses 2.31 kg/L petrol, 2.68 kg/L diesel, 1.51 kg/L LPG and a 0.4 kg/kWh grid average.
        </p>
      </div>
    </Split>
  )
}
