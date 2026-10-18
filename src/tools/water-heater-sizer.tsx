import { BarChart, Btn, Check, money, Note, Num, Panel, Row, Seg, Split, Stat, Stats, Table, useToolState } from '../kit'
import {
  ACTIVITIES, annualKwh, cToF, electricTankless, firstHourRating, FIXTURES, fToC, inputBtuh, L_PER_GAL, maxFlow, mixingBoost, peakHourDemand, recommendTank,
  TANK_SIZES, tanklessFlow, tankSpec, type Activity, type Fixture, type Fuel,
} from './lib/water-heater-sizer'

type Units = 'us' | 'metric'
interface State {
  units: Units
  tIn: number
  tHot: number
  tUse: number
  storeHot: boolean
  acts: Activity[]
  fixtures: Fixture[]
  people: number
  galPerPerson: number
  kwhPrice: number
  thermPrice: number
}
const DEF: State = { units: 'us', tIn: 50, tHot: 120, tUse: 105, storeHot: false, acts: ACTIVITIES, fixtures: FIXTURES, people: 4, galPerPerson: 16, kwhPrice: 0.17, thermPrice: 1.45 }

const HOUSEHOLDS: [string, number, number[], number[]][] = [
  ['1–2 people', 2, [1, 0, 2, 1, 0, 1, 1, 0], [1, 0, 1, 0, 0, 0]],
  ['3–4 people', 4, [2, 0, 3, 1, 0, 1, 1, 0], [2, 0, 1, 0, 0, 0]],
  ['5+ people', 6, [3, 1, 4, 2, 1, 1, 1, 1], [2, 1, 1, 0, 1, 0]],
]
const CLIMATES: [string, number][] = [['Cold (40 °F / 4 °C)', 40], ['Moderate (55 °F / 13 °C)', 55], ['Warm (70 °F / 21 °C)', 70]]
const GAS_TANKLESS = [120000, 140000, 160000, 180000, 199000]
const ELEC_TANKLESS = [11, 18, 24, 27, 36]
const KWH_PER_THERM = 29.3071

