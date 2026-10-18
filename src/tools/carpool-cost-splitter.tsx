import { BarChart, Btn, Check, CopyButton, CsvButton, JsonButtons, money, Note, Num, Panel, Row, Seg, Select, Split, Stat, Stats, Table, color, num, uid, useToolState } from '../kit'
import { costPerDist, splitWeek, type Leg, type Method, type Person } from './lib/carpool-cost-splitter'

interface State {
  unit: 'km' | 'mi'
  econUnit: 'l100' | 'mpg'
  econ: number
  fuel: number
  wear: number
  parking: number
  roundTrip: boolean
  includeDriver: boolean
  method: Method
  cur: string
  start: string
  legs: Leg[]
  people: Person[]
  weeks: number
}

const ALL = [true, true, true, true, true]
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
const DEF: State = {
  unit: 'km', econUnit: 'l100', econ: 7.2, fuel: 1.79, wear: 0.06, parking: 12, roundTrip: true, includeDriver: true, method: 'legs', cur: '$', start: "Maria's home",
  legs: [
    { to: "Ben's street", dist: 4.5, toll: 0 },
    { to: 'Park & ride (Chloe)', dist: 6, toll: 0 },
    { to: 'Office', dist: 18, toll: 2.5 },
  ],
  people: [
    { id: 'maria', name: 'Maria (driver)', board: 0, days: ALL, driver: true },
    { id: 'ben', name: 'Ben', board: 1, days: ALL },
    { id: 'chloe', name: 'Chloe', board: 2, days: [true, true, false, true, false] },
  ],
  weeks: 4.33,
}

const METHODS: [Method, string, string][] = [
  ['legs', 'Shared legs (fairest)', 'Each stretch of road is split among the people in the car on it, so nobody pays for kilometres before they were picked up.'],
  ['distance', 'By distance ridden', 'Everyone pays in proportion to how far they rode. Simple and close to fair.'],
  ['equal', 'Equal split', 'Each day’s cost is divided equally among everyone in the car.'],
]