export default function WaterHeaterSizer() {
  const [s, set, reset] = useToolState('water-heater-sizer', DEF)
  const us = s.units === 'us'
  const T = (f: number) => (us ? `${Math.round(f)} °F` : `${Math.round(fToC(f))} °C`)
  const dT = (f: number) => (us ? `${Math.round(f)} °F` : `${Math.round((f * 5) / 9)} K`)
  const V = (g: number, d = 0) => (us ? `${g.toFixed(d)} gal` : `${(g * L_PER_GAL).toFixed(d)} L`)
  const Q = (gpm: number) => (us ? `${gpm.toFixed(2)} gpm` : `${(gpm * L_PER_GAL).toFixed(1)} L/min`)
  const tempIn = (f: number) => (us ? f : Math.round(fToC(f) * 10) / 10)
  const tempOut = (v: number) => (us ? v : cToF(v))

  const tStore = s.storeHot ? 140 : s.tHot
  const rise = Math.max(1, s.tHot - s.tIn)
  const storeRise = Math.max(1, tStore - s.tIn)
  const boost = mixingBoost(tStore, s.tIn, s.tHot)
  const demand = peakHourDemand(s.acts, s.tUse, s.tIn, s.tHot)
  const flow = tanklessFlow(s.fixtures, s.tUse, s.tIn, s.tHot)
  const fuels: [Fuel, string][] = [['gas', 'Gas tank'], ['electric', 'Electric tank'], ['heatpump', 'Heat pump (HP-only mode)']]
  const rec = fuels.map(([f, name]) => ({ f, name, r: recommendTank(f, demand, storeRise, boost) }))
  const gasIn = inputBtuh(flow, rise, 0.93)
  const elec = electricTankless(flow, rise)
  const daily = s.people * s.galPerPerson
  const techs: { name: string; uef: number; fuel: 'gas' | 'el' }[] = [
    { name: 'Gas tank', uef: 0.62, fuel: 'gas' }, { name: 'Gas tankless', uef: 0.93, fuel: 'gas' },
    { name: 'Electric tank', uef: 0.92, fuel: 'el' }, { name: 'Electric tankless', uef: 0.98, fuel: 'el' }, { name: 'Heat pump', uef: 3.5, fuel: 'el' },
  ]
  const yearly = techs.map((t) => {
    const kwh = annualKwh(daily, rise, t.uef)
    return { ...t, kwh, cost: t.fuel === 'gas' ? (kwh / KWH_PER_THERM) * s.thermPrice : kwh * s.kwhPrice }
  })
  const editAct = (i: number, p: Partial<Activity>) => set({ acts: s.acts.map((a, j) => (j === i ? { ...a, ...p } : a)) })
  const editFx = (i: number, p: Partial<Fixture>) => set({ fixtures: s.fixtures.map((a, j) => (j === i ? { ...a, ...p } : a)) })

  return (
    <Split>
      <div>
        <Panel title="Household" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Seg<Units> value={s.units} onChange={(units) => set({ units })} options={[['us', 'US (gal, °F)'], ['metric', 'Metric (L, °C)']]} />
          <Row>
            {HOUSEHOLDS.map(([name, people, a, f]) => (
              <Btn key={name} kind="ghost" onClick={() => set({ people, acts: s.acts.map((x, i) => ({ ...x, count: a[i] ?? 0 })), fixtures: s.fixtures.map((x, i) => ({ ...x, count: f[i] ?? 0 })) })}>{name}</Btn>
            ))}
          </Row>
          <Row>
            <Num label="People" value={s.people} onChange={(people) => set({ people: Math.max(1, Math.round(people)) })} min={1} />
            <Num label="Hot water / person / day" value={Number((us ? s.galPerPerson : s.galPerPerson * L_PER_GAL).toFixed(1))} onChange={(v) => set({ galPerPerson: us ? v : v / L_PER_GAL })} unit={us ? 'gal' : 'L'} min={1} />
          </Row>
        </Panel>
        <Panel title="Temperatures">
          <Row>
            <Num label="Cold inlet (winter)" value={tempIn(s.tIn)} onChange={(v) => set({ tIn: tempOut(v) })} unit={us ? '°F' : '°C'} />
            <Num label="Heater setpoint" value={tempIn(s.tHot)} onChange={(v) => set({ tHot: tempOut(v) })} unit={us ? '°F' : '°C'} />
            <Num label="Shower / tap use" value={tempIn(s.tUse)} onChange={(v) => set({ tUse: tempOut(v) })} unit={us ? '°F' : '°C'} />
          </Row>
          <Row>
            {CLIMATES.map(([name, t]) => <Btn key={name} kind="ghost" onClick={() => set({ tIn: t })}>{name}</Btn>)}
          </Row>
          <Check label="Store at 140 °F / 60 °C with a thermostatic mixing valve (more usable volume, less Legionella risk)" value={s.storeHot} onChange={(storeHot) => set({ storeHot })} />
          {s.tHot - s.tIn < 20 && <Note tone="warn">Setpoint is barely above the inlet temperature — check the values.</Note>}
          {s.tUse > s.tHot && <Note tone="warn">Use temperature is above the setpoint; mixed fixtures will draw only hot water.</Note>}
        </Panel>
        <Panel title="Busiest hour (tank sizing)">
          <Table
            head={['Activity', 'Hot+cold per use', 'Uses / hr']}
            rows={s.acts.map((a, i) => [
              a.name,
              <input key="g" className="k-text" type="number" min={0} step="0.5" style={{ width: 80 }} value={Number((us ? a.gal : a.gal * L_PER_GAL).toFixed(1))} onChange={(e) => editAct(i, { gal: Math.max(0, Number(e.target.value) / (us ? 1 : L_PER_GAL)) })} aria-label={`${a.name} volume`} />,
              <input key="c" className="k-text" type="number" min={0} step={1} style={{ width: 70 }} value={a.count} onChange={(e) => editAct(i, { count: Math.max(0, Math.round(Number(e.target.value))) })} aria-label={`${a.name} count`} />,
            ])}
          />
        </Panel>
        <Panel title="Running at the same time (tankless sizing)">
          <Table
            head={['Fixture', 'Flow', 'At once']}
            rows={s.fixtures.map((x, i) => [
              x.name,
              <input key="g" className="k-text" type="number" min={0} step="0.1" style={{ width: 80 }} value={Number((us ? x.gpm : x.gpm * L_PER_GAL).toFixed(1))} onChange={(e) => editFx(i, { gpm: Math.max(0, Number(e.target.value) / (us ? 1 : L_PER_GAL)) })} aria-label={`${x.name} flow`} />,
              <input key="c" className="k-text" type="number" min={0} step={1} style={{ width: 70 }} value={x.count} onChange={(e) => editFx(i, { count: Math.max(0, Math.round(Number(e.target.value))) })} aria-label={`${x.name} count`} />,
            ])}
          />
          <p className="muted" style={{ margin: '6px 0 0', fontSize: 13 }}>Flows in {us ? 'gpm' : 'L/min'}. Showers and taps mix hot with cold, so only part of their flow passes through the heater.</p>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Peak-hour hot water" value={V(demand)} sub={`at ${T(s.tHot)} from the heater`} tone="accent" />
          <Stat label="Simultaneous hot flow" value={Q(flow)} sub="tankless requirement" />
          <Stat label="Temperature rise" value={dT(rise)} sub={`${T(s.tIn)} → ${T(s.tHot)}`} />
          <Stat label="Daily use" value={V(daily)} sub={`${s.people} people`} />
        </Stats>
        <Panel title="Recommended storage tank">
          <Table
            head={['Type', 'Smallest size that covers the peak hour', 'First-hour rating']}
            rows={rec.map(({ name, r }) => [name, r ? <b key="b">{V(r.gal)}</b> : <span key="n" style={{ color: 'var(--err)' }}>larger than {V(120)} — use two tanks or tankless</span>, r ? V(r.fhr) : '—'])}
          />
          <div style={{ marginTop: 10 }}>
            <BarChart
              height={210}
              fy={(v) => (us ? `${Math.round(v)}` : `${Math.round(v * L_PER_GAL)}`)}
              bars={TANK_SIZES.map((g) => ({ label: us ? `${g} gal` : `${Math.round(g * L_PER_GAL)} L`, value: firstHourRating(tankSpec('gas', g), storeRise, boost), color: firstHourRating(tankSpec('gas', g), storeRise, boost) >= demand ? '#10b981' : '#94a3b8' }))}
            />
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>Gas-tank first-hour rating by size ({us ? 'gal' : 'L'}); green bars cover your peak hour of {V(demand)}.</p>
          </div>
          {s.storeHot && <Note tone="ok">Storing at 140 °F and mixing down to {T(s.tHot)} makes each stored gallon go {(boost * 100 - 100).toFixed(0)}% further.</Note>}
        </Panel>
        <Panel title="Tankless (on-demand)">
          <Table
            head={['Option', 'Needed for your flow', 'Fits?']}
            rows={[
              ['Gas, condensing (93 %)', `${Math.round(gasIn / 1000)}k BTU/h input`, (() => {
                const m = GAS_TANKLESS.find((b) => maxFlow(b, rise, 0.93) >= flow)
                return m ? `${m / 1000}k BTU/h unit → ${Q(maxFlow(m, rise, 0.93))} max` : 'needs two units'
              })()],
              ['Electric', `${elec.kw.toFixed(1)} kW · ${Math.ceil(elec.amps)} A at 240 V`, (() => {
                const m = ELEC_TANKLESS.find((k) => maxFlow(k * 3412.14, rise, 0.99) >= flow)
                return m ? `${m} kW unit → ${Q(maxFlow(m * 3412.14, rise, 0.99))} max` : 'beyond typical whole-house units'
              })()],
            ]}
          />
          {elec.amps > 150 && <Note tone="warn">An electric tankless this large needs {Math.ceil(elec.amps)} A — more than many homes’ entire service.</Note>}
          <p className="muted" style={{ margin: '6px 0 0', fontSize: 13 }}>Size tankless units for the coldest month: flow capacity falls as the inlet water gets colder.</p>
        </Panel>
        <Panel title="Yearly energy and cost">
          <Row>
            <Num label="Electricity" value={s.kwhPrice} onChange={(kwhPrice) => set({ kwhPrice })} unit="/kWh" min={0} />
            <Num label="Gas" value={s.thermPrice} onChange={(thermPrice) => set({ thermPrice })} unit="/therm" min={0} hint="1 therm ≈ 2.83 m³ natural gas" />
          </Row>
          <BarChart height={200} fy={(v) => money(v, '$', 0)} bars={yearly.map((y, i) => ({ label: y.name, value: y.cost, color: ['#f59e0b', '#f97316', '#0ea5e9', '#6366f1', '#10b981'][i] }))} />
          <Table head={['Technology', 'UEF', 'Energy / year', 'Cost / year']} rows={yearly.map((y) => [y.name, y.uef.toFixed(2), `${Math.round(y.kwh).toLocaleString()} kWh`, money(y.cost, '$', 0)])} />
        </Panel>
        <Note>Planning values only. First-hour rating is approximated as 70 % of the tank plus one hour of recovery; check the FHR / max-flow on the actual product label and local code (venting, expansion tank, T&P valve, breaker size).</Note>
      </div>
    </Split>
  )
}