export default function CarpoolCostSplitter() {
  const [s, set, reset] = useToolState('carpool-cost-splitter', DEF)
  const m = (x: number) => money(x, s.cur)
  const rate = costPerDist(s.unit, s.econ, s.econUnit, s.fuel, s.wear)
  const week = splitWeek(s.legs, s.people, rate, s.roundTrip, s.parking, s.method, s.includeDriver)
  const compare = METHODS.map(([k]) => [k, splitWeek(s.legs, s.people, rate, s.roundTrip, s.parking, k, s.includeDriver)] as const)
  const driver = s.people.find((p) => p.driver)
  const routeDist = s.legs.reduce((a, l) => a + Math.max(0, l.dist), 0) * (s.roundTrip ? 2 : 1)
  const driveDays = driver ? driver.days.filter(Boolean).length : 0
  const soloCost = (p: Person) => s.legs.reduce((a, l, i) => a + (p.driver || i >= p.board ? Math.max(0, l.dist) * rate + l.toll : 0), 0) * (s.roundTrip ? 2 : 1) + s.parking
  const editLeg = (i: number, p: Partial<Leg>) => set({ legs: s.legs.map((l, j) => (j === i ? { ...l, ...p } : l)) })
  const editP = (id: string, p: Partial<Person>) => set({ people: s.people.map((x) => (x.id === id ? { ...x, ...p } : x)) })
  const stops = [s.start, ...s.legs.map((l) => l.to)]
  const message = () => [
    `Carpool costs for the week (${METHODS.find((x) => x[0] === s.method)![1].toLowerCase()}):`,
    ...s.people.filter((p) => !p.driver).map((p) => `• ${p.name}: ${m(week.owed[p.id] ?? 0)} (${p.days.filter(Boolean).length} days)`),
    driver ? `Please pay ${driver.name.replace(/\s*\(driver\)/i, '')}. Total trip cost ${m(week.total)}.` : '',
  ].join('\n')

  return (
    <div>
      <Stats>
        <Stat label="Weekly trip cost" value={m(week.total)} sub={`${driveDays} driving days · ${num(routeDist * driveDays, 0)} ${s.unit}`} />
        <Stat label={`Cost per ${s.unit}`} value={m(rate)} sub="fuel + wear" />
        <Stat label="Driver is reimbursed" value={m(Object.values(week.owed).reduce((a, b) => a + b, 0))} sub="per week" tone="good" />
        <Stat label="Per month" value={m(week.total * s.weeks)} sub={`× ${s.weeks} weeks`} />
      </Stats>
      <Split wide="right">
        <div>
          <Panel title="Car & costs" actions={<Seg value={s.unit} onChange={(unit) => set({ unit, econUnit: unit === 'mi' ? 'mpg' : 'l100' })} options={[['km', 'km'], ['mi', 'miles']]} />}>
            <Row>
              <Num label="Fuel economy" value={s.econ} unit={s.econUnit === 'l100' ? 'L/100 km' : 'MPG'} min={0.1} onChange={(econ) => econ > 0 && set({ econ })} />
              <Select label="Economy unit" value={s.econUnit} onChange={(econUnit) => set({ econUnit })} options={[['l100', 'L/100 km'], ['mpg', 'US MPG']]} />
            </Row>
            <Row>
              <Num label={`Fuel price per ${s.econUnit === 'l100' ? 'litre' : 'gallon'}`} value={s.fuel} unit={s.cur} min={0} onChange={(fuel) => fuel >= 0 && set({ fuel })} />
              <Num label={`Wear & tear per ${s.unit}`} value={s.wear} unit={s.cur} min={0} onChange={(wear) => wear >= 0 && set({ wear })} />
            </Row>
            <Row>
              <Num label="Parking per day" value={s.parking} unit={s.cur} min={0} onChange={(parking) => parking >= 0 && set({ parking })} />
              <Select label="Currency" value={s.cur} onChange={(cur) => set({ cur })} options={['$', '€', '£', '₴', 'zł', 'CHF ']} />
            </Row>
            <Check label="Round trip (same people both ways)" value={s.roundTrip} onChange={(roundTrip) => set({ roundTrip })} />
            <Check label="Driver pays a share too" value={s.includeDriver} onChange={(includeDriver) => set({ includeDriver })} />
            <p className="muted" style={{ fontSize: 12 }}>Wear & tear covers tyres, maintenance and depreciation — typical values are {s.unit === 'km' ? '0.05–0.12 per km' : '0.08–0.20 per mile'}. Leave it 0 to split fuel only.</p>
          </Panel>
          <Panel title="Route" actions={<Btn onClick={() => set({ legs: [...s.legs.slice(0, -1), { to: 'New stop', dist: 3, toll: 0 }, ...s.legs.slice(-1)] })}>+ Stop</Btn>}>
            <input className="k-text" value={s.start} onChange={(e) => set({ start: e.target.value })} aria-label="Start" style={{ width: '100%', fontWeight: 700 }} />
            {s.legs.map((l, i) => (
              <div key={i} style={{ borderLeft: '3px solid var(--accent)', marginLeft: 8, padding: '6px 0 6px 12px' }}>
                <Row wrap={false}>
                  <span className="muted" style={{ fontSize: 13, whiteSpace: 'nowrap' }}>↓</span>
                  <input type="number" min={0} value={l.dist} onChange={(e) => editLeg(i, { dist: Math.max(0, Number(e.target.value) || 0) })} aria-label="Leg distance" style={{ width: 70 }} className="k-text" />
                  <span className="muted" style={{ fontSize: 13 }}>{s.unit}</span>
                  <input type="number" min={0} value={l.toll} onChange={(e) => editLeg(i, { toll: Math.max(0, Number(e.target.value) || 0) })} aria-label="Toll" style={{ width: 64 }} className="k-text" />
                  <span className="muted" style={{ fontSize: 13 }}>toll</span>
                </Row>
                <Row wrap={false}>
                  <input className="k-text" value={l.to} onChange={(e) => editLeg(i, { to: e.target.value })} aria-label="Stop name" style={{ flex: 1, fontWeight: 600 }} />
                  {s.legs.length > 1 && <Btn kind="ghost" title="Remove stop" onClick={() => set({ legs: s.legs.filter((_, j) => j !== i), people: s.people.map((p) => ({ ...p, board: p.board > i ? p.board - 1 : p.board })) })}>✕</Btn>}
                </Row>
              </div>
            ))}
            <p className="muted" style={{ fontSize: 12 }}>Legs run from the driver's home to the shared destination. Riders board at a stop; everyone gets out at the last stop{s.roundTrip ? ' and rides home the same way' : ''}.</p>
          </Panel>
        </div>
        <div>
          <Panel
            title="People"
            actions={
              <>
                <Btn onClick={() => set({ people: [...s.people, { id: uid(), name: `Rider ${s.people.length}`, board: 0, days: ALL }] })}>+ Rider</Btn>
                <JsonButtons name="carpool.json" data={s} onLoad={(d) => set(d)} />
                <Btn kind="ghost" onClick={reset}>Reset</Btn>
              </>
            }
          >
            <Table
              head={['Name', 'Gets in at', ...DAYS, '']}
              rows={s.people.map((p) => [
                <input key="n" className="k-text" value={p.name} onChange={(e) => editP(p.id, { name: e.target.value })} aria-label="Name" style={{ width: 130 }} />,
                p.driver ? <b key="b">drives 🚗</b> : (
                  <select key="b" className="k-select" style={{ minWidth: 150 }} value={p.board} onChange={(e) => editP(p.id, { board: Number(e.target.value) })} aria-label="Boards at">
                    {stops.slice(0, -1).map((st, i) => <option key={i} value={i}>{st}</option>)}
                  </select>
                ),
                ...DAYS.map((d, i) => <input key={d} type="checkbox" checked={p.days[i]} onChange={(e) => editP(p.id, { days: p.days.map((x, j) => (j === i ? e.target.checked : x)) })} aria-label={`${p.name} rides ${d}`} />),
                p.driver ? '' : <Btn key="x" kind="ghost" title="Remove" onClick={() => set({ people: s.people.filter((x) => x.id !== p.id) })}>✕</Btn>,
              ])}
            />
          </Panel>
          <Panel title="Split method">
            <Seg value={s.method} onChange={(method) => set({ method })} options={METHODS.map(([k, l]) => [k, l] as [Method, string])} />
            <p className="muted" style={{ fontSize: 13 }}>{METHODS.find((x) => x[0] === s.method)![2]}</p>
            <Table
              head={['Person', ...METHODS.map(([, l]) => l.replace(' (fairest)', '')), 'Driving alone', 'Saves']}
              rows={s.people.map((p) => {
                const mine = week.perPerson[p.id] ?? 0
                const alone = soloCost(p) * p.days.filter(Boolean).length
                return [
                  <b key="n">{p.name}</b>,
                  ...compare.map(([k, w]) => <span key={k} style={{ fontWeight: k === s.method ? 800 : 400, color: k === s.method ? 'var(--accent)' : undefined }}>{m(w.perPerson[p.id] ?? 0)}</span>),
                  m(alone),
                  <span key="s" style={{ color: 'var(--ok)' }}>{m(alone - mine)}</span>,
                ]
              })}
              foot={['Total / week', ...compare.map(([, w]) => m(Object.values(w.perPerson).reduce((a, b) => a + b, 0))), '', '']}
            />
            <p className="muted" style={{ fontSize: 12 }}>“Driving alone” = what each person would pay to drive their own share of the route alone on the days they ride (rough comparison).</p>
          </Panel>
          <Panel
            title="Weekly summary"
            actions={
              <>
                <CopyButton text={message} label="Copy message" />
                <CsvButton name="carpool-week.csv" rows={() => [['Person', ...DAYS, 'Week', 'Month'], ...s.people.map((p) => [p.name, ...week.days.map((d) => +(d.share[p.id] ?? 0).toFixed(2)), +week.perPerson[p.id].toFixed(2), +(week.perPerson[p.id] * s.weeks).toFixed(2)])]} />
              </>
            }
          >
            <BarChart
              bars={DAYS.map((d, i) => ({ label: d, value: s.people.map((p) => week.days[i].share[p.id] ?? 0) }))}
              stacks={s.people.map((p, i) => ({ name: p.name, color: color(i) }))}
              fy={(v) => m(v)}
              height={200}
            />
            <Table
              head={['Person', ...DAYS, 'Week', 'Month']}
              rows={s.people.map((p) => [p.name, ...week.days.map((d, i) => (d.share[p.id] === undefined ? <span key={i} className="muted">—</span> : m(d.share[p.id]))), <b key="w">{m(week.perPerson[p.id])}</b>, m(week.perPerson[p.id] * s.weeks)])}
              foot={['Day total', ...week.days.map((d) => m(d.total)), m(week.total), m(week.total * s.weeks)]}
            />
            <Row>
              <Num label="Weeks per month" value={s.weeks} min={1} max={5} onChange={(weeks) => weeks > 0 && set({ weeks })} />
            </Row>
            {driver && (
              <Note tone="ok">
                Settle up: {s.people.filter((p) => !p.driver && (week.owed[p.id] ?? 0) > 0).map((p) => `${p.name} pays ${m(week.owed[p.id])}`).join(' · ') || 'nobody owes anything'} → {driver.name}.
              </Note>
            )}
          </Panel>
        </div>
      </Split>
    </div>
  )
}
